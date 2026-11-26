"""Prepare public build inputs and a fresh host-only controller identity.

Usage: --prepare /owned-0700-parent/FRESH-name. Existing paths always refuse;
failed partial roots are retained and must never be treated as prepared images.
Only fixed system ssh-keygen runs here. No Docker/build/container/export/packer,
guest launch or SSH transfer is implemented or invoked by this preparation slice.
The resulting context is not launch-ready. Never upload auth or guest-image roots.
"""

import base64
from contextlib import ExitStack
import hashlib
import json
import os
from pathlib import Path, PurePosixPath
import re
import selectors
import signal
import stat
import struct
import subprocess
import sys
import time
from types import MappingProxyType

BASE = "ubuntu@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8"
ENV = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
FLAGS = os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
COMMENT = b"pn-native-fixture"
CONTEXT = ("Dockerfile", "configure.sh", "controller.pub")
DEFERRED = ["container-assembly", "export-and-packing", "guest-host-identity",
            "launch-config", "ssh-transfer", "native-acceptance"]


class Refused(Exception):
    """No diagnostic values are public."""


def public_key(raw):
    """Exact ed25519 SSH wire format; fixed comment contains no user/host name."""
    if type(raw) is not bytes or not 1 <= len(raw) <= 256:
        raise Refused()
    line = raw[:-1] if raw.endswith(b"\n") else raw
    parts = line.split(b" ")
    if (len(parts) not in (2, 3) or parts[0] != b"ssh-ed25519"
            or (len(parts) == 3 and parts[2] != COMMENT)):
        raise Refused()
    blob = base64.b64decode(parts[1], validate=True)
    prefix = struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32)
    if len(blob) != len(prefix) + 32 or not blob.startswith(prefix):
        raise Refused()
    if base64.b64encode(blob) != parts[1]:
        raise Refused()
    return b"ssh-ed25519 " + parts[1] + b" " + COMMENT + b"\n"


def _parts(value):
    if (type(value) is not str or not value.startswith("/") or value == "/"
            or len(value) > 1024 or str(PurePosixPath(value)) != value):
        raise Refused()
    parts = value[1:].split("/")
    if any(part in (".", "..") or part.startswith("-")
           or not re.fullmatch(r"[A-Za-z0-9_.-]{1,128}", part) for part in parts):
        raise Refused()
    return parts


def _directory(parts):
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | FLAGS)
    try:
        for part in parts:
            following = os.open(part, os.O_RDONLY | os.O_DIRECTORY | FLAGS, dir_fd=fd)
            os.close(fd)
            fd = following
        return fd
    except BaseException:
        os.close(fd)
        raise


def _owned(fd, *, private=False):
    node = os.fstat(fd)
    if (not stat.S_ISREG(node.st_mode) or node.st_uid != os.getuid()
            or node.st_nlink != 1 or node.st_size <= 0
            or (stat.S_IMODE(node.st_mode) != 0o600 if private
                else bool(stat.S_IMODE(node.st_mode) & 0o7022))):
        raise Refused()
    return node


def _read(fd, limit):
    result = bytearray()
    while len(result) <= limit:
        chunk = os.read(fd, min(4096, limit + 1 - len(result)))
        if not chunk:
            return bytes(result)
        result.extend(chunk)
    raise Refused()


def _write(directory, name, content):
    fd = os.open(name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | FLAGS, 0o600, dir_fd=directory)
    try:
        os.fchmod(fd, 0o600)
        view = memoryview(content)
        while view:
            count = os.write(fd, view)
            if count <= 0:
                raise Refused()
            view = view[count:]
        os.fsync(fd)
    finally:
        os.close(fd)


