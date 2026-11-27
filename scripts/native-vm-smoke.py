"""Fixed boot/SSH/share-free OS admission, never app/security acceptance.

Only --smoke ABS_PACKED_ROOT. Validated canonical private host paths are used for
OpenSSH (it may close inherited FDs); identities are rechecked before each call.
The trusted host owns this private root and guest code cannot modify it. This is
not a defense against a malicious concurrent host process with the same UID.
Failures retain runtime/checks, never delete data or SIGKILL the guarded parent.
Actual standard-Ubuntu runner evidence is required in addition to these sources.
"""

from contextlib import contextmanager, ExitStack
import hashlib
import importlib.util
import json
import os
from pathlib import Path
import selectors
import signal
import socket
import stat
import subprocess
import sys
import time


def _module(name, filename):
    spec = importlib.util.spec_from_file_location(name, Path(__file__).with_name(filename))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


guard = _module("smoke_guard", "native-vm-launch.py")
preparation = _module("smoke_preparation", "native-vm-provision.py")
Refused = guard.Refused


class TimedOut(Refused):
    pass


class CleanupFailed(Refused):
    pass


PROBE_CHECKS = frozenset(("schema", "version", "uid", "authorized_count", "authorized_sha256",
                          "pid1_systemd", "cgroup_v2", "mounts_allowed", "root_ext4_vda", "agent_absent"))


class ProbeRefused(Refused):
    """A fixed check name only, never a failed value or parser/SSH message."""

    def __init__(self, check):
        if type(check) is not str or check not in PROBE_CHECKS:
            raise Refused()
        super().__init__()
        self.probe_check = check


ENV = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
FIELDS = {"version", "uid", "pid1_systemd", "cgroup_v2", "mounts_allowed",
          "root_ext4_vda", "authorized_count", "authorized_sha256", "agent_absent"}
PROBE = b'''import hashlib,json,os,stat
def read(path,limit):
 fd=os.open(path,os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK)
 try:
  raw=bytearray()
  while len(raw)<=limit:
   chunk=os.read(fd,min(4096,limit+1-len(raw)))
   if not chunk: return bytes(raw)
   raw.extend(chunk)
  raise ValueError()
 finally: os.close(fd)
allowed={'ext4','proc','sysfs','tmpfs','devtmpfs','devpts','cgroup2','securityfs','pstore','bpf','tracefs','debugfs','configfs','hugetlbfs','mqueue','autofs','efivarfs','fusectl','binfmt_misc','ramfs','nsfs'}
mounts=[]
for line in read('/proc/self/mountinfo',65536).decode('ascii').splitlines():
 fields=line.split(); split=fields.index('-')
 mounts.append((fields[2],fields[4],fields[split+1]))
root=False
try:
 device=os.stat('/dev/vda',follow_symlinks=False)
 identity=str(os.major(device.st_rdev))+':'+str(os.minor(device.st_rdev))
 root=stat.S_ISBLK(device.st_mode) and sum(item[1]=='/' for item in mounts)==1 and any(item==(identity,'/','ext4') for item in mounts)
except OSError: pass
authorized=read('/home/fixture/.ssh/authorized_keys',256)
controllers=read('/sys/fs/cgroup/cgroup.controllers',4096).split()
result={'version':1,'uid':os.getuid(),'pid1_systemd':read('/proc/1/comm',32)==b'systemd\\n','cgroup_v2':any(item[2]=='cgroup2' for item in mounts) and {b'cpu',b'memory',b'pids'}.issubset(controllers),'mounts_allowed':bool(mounts) and len(mounts)<=512 and all(item[2] in allowed for item in mounts),'root_ext4_vda':root,'authorized_count':len([line for line in authorized.splitlines() if line.strip()]),'authorized_sha256':hashlib.sha256(authorized).hexdigest(),'agent_absent':'SSH_AUTH_SOCK' not in os.environ}
print(json.dumps(result,sort_keys=True))
'''


