"""Pack a prepared public context; never launch QEMU/SSH or attest guest safety.

Only --pack ABS_PREPARED_ROOT is accepted. Docker is always the managed socket.
Containers/images are fresh, labelled and removed by exact owned IDs. No host
mount, device, privilege, Docker context directory, key or environment is copied.
Preparation checks the host-only controller keypair; no private bytes or key FD
reach Docker. Packing does not authenticate SSH or attest the resulting image.
"""

from contextlib import contextmanager, ExitStack
import base64
import importlib.util
import io
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import struct
import subprocess
import sys
import tarfile
import time
import uuid


def _module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


preparation = _module("native_vm_provision", "native-vm-provision.py")
guard = _module("native_vm_launch", "native-vm-launch.py")
Refused = guard.Refused
MIB = 1024 * 1024
GIB = 1024 * MIB
EXPORT_LIMIT = 6 * GIB
DISK_SIZE = 6 * GIB
ARCHIVE_LIMIT = DISK_SIZE + 512 * MIB
LOG_LIMIT = MIB
ZERO_CHUNK = bytes(65536)
ID = re.compile(rb"[0-9a-f]{64}\n?\Z")
ARTIFACTS = {"vmlinuz": 64 * MIB, "initrd.img": 384 * MIB,
             "root.ext4": DISK_SIZE, "ssh_host_ed25519_key.pub": 256}
SELECTORS = ("DOCKER_HOST", "DOCKER_CONTEXT", "DOCKER_TLS", "DOCKER_TLS_VERIFY", "DOCKER_CERT_PATH")
CLIENT_ENV = ("HOME", "DOCKER_CONFIG", "HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY",
              "http_proxy", "https_proxy", "all_proxy", "no_proxy", "ftp_proxy", "SSL_CERT_FILE",
              "SSL_CERT_DIR", "CURL_CA_BUNDLE", "REQUESTS_CA_BUNDLE")
PROXIES = ("HTTP_PROXY", "HTTPS_PROXY", "ALL_PROXY", "NO_PROXY", "FTP_PROXY",
           "http_proxy", "https_proxy", "all_proxy", "no_proxy", "ftp_proxy")
DOCKER_CLIENTS = ("/usr/local/bin/docker", "/usr/bin/docker")


def _docker_client():
    # Explicit provider-managed and ordinary Ubuntu paths only; PATH, config,
    # caller arguments and Docker contexts never select the executable.
    for candidate in DOCKER_CLIENTS:
        try:
            fd = guard._open_absolute(candidate)
        except FileNotFoundError:
            continue
        try:
            node = os.fstat(fd)
            mode = stat.S_IMODE(node.st_mode)
            if (not stat.S_ISREG(node.st_mode)
                    or node.st_nlink != 1 or node.st_size <= 0 or mode & 0o7022
                    or not mode & 0o111):
                raise Refused()
        finally:
            os.close(fd)
        # Fixed system-tree capability: platform tool ownership can differ from
        # both root and the task UID. Never apply guest/auth ownership rules here.
        return candidate
    raise Refused()


def _tar(files):
    stream = io.BytesIO()
    with tarfile.open(fileobj=stream, mode="w", format=tarfile.USTAR_FORMAT) as archive:
        for name, raw in files.items():
            entry = tarfile.TarInfo(name)
            entry.size, entry.mode = len(raw), 0o600
            archive.addfile(entry, io.BytesIO(raw))
    return stream.getvalue()