def _tool(arguments, inherited, limit=0):
    """Only fixed ssh-keygen invocations; bounded output and owned child lifetime."""
    process = None
    reaped = False
    interrupted = False
    def interrupt(_number, _frame):
        nonlocal interrupted
        interrupted = True
        if process is not None:
            raise KeyboardInterrupt()
    previous_int = signal.signal(signal.SIGINT, interrupt)
    previous_term = signal.signal(signal.SIGTERM, interrupt)
    try:
        deadline = time.monotonic() + 10
        process = subprocess.Popen(
            ["/usr/bin/ssh-keygen", *arguments], stdin=subprocess.DEVNULL,
            stdout=subprocess.PIPE if limit else subprocess.DEVNULL, stderr=subprocess.DEVNULL,
            env=dict(ENV), close_fds=True, pass_fds=tuple(inherited), start_new_session=True,
        )
        if interrupted:
            raise KeyboardInterrupt()
        output = bytearray()
        if limit:
            with selectors.DefaultSelector() as selector:
                selector.register(process.stdout, selectors.EVENT_READ)
                while True:
                    remaining = deadline - time.monotonic()
                    if remaining <= 0 or not selector.select(remaining):
                        raise Refused()
                    chunk = os.read(process.stdout.fileno(), 4096)
                    if not chunk:
                        break
                    if len(output) + len(chunk) > limit:
                        raise Refused()
                    output.extend(chunk)
        remaining = deadline - time.monotonic()
        if remaining <= 0:
            raise Refused()
        status = process.wait(timeout=remaining)
        reaped = True
        if status != 0:
            raise Refused()
        return bytes(output)
    finally:
        try:
            if process is not None:
                try:
                    if process.stdout is not None:
                        process.stdout.close()
                finally:
                    if not reaped:
                        # Repeated terminal signals cannot interrupt owned reap.
                        old_int = signal.signal(signal.SIGINT, signal.SIG_IGN)
                        old_term = signal.signal(signal.SIGTERM, signal.SIG_IGN)
                        try:
                            try:
                                process.kill()
                            except ProcessLookupError:
                                pass
                            process.wait(timeout=5)
                        finally:
                            signal.signal(signal.SIGINT, old_int)
                            signal.signal(signal.SIGTERM, old_term)
        finally:
            signal.signal(signal.SIGINT, previous_int)
            signal.signal(signal.SIGTERM, previous_term)


def _derive(private_fd):
    return _tool(["-y", "-P", "", "-f", f"/proc/self/fd/{private_fd}"], (private_fd,), 256)


def _sources():
    """Capture these two reviewed files only, never walk/copy a repository tree."""
    source_dir = _directory(_parts(str(Path(__file__).absolute().parent / "native-guest")))
    try:
        result = {}
        for name in CONTEXT[:2]:
            fd = os.open(name, os.O_RDONLY | FLAGS, dir_fd=source_dir)
            try:
                if _owned(fd).st_size > 32768:
                    raise Refused()
                result[name] = _read(fd, 32768)
            finally:
                os.close(fd)
        if not result["Dockerfile"].startswith(("FROM " + BASE + "\n").encode()):
            raise Refused()
        return result
    finally:
        os.close(source_dir)


def _private_directory(fd):
    node = os.fstat(fd)
    if (not stat.S_ISDIR(node.st_mode) or node.st_uid != os.getuid()
            or stat.S_IMODE(node.st_mode) != 0o700):
        raise Refused()
    return node.st_dev, node.st_ino


def _unique(items):
    result = {}
    for key, value in items:
        if key in result:
            raise Refused()
        result[key] = value
    return result


def prepared_context(root_path):
    """Revalidate a prepared root and return immutable captured PUBLIC bytes only.

    Call before packing publishes any output. This is not a directory grant or a
    Docker/launch receipt. The fixed trusted keygen may read the host private key
    to verify its public identity; Python never reads or returns private bytes.
    """
    reviewed = _sources()
    with ExitStack() as stack:
        root = _directory(_parts(root_path))
        stack.callback(os.close, root)
        identities = {_private_directory(root)}
        if set(os.listdir(root)) != {"auth", "context", "guest", "runtime", "preparation.json"}:
            raise Refused()
        directories = {}
        for name in ("auth", "context", "guest", "runtime"):
            fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | FLAGS, dir_fd=root)
            stack.callback(os.close, fd)
            identities.add(_private_directory(fd))
            directories[name] = fd
        if len(identities) != 5:
            raise Refused()
        if os.listdir(directories["guest"]) or os.listdir(directories["runtime"]):
            raise Refused()
        auth = directories["auth"]
        if set(os.listdir(auth)) != {"controller_ed25519", "controller_ed25519.pub"}:
            raise Refused()
        if set(os.listdir(directories["context"])) != set(CONTEXT):
            raise Refused()
        private = os.open("controller_ed25519", os.O_RDONLY | FLAGS, dir_fd=auth)
        stack.callback(os.close, private)
        node = _owned(private, private=True)
        if node.st_size > 4096:
            raise Refused()
        private_identity = node.st_dev, node.st_ino
        public_identities = set()
        def read_public(directory, name, limit):
            fd = os.open(name, os.O_RDONLY | FLAGS, dir_fd=directory)
            try:
                node = _owned(fd, private=True)
                identity = node.st_dev, node.st_ino
                # Check aliases BEFORE reading: a bind alias is not a hardlink.
                if identity == private_identity or identity in public_identities or node.st_size > limit:
                    raise Refused()
                public_identities.add(identity)
                return _read(fd, limit)
            finally:
                os.close(fd)
        authorized = public_key(read_public(auth, "controller_ed25519.pub", 256))
        if authorized != public_key(_derive(private)):
            raise Refused()
        captured = {name: read_public(directories["context"], name, 256 if name == "controller.pub" else 32768)
                    for name in CONTEXT}
        if any(captured[name] != reviewed[name] for name in CONTEXT[:2]):
            raise Refused()
        if captured["controller.pub"] != authorized:
            raise Refused()
        manifest = json.loads(read_public(root, "preparation.json", 8192), object_pairs_hook=_unique)
        if (type(manifest) is not dict
                or set(manifest) != {"version", "status", "base_image", "docker_executed", "sha256", "deferred"}
                or type(manifest["version"]) is not int or manifest["version"] != 1
                or manifest["status"] != "context-prepared-not-launchable"
                or manifest["base_image"] != BASE or manifest["docker_executed"] is not False
                or manifest["deferred"] != DEFERRED
                or manifest["sha256"] != {name: hashlib.sha256(value).hexdigest() for name, value in captured.items()}):
            raise Refused()
        return MappingProxyType(captured)