def _facts(raw, expected):
    if type(raw) is not bytes or not 0 < len(raw) <= 4096:
        raise ProbeRefused("schema")
    try:
        facts = json.loads(raw, object_pairs_hook=guard._pairs)
    except (json.JSONDecodeError, UnicodeDecodeError, guard.Refused):
        raise ProbeRefused("schema") from None
    if type(facts) is not dict or set(facts) != FIELDS:
        raise ProbeRefused("schema")
    for field, value in (("version", 1), ("uid", 1001), ("authorized_count", 1)):
        if type(facts[field]) is not int or facts[field] != value:
            raise ProbeRefused(field)
    # Fixed order makes multiple failures reproducible; admission predicates are unchanged.
    for field in ("pid1_systemd", "cgroup_v2", "mounts_allowed", "root_ext4_vda", "agent_absent"):
        if facts[field] is not True:
            raise ProbeRefused(field)
    if facts["authorized_sha256"] != expected:
        raise ProbeRefused("authorized_sha256")
    return facts


def _identity(node, directory=False):
    basic = (node.st_dev, node.st_ino, node.st_uid, node.st_mode)
    # The smoke itself creates checks/; directory link counts legitimately change.
    return basic if directory else basic + (node.st_nlink, node.st_size, node.st_mtime_ns, node.st_ctime_ns)


def _capture(root_path, stack):
    directories, witnesses = {}, {}
    for name in ("", "auth", "context", "guest", "runtime", "client-state"):
        path = root_path + ("/" + name if name else "")
        fd = guard._root(path, stack)
        directories[name] = fd
        witnesses[path] = (True, _identity(os.fstat(fd), True))
    if len({os.fstat(fd).st_ino for fd in directories.values()}) != len(directories):
        raise Refused()
    if os.listdir(directories["runtime"]):
        raise Refused()
    if set(os.listdir(directories[""])) != {"auth", "context", "guest", "runtime", "client-state", "preparation.json", "launch.json"}:
        raise Refused()
    private_path = root_path + "/auth/controller_ed25519"
    private_fd = guard._open_absolute(private_path)
    stack.callback(os.close, private_fd)
    private = guard._regular(private_fd, private=True)
    if private.st_size > 4096:
        raise Refused()
    secret = private.st_dev, private.st_ino
    witnesses[private_path] = (False, _identity(private))
    seen = {secret}
    def capture(name, limit, read=True):
        path = root_path + "/" + name
        fd = guard._open_absolute(path)
        try:
            node = guard._regular(fd, private=True)
            identity = node.st_dev, node.st_ino
            if identity in seen or node.st_size > limit:
                raise Refused()
            seen.add(identity)
            witnesses[path] = (False, _identity(node))
            return preparation._read(fd, limit) if read else None
        finally:
            os.close(fd)
    raw_config = capture("launch.json", 8192)
    config = json.loads(raw_config, object_pairs_hook=guard._pairs)
    expected = {"version": 1, "guest_root": root_path + "/guest", "auth_root": root_path + "/auth",
                "runtime_root": root_path + "/runtime", "kernel": "vmlinuz", "initrd": "initrd.img",
                "disk": "root.ext4", "ssh_key": "controller_ed25519", "ssh_port": 2227}
    if config != expected or type(config["version"]) is not int or type(config["ssh_port"]) is not int:
        raise Refused()
    context = {name: capture("context/" + name, 32768 if name != "controller.pub" else 256)
               for name in preparation.CONTEXT}
    if set(os.listdir(directories["context"])) != set(preparation.CONTEXT):
        raise Refused()
    reviewed = preparation._sources()
    if any(context[name] != reviewed[name] for name in reviewed):
        raise Refused()
    authorization = preparation.public_key(context["controller.pub"])
    if authorization != context["controller.pub"] or authorization != preparation.public_key(capture("auth/controller_ed25519.pub", 256)):
        raise Refused()
    manifest = json.loads(capture("preparation.json", 8192), object_pairs_hook=guard._pairs)
    if (manifest.get("status") != "context-prepared-not-launchable" or manifest.get("base_image") != preparation.BASE
            or manifest.get("sha256") != {name: hashlib.sha256(raw).hexdigest() for name, raw in context.items()}):
        raise Refused()
    public = capture("guest/ssh_host_ed25519_key.pub", 256)
    parts = public.rstrip(b"\n").split(b" ")
    if (len(parts) != 3 or parts[2] != b"pn-native-guest" or not public.endswith(b"\n")
            or public.count(b"\n") != 1):
        raise Refused()
    preparation.public_key(b" ".join(parts[:2]) + b"\n")
    pin = b"[127.0.0.1]:2227 " + b" ".join(parts[:2]) + b"\n"
    if capture("auth/known_hosts", 256) != pin:
        raise Refused()
    capture("guest/vmlinuz", 64 * 1024**2, False)
    capture("guest/initrd.img", 384 * 1024**2, False)
    capture("guest/root.ext4", 6 * 1024**3, False)
    if witnesses[root_path + "/guest/root.ext4"][1][-3] != 6 * 1024**3:
        raise Refused()
    if set(os.listdir(directories["guest"])) != {"vmlinuz", "initrd.img", "root.ext4", "ssh_host_ed25519_key.pub"}:
        raise Refused()
    if set(os.listdir(directories["auth"])) != {"controller_ed25519", "controller_ed25519.pub", "known_hosts"}:
        raise Refused()
    return directories, witnesses, config, hashlib.sha256(authorization).hexdigest(), pin