def _stop(process):
    if process.returncode is not None:
        return  # Already reaped: never signal a possibly reused process group ID.
    old = {number: signal.signal(number, signal.SIG_IGN)
           for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        try:
            os.killpg(process.pid, signal.SIGTERM)
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                os.killpg(process.pid, signal.SIGKILL)
            except ProcessLookupError:
                pass
            process.wait(timeout=5)
    finally:
        for number, handler in old.items():
            signal.signal(number, handler)


def _spawn_owned(spawn, args, **kwargs):
    # Record interruption during Popen rather than inheriting a blocked signal
    # mask into Docker. Restore/raise only AFTER caller captures process ownership.
    caught = []
    def interrupted(number, _frame):
        caught.append(number)
    old = {number: signal.signal(number, interrupted)
           for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        return spawn(args, **kwargs), (old, caught)
    except BaseException:
        for number, handler in old.items():
            signal.signal(number, handler)
        raise


def _restore(protection):
    old, caught = protection
    for number, handler in old.items():
        signal.signal(number, handler)
    # Cleanup deliberately ignores repeated cancellation. Installing a temporary
    # Python handler still ensures exec children don't inherit SIG_IGN, but those
    # ignored parent signals must not become a new interruption after spawn.
    if any(old[number] != signal.SIG_IGN for number in caught):
        raise Refused()


class Reader:
    """Bounded process output, draining diagnostics without exposing their bytes."""

    def __init__(self, process, limit, timeout):
        self.process, self.limit = process, limit
        self.deadline = time.monotonic() + timeout
        self.total = self.errors = 0
        self.selector = selectors.DefaultSelector()
        self.selector.register(process.stdout, selectors.EVENT_READ, "out")
        self.selector.register(process.stderr, selectors.EVENT_READ, "err")
        self.eof = False

    def read(self, size=-1):
        if size < 0:
            raise Refused()
        if self.eof or size == 0:
            return b""
        while True:
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise Refused()
            events = self.selector.select(remaining)
            if not events:
                raise Refused()
            for key, _ in events:
                chunk = os.read(key.fileobj.fileno(), min(max(size, 1), 65536))
                if not chunk:
                    self.selector.unregister(key.fileobj)
                    if key.data == "out":
                        self.eof = True
                        return b""
                elif key.data == "err":
                    self.errors += len(chunk)
                    if self.errors > LOG_LIMIT:
                        raise Refused()
                else:
                    self.total += len(chunk)
                    if self.total > self.limit:
                        raise Refused()
                    return chunk

    def finish(self):
        while not self.eof:
            self.read(65536)
        while self.selector.get_map():
            remaining = self.deadline - time.monotonic()
            if remaining <= 0:
                raise Refused()
            events = self.selector.select(remaining)
            if not events:
                raise Refused()
            for key, _ in events:
                raw = os.read(key.fileobj.fileno(), 65536)
                if not raw:
                    self.selector.unregister(key.fileobj)
                else:
                    self.errors += len(raw)
                    if self.errors > LOG_LIMIT:
                        raise Refused()
        remaining = self.deadline - time.monotonic()
        if remaining <= 0 or self.process.wait(timeout=remaining) != 0:
            raise Refused()

    def close(self):
        self.selector.close()


class Docker:
    def __init__(self):
        self.client = _docker_client()
        self.env = {key: os.environ[key] for key in CLIENT_ENV if key in os.environ}
        self.env.update(PATH="/usr/bin:/bin", LANG="C", LC_ALL="C")
        self.token = uuid.uuid4().hex
        self.label = "pn.native-pack=" + self.token
        self.containers = []
        self.image = "pn-native-pack:" + self.token
        self.image_requested = False

    def spawn(self, args, **kwargs):
        return subprocess.Popen([self.client, "--host=unix:///var/run/docker.sock", *args],
                                env=self.env, cwd="/", close_fds=True,
                                start_new_session=True, **kwargs)

    @contextmanager
    def stream(self, args, *, limit=LOG_LIMIT, timeout=120, stdin=None):
        process = reader = None
        deadline = time.monotonic() + timeout
        try:
            process, mask = _spawn_owned(self.spawn, args,
                                         stdin=subprocess.DEVNULL if stdin is None else stdin,
                                         stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            _restore(mask)
            reader = Reader(process, limit, timeout)
            reader.deadline = deadline
            yield reader
            reader.finish()
        finally:
            if reader is not None:
                reader.close()
            if process is not None:
                _stop(process)
                process.stdout.close()
                process.stderr.close()

    def run(self, args, *, data=None, timeout=120, limit=LOG_LIMIT):
        # Small fixed input only; anonymous regular file avoids pipe backpressure.
        # Export and artifact tar streams never use this in-memory interface.
        import tempfile
        with tempfile.TemporaryFile() as source:
            if data is not None:
                if len(data) > LOG_LIMIT:
                    raise Refused()
                source.write(data)
                source.seek(0)
            with self.stream(args, limit=limit, timeout=timeout,
                             stdin=source if data is not None else None) as reader:
                result = bytearray()
                while raw := reader.read(65536):
                    result.extend(raw)
                return bytes(result)

    def create(self, *command):
        name = "pn-native-pack-" + self.token + "-" + str(len(self.containers))
        # Reserve the exact name before daemon execution: lost CLI acknowledgement
        # must still leave an owned object discoverable for label-checked cleanup.
        self.containers.append(name)
        empty_proxies = [part for key in PROXIES for part in ("--env", key + "=")]
        raw = self.run(["create", "--name", name, "--label", self.label, "--network", "none",
                        "--interactive", *empty_proxies,
                        "--entrypoint", "/bin/bash", self.image, *command])
        if not ID.fullmatch(raw):
            raise Refused()
        identifier = raw.decode("ascii").strip()
        return identifier

    def export_into(self, builder, packer):
        # Relay bounded chunks with bounded pending memory. No host tar/root tree.
        processes = []
        deadline = time.monotonic() + 600
        total = diagnostics = 0
        pending = bytearray()
        source_open = True
        try:
            producer, mask = _spawn_owned(self.spawn, ["export", builder], stdin=subprocess.DEVNULL,
                                          stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            processes.append(producer)
            _restore(mask)
            consumer, mask = _spawn_owned(self.spawn, ["start", "--attach", "--interactive", packer],
                                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
            processes.append(consumer)
            _restore(mask)
            with selectors.DefaultSelector() as poll:
                for stream, tag in ((producer.stdout, "source"), (producer.stderr, "log"),
                                    (consumer.stdout, "log"), (consumer.stderr, "log")):
                    os.set_blocking(stream.fileno(), False)
                    poll.register(stream, selectors.EVENT_READ, tag)
                os.set_blocking(consumer.stdin.fileno(), False)
                while poll.get_map():
                    if time.monotonic() >= deadline:
                        raise Refused()
                    if consumer.poll() is not None and consumer.returncode != 0:
                        raise Refused()
                    events = poll.select(min(1, deadline - time.monotonic()))
                    for key, _ in events:
                        if key.data == "sink":
                            count = os.write(consumer.stdin.fileno(), pending)
                            del pending[:count]
                            if not pending:
                                poll.unregister(consumer.stdin)
                                if source_open:
                                    poll.register(producer.stdout, selectors.EVENT_READ, "source")
                                else:
                                    consumer.stdin.close()
                        else:
                            raw = os.read(key.fileobj.fileno(), 65536)
                            if not raw:
                                poll.unregister(key.fileobj)
                                if key.data == "source":
                                    source_open = False
                                    if not pending:
                                        consumer.stdin.close()
                            elif key.data == "source":
                                total += len(raw)
                                if total > EXPORT_LIMIT:
                                    raise Refused()
                                pending.extend(raw)
                                poll.unregister(producer.stdout)
                                poll.register(consumer.stdin, selectors.EVENT_WRITE, "sink")
                            else:
                                diagnostics += len(raw)
                                if diagnostics > LOG_LIMIT:
                                    raise Refused()
                for process in processes:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or process.wait(timeout=remaining) != 0:
                        raise Refused()
        finally:
            for process in processes:
                _stop(process)
                for stream in (process.stdin, process.stdout, process.stderr):
                    if stream is not None and not stream.closed:
                        stream.close()

    def _cleanup(self):
        failed = False
        for identifier in reversed(self.containers):
            try:
                token = self.run(["container", "inspect", "--format",
                                  '{{.Id}} {{index .Config.Labels "pn.native-pack"}}', identifier], timeout=30)
                match = re.fullmatch(rb"([0-9a-f]{64}) " + self.token.encode() + rb"\n", token)
                if match is None:
                    raise Refused()
                self.run(["rm", "--force", match[1].decode("ascii")], timeout=30)
            except Exception:
                failed = True
        if self.image_requested:
            try:
                token = self.run(["image", "inspect", "--format",
                                  '{{.Id}} {{index .Config.Labels "pn.native-pack"}}', self.image], timeout=30)
                match = re.fullmatch(rb"(sha256:[0-9a-f]{64}) " + self.token.encode() + rb"\n", token)
                if match is None:
                    raise Refused()
                self.run(["image", "rm", match[1].decode("ascii")], timeout=30)
            except Exception:
                failed = True
        if failed:
            raise Refused()

    def cleanup(self):
        old = {number: signal.signal(number, signal.SIG_IGN)
               for number in (signal.SIGINT, signal.SIGTERM)}
        try:
            self._cleanup()
        finally:
            for number, handler in old.items():
                signal.signal(number, handler)


def _public(raw):
    parts = raw.rstrip(b"\n").split(b" ")
    if (len(raw) > 256 or not raw.endswith(b"\n") or raw.count(b"\n") != 1
            or len(parts) != 3 or parts[0] != b"ssh-ed25519" or parts[2] != b"pn-native-guest"):
        raise Refused()
    blob = base64.b64decode(parts[1], validate=True)
    if (len(blob) != 51 or blob[:19] != struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32)
            or base64.b64encode(blob) != parts[1]):
        raise Refused()
    return b"[127.0.0.1]:2227 ssh-ed25519 " + parts[1] + b"\n"


def _write(fd, name, raw):
    target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                     0o600, dir_fd=fd)
    try:
        remaining = memoryview(raw)
        while remaining:
            count = os.write(target, remaining)
            if count <= 0:
                raise Refused()
            remaining = remaining[count:]
    finally:
        os.close(target)


def _exact(reader, size):
    result = bytearray()
    while len(result) < size:
        raw = reader.read(min(65536, size - len(result)))
        if not raw:
            raise Refused()
        result.extend(raw)
    return bytes(result)


def _number(raw):
    if raw[0] == 128:  # Positive base256, including >8GiB raw disks.
        return int.from_bytes(raw[1:], "big")
    value = raw.rstrip(b"\0 ").lstrip(b" ")
    if not value or not re.fullmatch(rb"[0-7]+", value):
        raise Refused()
    return int(value, 8)


def _pax(raw):
    # Docker can emit small PAX timestamp records even for fixed short names.
    # Parse <=4096 bytes ourselves; tarfile's unbounded extended-header parser
    # never sees output from a container. No path/link/sparse/xattr overrides.
    result = {}
    while raw:
        length, separator, _rest = raw.partition(b" ")
        if not separator or not re.fullmatch(rb"[1-9][0-9]{0,3}", length):
            raise Refused()
        count = int(length)
        if count > len(raw) or count <= len(length) + 3 or raw[count - 1:count] != b"\n":
            raise Refused()
        key, separator, value = raw[len(length) + 1:count - 1].partition(b"=")
        if (not separator or key not in (b"size", b"mtime", b"atime", b"ctime") or key in result
                or not re.fullmatch(rb"[0-9]{1,12}(?:\.[0-9]{1,9})?", value)
                or (key == b"size" and b"." in value)):
            raise Refused()
        result[key] = value
        raw = raw[count:]
    return result


def _extract(reader, guest_fd):
    seen = set()
    public = None
    pax = None
    while True:
        header = _exact(reader, 512)
        if header == b"\0" * 512:
            if pax is not None or _exact(reader, 512) != header:
                raise Refused()
            # Only bounded zero padding after the two end records.
            padding = 0
            while raw := reader.read(65536):
                padding += len(raw)
                if any(raw) or padding > 10240:
                    raise Refused()
            break
        checksum = sum(header[:148]) + 8 * 32 + sum(header[156:])
        if _number(header[148:156]) != checksum:
            raise Refused()
        if header[257:263] not in (b"ustar\0", b"ustar ") or any(header[345:500]):
            raise Refused()
        size = _number(header[124:136])
        kind = header[156:157]
        if kind == b"x":
            if pax is not None or not 0 < size <= 4096:
                raise Refused()
            pax = _pax(_exact(reader, size))
            if any(_exact(reader, (-size) % 512)):
                raise Refused()
            continue
        raw_name, _null, after_name = header[:100].partition(b"\0")
        if any(after_name) or any(header[157:257]):
            raise Refused()
        name = raw_name.decode("ascii")
        if pax is not None:
            if b"size" in pax:
                size = int(pax[b"size"])
            pax = None
        if name in (".", "./") and kind == b"5" and size == 0 and "." not in seen:
            seen.add(".")
            continue
        name = name.removeprefix("./")
        if (name not in ARTIFACTS or name in seen or kind not in (b"0", b"\0")
                or not 0 < size <= ARTIFACTS[name]
                or (name == "root.ext4" and size != DISK_SIZE)):
            raise Refused()
        seen.add(name)
        target = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW | os.O_CLOEXEC,
                         0o600, dir_fd=guest_fd)
        try:
            remaining = size
            captured = bytearray()
            while remaining:
                raw = _exact(reader, min(65536, remaining))
                remaining -= len(raw)
                if name == "ssh_host_ed25519_key.pub":
                    captured.extend(raw)
                # Preserve sparse raw disk without allocating six GiB of zeros.
                zeros = ZERO_CHUNK if len(raw) == len(ZERO_CHUNK) else ZERO_CHUNK[:len(raw)]
                if name == "root.ext4" and raw == zeros:
                    os.lseek(target, len(raw), os.SEEK_CUR)
                else:
                    view = memoryview(raw)
                    while view:
                        count = os.write(target, view)
                        if count <= 0:
                            raise Refused()
                        view = view[count:]
            os.ftruncate(target, size)
            if name == "ssh_host_ed25519_key.pub":
                public = _public(bytes(captured))
        finally:
            os.close(target)
        if any(_exact(reader, (-size) % 512)):
            raise Refused()
    if seen - {"."} != set(ARTIFACTS) or public is None:
        raise Refused()
    return public


def pack(root_path, docker=None):
    profile, context = preparation.prepared_profile_context(root_path)
    script_fd = guard._open_absolute(str(Path(__file__).with_name("native-guest").joinpath("pack.sh")))
    try:
        if guard._regular(script_fd).st_size > 16384:
            raise Refused()
        script = os.read(script_fd, 16385)
        if not script or len(script) > 16384:
            raise Refused()
    finally:
        os.close(script_fd)
    # Keep directory identities pinned through packing; no path-based extraction.
    with ExitStack() as stack:
        root_fd = guard._root(root_path, stack)
        guest_fd = guard._root(root_path + "/guest", stack)
        auth_fd = guard._root(root_path + "/auth", stack)
        runtime_fd = guard._root(root_path + "/runtime", stack)
        if os.listdir(guest_fd) or os.listdir(runtime_fd):
            raise Refused()
        docker = Docker() if docker is None else docker
        # BuildX defaults to mutable HOME state, which is read-only on managed
        # hosts. This NEW private sibling is never a context or guest input.
        # Keep it on failure; preparation refuses any contaminated/preexisting root.
        os.mkdir("client-state", mode=0o700, dir_fd=root_fd)
        state_path = root_path + "/client-state"
        state_fd = guard._root(state_path, stack)
        if os.listdir(state_fd):
            raise Refused()
        docker.env["BUILDX_CONFIG"] = state_path
        try:
            docker.image_requested = True
            docker.run(["build", "--force-rm", "--label", docker.label, "--tag", docker.image, "-"],
                       data=_tar(context), timeout=1200)
            builder = docker.create("/opt/native-fixture/configure.sh")
            docker.run(["start", "--attach", builder], timeout=120)
            packer = docker.create("/native-pack.sh", profile)
            docker.run(["cp", "-", packer + ":/"], data=_tar({"native-pack.sh": script}))
            docker.export_into(builder, packer)
            with docker.stream(["cp", packer + ":/native-output/.", "-"],
                               limit=ARCHIVE_LIMIT, timeout=600) as reader:
                known_hosts = _extract(reader, guest_fd)
        finally:
            docker.cleanup()
        # No launchable configuration before complete packing and resource cleanup.
        _write(auth_fd, "known_hosts", known_hosts)
        config = {"version": 1, "guest_root": root_path + "/guest",
                  "auth_root": root_path + "/auth", "runtime_root": root_path + "/runtime",
                  "kernel": "vmlinuz", "initrd": "initrd.img", "disk": "root.ext4",
                  "ssh_key": "controller_ed25519", "ssh_port": 2227}
        _write(root_fd, "launch.json", (json.dumps(config, sort_keys=True) + "\n").encode())


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2 or args[0] != "--pack":
        print("NATIVE_VM_PACK_REFUSED")
        return 2
    old = {}
    def interrupted(_number, _frame):
        raise Refused()
    try:
        for number in (signal.SIGTERM, signal.SIGINT):
            old[number] = signal.signal(number, interrupted)
        pack(args[1])
    except (Exception, KeyboardInterrupt):
        print("NATIVE_VM_PACK_REFUSED")
        return 2
    finally:
        for number, handler in old.items():
            signal.signal(number, handler)
    print("NATIVE_VM_PACKED_NOT_LAUNCHED")
    return 0


if __name__ == "__main__":
    sys.exit(main())