def main(argv=None):
    created = False
    try:
        args = sys.argv[1:] if argv is None else argv
        if (len(args) != 2 or args[0] != "--prepare" or sys.platform != "linux"
                or os.getuid() != os.geteuid()):
            raise Refused()
        parts = _parts(args[1])
        sources = _sources()
        with ExitStack() as stack:
            parent = _directory(parts[:-1])
            stack.callback(os.close, parent)
            node = os.fstat(parent)
            if node.st_uid != os.getuid() or stat.S_IMODE(node.st_mode) != 0o700:
                raise Refused()
            os.mkdir(parts[-1], 0o700, dir_fd=parent)  # Refuses any preexisting path.
            created = True
            root = os.open(parts[-1], os.O_RDONLY | os.O_DIRECTORY | FLAGS, dir_fd=parent)
            stack.callback(os.close, root)
            os.fchmod(root, 0o700)
            directories = {}
            for name in ("auth", "context", "guest", "runtime"):
                os.mkdir(name, 0o700, dir_fd=root)
                fd = os.open(name, os.O_RDONLY | os.O_DIRECTORY | FLAGS, dir_fd=root)
                stack.callback(os.close, fd)
                os.fchmod(fd, 0o700)
                directories[name] = fd
            auth = directories["auth"]
            _tool(["-q", "-t", "ed25519", "-N", "", "-C", COMMENT.decode(),
                   "-f", f"/proc/self/fd/{auth}/controller_ed25519"], (auth,))
            private = os.open("controller_ed25519", os.O_RDONLY | FLAGS, dir_fd=auth)
            stack.callback(os.close, private)
            if _owned(private, private=True).st_size > 4096:
                raise Refused()
            fd = os.open("controller_ed25519.pub", os.O_RDONLY | FLAGS, dir_fd=auth)
            try:
                if _owned(fd).st_size > 256:
                    raise Refused()
                os.fchmod(fd, 0o600)
                authorization = public_key(_read(fd, 256))
            finally:
                os.close(fd)
            if authorization != public_key(_derive(private)):
                raise Refused()
            sources["controller.pub"] = authorization
            for name, content in sources.items():
                _write(directories["context"], name, content)
            manifest = {
                "version": 1, "status": "context-prepared-not-launchable",
                "base_image": BASE, "docker_executed": False,
                "sha256": {name: hashlib.sha256(content).hexdigest() for name, content in sources.items()},
                "deferred": list(DEFERRED),
            }
            _write(root, "preparation.json", (json.dumps(manifest, sort_keys=True) + "\n").encode())
            for fd in (*directories.values(), root):
                os.fsync(fd)
        print("NATIVE_VM_CONTEXT_PREPARED_NOT_LAUNCHABLE")
        return 0
    except (Exception, KeyboardInterrupt):
        print("NATIVE_VM_PREPARE_FAILED_INCOMPLETE" if created else "NATIVE_VM_PREPARE_REFUSED")
        return 2

if __name__ == "__main__":
    raise SystemExit(main())