def _revalidate(witnesses):
    for path, (directory, expected) in witnesses.items():
        fd = guard._open_absolute(path, directory=directory)
        try:
            if _identity(os.fstat(fd), directory) != expected:
                raise Refused()
        finally:
            os.close(fd)


def _safe_code(value):
    return value if type(value) is int and -255 <= value <= 255 else None


@contextmanager
def _failure_receipt(root, progress):
    """Entered only after complete root validation, before any child starts."""
    try:
        yield
    except BaseException as error:
        cleanup = isinstance(error, CleanupFailed)
        stage = "cleanup" if cleanup else progress["stage"]
        reason = "cleanup_failed" if cleanup else (
            "timeout" if isinstance(error, (TimedOut, TimeoutError, subprocess.TimeoutExpired)) else "refused")
        receipt = {"version": 1, "scope": "guest-os-admission-only", "native_app_tested": False,
                   "status": "failed", "stage": stage, "reason": reason, "ssh_error": progress["ssh_error"]}
        if cleanup:
            receipt["origin_stage"] = progress["stage"]
        check = progress.get("probe_check")
        if (type(check) is str and check in PROBE_CHECKS and progress["ssh_error"] == "protocol"
                and ((stage == "probe" and reason == "refused")
                     or (cleanup and progress["stage"] == "probe"))):
            receipt["probe_check"] = check
        code = _safe_code(progress["returncode"])
        if code is not None:
            receipt["returncode"] = code
        process = progress["guard"]
        guard_status = _safe_code(process.returncode) if process is not None else None
        if guard_status is not None:
            receipt["guard_status"] = guard_status
        try:
            preparation._write(root, "smoke-receipt.json", (json.dumps(receipt, sort_keys=True) + "\n").encode())
        except (Exception, KeyboardInterrupt):
            # Preserve the original refusal; a failed receipt cannot imply pass.
            pass
        raise


def _finish_child(process, guarded):
    try:
        if process.poll() is None:
            try:
                process.terminate() if guarded else process.kill()
            except ProcessLookupError:
                pass
            # Never SIGKILL the guard: its finally must stop/reap QEMU.
            process.wait(timeout=15 if guarded else 5)
    except BaseException:
        raise CleanupFailed() from None


@contextmanager
def _owned(argv, *, guarded=False, stdin=subprocess.DEVNULL):
    process = None
    caught = []
    def interrupted(number, _frame):
        caught.append(number)
    previous = {number: signal.signal(number, interrupted) for number in (signal.SIGINT, signal.SIGTERM)}
    try:
        try:
            process = subprocess.Popen(argv, stdin=stdin, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                                       env=dict(ENV), cwd="/", close_fds=True, start_new_session=True)
        finally:
            for number, handler in previous.items():
                signal.signal(number, handler)
        if caught:
            raise Refused()
        yield process
    finally:
        if process is not None:
            protected = {number: signal.signal(number, signal.SIG_IGN) for number in (signal.SIGINT, signal.SIGTERM)}
            try:
                _finish_child(process, guarded)
            finally:
                try:
                    process.stdout.close()
                    if process.stdin is not None and not process.stdin.closed:
                        try:
                            process.stdin.close()
                        except BrokenPipeError:
                            pass
                finally:
                    for number, handler in protected.items():
                        signal.signal(number, handler)


def _drain(process, timeout, limit=4096, payload=None):
    deadline = time.monotonic() + timeout
    if payload is not None:
        try:
            process.stdin.write(payload)
            process.stdin.flush()
        except BrokenPipeError:
            pass
        finally:
            try:
                process.stdin.close()
            except BrokenPipeError:
                pass
    output = bytearray()
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise TimedOut()
            chunk = os.read(process.stdout.fileno(), min(4096, limit + 1 - len(output)))
            if not chunk:
                break
            output.extend(chunk)
            if len(output) > limit:
                raise Refused()
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise TimedOut()
    return process.wait(timeout=remaining), bytes(output)


def _ssh(identity, known_hosts):
    options = ["BatchMode=yes", "IdentitiesOnly=yes", "IdentityAgent=none", "ForwardAgent=no", "ForwardX11=no",
               "ClearAllForwardings=yes", "PermitLocalCommand=no", "ProxyCommand=none", "ProxyJump=none",
               "ControlMaster=no", "ControlPath=none", "ControlPersist=no", "GlobalKnownHostsFile=/dev/null",
               "StrictHostKeyChecking=yes", "UpdateHostKeys=no", "HostKeyAlgorithms=ssh-ed25519",
               "PreferredAuthentications=publickey", "PasswordAuthentication=no", "KbdInteractiveAuthentication=no",
               "GSSAPIAuthentication=no", "NumberOfPasswordPrompts=0", "ConnectTimeout=5", "ConnectionAttempts=1",
               "LogLevel=ERROR", "UserKnownHostsFile=" + known_hosts]
    args = ["/usr/bin/ssh", "-T", "-F", "/dev/null", "-p", "2227", "-i", identity]
    for option in options:
        args.extend(("-o", option))
    return args + ["fixture@127.0.0.1", "/usr/bin/python3", "-I", "-"]


def _powerdown(root_path):
    with ExitStack() as stack:
        runtime = guard._root(root_path + "/runtime", stack)
        node = os.stat("monitor.sock", dir_fd=runtime, follow_symlinks=False)
        if not stat.S_ISSOCK(node.st_mode) or node.st_uid != os.getuid():
            raise Refused()
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as monitor:
            monitor.settimeout(5)
            monitor.connect(root_path + "/runtime/monitor.sock")
            monitor.sendall(b"system_powerdown\n")


def _smoke(root_path):
    guard._absolute(root_path)
    with ExitStack() as stack:
        directories, witnesses, config, expected_hash, expected_pin = _capture(root_path, stack)
        root = directories[""]
        progress = {"stage": "boot_wait", "ssh_error": "none", "returncode": None, "guard": None}
        stack.enter_context(_failure_receipt(root, progress))
        os.mkdir("checks", 0o700, dir_fd=root)  # Refuse a previous partial attempt.
        checks = os.open("checks", os.O_RDONLY | os.O_DIRECTORY | guard.FLAGS, dir_fd=root)
        stack.callback(os.close, checks)
        if stat.S_IMODE(os.fstat(checks).st_mode) != 0o700:
            raise Refused()
        checks_path = root_path + "/checks"
        preparation._tool(["-q", "-t", "ed25519", "-N", "", "-C", "pn-native-fixture",
                           "-f", f"/proc/self/fd/{checks}/negative_ed25519"], (checks,))
        negative = guard._open_absolute(checks_path + "/negative_ed25519")
        stack.callback(os.close, negative)
        private = guard._regular(negative, private=True)
        if private.st_size > 4096:
            raise Refused()
        public_fd = guard._open_absolute(checks_path + "/negative_ed25519.pub")
        try:
            node = guard._regular(public_fd)
            if (node.st_dev, node.st_ino) == (private.st_dev, private.st_ino) or node.st_size > 256:
                raise Refused()
            os.fchmod(public_fd, 0o600)
            negative_public = preparation.public_key(preparation._read(public_fd, 256))
        finally:
            os.close(public_fd)
        wrong_pin = b"[127.0.0.1]:2227 " + b" ".join(negative_public.split()[:2]) + b"\n"
        if wrong_pin == expected_pin or hashlib.sha256(negative_public).hexdigest() == expected_hash:
            raise Refused()
        preparation._write(checks, "wrong_known_hosts", wrong_pin)
        preparation._write(checks, "launch.json", (json.dumps(config, sort_keys=True) + "\n").encode())
        for name in ("negative_ed25519", "negative_ed25519.pub", "wrong_known_hosts", "launch.json"):
            path = checks_path + "/" + name
            fd = guard._open_absolute(path)
            try:
                witnesses[path] = (False, _identity(guard._regular(fd, private=True)))
            finally:
                os.close(fd)
        witnesses[checks_path] = (True, _identity(os.fstat(checks), True))
        controller = root_path + "/auth/controller_ed25519"
        known = root_path + "/auth/known_hosts"
        launch = ["/usr/bin/python3", "-I", "-B", str(Path(__file__).with_name("native-vm-launch.py")), "--launch", checks_path + "/launch.json"]
        # Only this exact raw disk is writable by QEMU. An ancestor named guest
        # must never exclude auth/config/root witnesses from revalidation.
        active_witnesses = {path: value for path, value in witnesses.items()
                            if path != root_path + "/guest/root.ext4"}
        with _owned(launch, guarded=True) as process:
            progress["guard"] = process
            def call(identity=controller, pin=known, timeout=10):
                if process.poll() is not None:
                    raise Refused()
                _revalidate(active_witnesses)
                progress["returncode"] = None
                progress["ssh_error"] = "none"
                progress.pop("probe_check", None)
                with _owned(_ssh(identity, pin), stdin=subprocess.PIPE) as connection:
                    try:
                        status, data = _drain(connection, timeout, payload=PROBE)
                    except (TimedOut, TimeoutError, subprocess.TimeoutExpired):
                        progress["ssh_error"] = "timeout"
                        raise
                    progress["returncode"] = status
                    if status != 0:
                        if b"Host key verification failed." in data:
                            category = "host_key"
                        elif b"Permission denied" in data:
                            category = "authentication"
                        elif b"timed out" in data:
                            category = "timeout"
                        elif b"Connection" in data or b"connection" in data:
                            category = "connection"
                        else:
                            category = "other"
                        progress["ssh_error"] = category
                    return status, data
            def accept_probe(data):
                progress["stage"] = "probe"
                progress["ssh_error"] = "protocol"
                progress.pop("probe_check", None)
                try:
                    _facts(data, expected_hash)
                except ProbeRefused as error:
                    progress["probe_check"] = error.probe_check
                    raise
                progress["ssh_error"] = "none"
            deadline = time.monotonic() + 180
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0:
                    raise TimedOut()
                status, data = call(timeout=min(10, remaining))
                if status == 0:
                    accept_probe(data)
                    break
                transient = (b"Connection refused", b"Connection reset by peer", b"Connection closed by remote host",
                             b"Connection closed by 127.0.0.1", b"timed out")
                if (status != 255 or not any(marker in data for marker in transient)
                        or b"Host key verification failed." in data or b"Permission denied" in data
                        or time.monotonic() >= deadline):
                    raise Refused()
                time.sleep(1)
            for kind, identity, pin in (("pin", controller, checks_path + "/wrong_known_hosts"),
                                        ("key", checks_path + "/negative_ed25519", known)):
                progress["stage"] = kind
                status, data = call(identity, pin)
                marker = b"Host key verification failed." if kind == "pin" else b"Permission denied (publickey"
                if status != 255 or marker not in data:
                    raise Refused()
                status, data = call()
                if status != 0:
                    raise Refused()
                accept_probe(data)
            progress["stage"] = "powerdown"
            _powerdown(root_path)
            progress["stage"] = "guard_exit"
            status, output = _drain(process, 60)
            if status != 0 or output != b"NATIVE_VM_LAUNCH_EXITED\n":
                raise Refused()
        receipt = {"version": 1, "status": "passed", "scope": "guest-os-admission-only", "native_app_tested": False,
                   "wrong_pin_rejected": True, "wrong_key_rejected": True, "guard_normal_exit": True,
                   "uid": 1001, "pid1_systemd": True, "cgroup_v2": True, "mounts_allowed": True,
                   "root_ext4_vda": True, "agent_absent": True, "authorized_count": 1,
                   "authorized_sha256": expected_hash}
        preparation._write(root, "smoke-receipt.json", (json.dumps(receipt, sort_keys=True) + "\n").encode())


def main(argv=None):
    old = {}
    try:
        args = sys.argv[1:] if argv is None else argv
        if len(args) != 2 or args[0] != "--smoke":
            raise Refused()
        def interrupted(_number, _frame):
            raise Refused()
        for number in (signal.SIGINT, signal.SIGTERM):
            old[number] = signal.signal(number, interrupted)
        _smoke(args[1])
    except (Exception, KeyboardInterrupt):
        print("NATIVE_VM_OS_SMOKE_REFUSED")
        return 2
    finally:
        for number, handler in old.items():
            signal.signal(number, handler)
    print("NATIVE_VM_OS_SMOKE_PASSED")
    return 0

if __name__ == "__main__":
    raise SystemExit(main())
