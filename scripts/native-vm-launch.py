"""Share-free synthetic fixture boundary, not guest-image/security attestation.

CLI: --check CONFIG or --launch CONFIG. CONFIG is a private, bounded JSON object:
version=1; guest_root/auth_root/runtime_root are disjoint owned 0700 directories;
kernel/initrd/disk are basenames in guest_root; ssh_key is a basename in auth_root;
ssh_port is an integer in 1024..65535. runtime_root must initially be empty.
The disk is a direct raw ext4 root, not qcow2/cloud-init. Only boot/runtime FDs
reach fixed QEMU arguments. No caller-provided arguments, environment or devices.
Launch stays attached for at most 1800 seconds, then terminates/kills/reaps its
owned QEMU child. Serial is streamed in bounded chunks to at most 16 MiB; overflow
fails and stops that child. Guest provisioning, transfer, identity pinning and actual native
acceptance remain separate reviewed work. Private runtime serial is untrusted.
"""

from contextlib import ExitStack
import json
import os
from pathlib import PurePosixPath
import re
import selectors
import signal
import stat
import subprocess
import sys
import time


class Refused(Exception):
    """Fixed public refusal; never include configuration or process details."""


FIELDS = frozenset(("version", "guest_root", "auth_root", "runtime_root",
                    "kernel", "initrd", "disk", "ssh_key", "ssh_port"))
NAME = re.compile(r"[A-Za-z0-9][A-Za-z0-9_.-]{0,127}\Z")
COMPONENT = re.compile(r"[A-Za-z0-9_.-]{1,128}\Z")
FLAGS = os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
SERIAL_LIMIT = 16 * 1024 * 1024


def _absolute(value):
    if (type(value) is not str or len(value) > 1024 or not value.startswith("/")
            or value == "/" or str(PurePosixPath(value)) != value):
        raise Refused()
    parts = value[1:].split("/")
    if any(part in (".", "..") or part.startswith("-")
           or not COMPONENT.fullmatch(part) for part in parts):
        raise Refused()
    return parts


def _open_absolute(value, *, directory=False):
    """Walk each component without following links; return only the pinned leaf."""
    parts = _absolute(value)
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | FLAGS)
    try:
        for index, part in enumerate(parts):
            is_directory = index < len(parts) - 1 or directory
            flags = os.O_RDONLY | FLAGS | (os.O_DIRECTORY if is_directory else 0)
            new_fd = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = new_fd
        return fd
    except BaseException:
        os.close(fd)
        raise


def _regular(fd, *, private=False):
    node = os.fstat(fd)
    mode = stat.S_IMODE(node.st_mode)
    if (not stat.S_ISREG(node.st_mode) or node.st_uid != os.getuid()
            or node.st_nlink != 1 or node.st_size <= 0
            or (mode != 0o600 if private else bool(mode & 0o7022))):
        raise Refused()
    return node


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise Refused()
        result[key] = value
    return result


def _configuration(path):
    fd = _open_absolute(path)
    try:
        node = _regular(fd, private=True)
        if node.st_size > 8192:
            raise Refused()
        raw = os.read(fd, 8193)
        if len(raw) > 8192:
            raise Refused()
        config = json.loads(raw, object_pairs_hook=_pairs)
    finally:
        os.close(fd)
    if type(config) is not dict or set(config) != FIELDS:
        raise Refused()
    if type(config["version"]) is not int or config["version"] != 1:
        raise Refused()
    port = config["ssh_port"]
    if type(port) is not int or not 1024 <= port <= 65535:
        raise Refused()
    for field in ("kernel", "initrd", "disk", "ssh_key"):
        if type(config[field]) is not str or not NAME.fullmatch(config[field]):
            raise Refused()
    roots = [tuple(_absolute(config[field]))
             for field in ("guest_root", "auth_root", "runtime_root")]
    for index, first in enumerate(roots):
        for second in roots[index + 1:]:
            length = min(len(first), len(second))
            if first[:length] == second[:length]:
                raise Refused()
    return config


def _root(path, stack):
    fd = _open_absolute(path, directory=True)
    stack.callback(os.close, fd)
    node = os.fstat(fd)
    if node.st_uid != os.getuid() or stat.S_IMODE(node.st_mode) != 0o700:
        raise Refused()
    return fd


def _stop(process):
    # Repeated terminal signals must not interrupt the bounded reap attempt.
    old_int = signal.signal(signal.SIGINT, signal.SIG_IGN)
    old_term = signal.signal(signal.SIGTERM, signal.SIG_IGN)
    try:
        try:
            process.terminate()
        except ProcessLookupError:
            pass
        try:
            process.wait(timeout=5)
        except subprocess.TimeoutExpired:
            try:
                process.kill()
            except ProcessLookupError:
                pass
            process.wait(timeout=5)
    finally:
        signal.signal(signal.SIGINT, old_int)
        signal.signal(signal.SIGTERM, old_term)


def _serial(process, serial, deadline):
    """Drain concurrently with QEMU, with no unbounded communicate()/file output."""
    total = 0
    with selectors.DefaultSelector() as selector:
        selector.register(process.stdout, selectors.EVENT_READ)
        while True:
            remaining = deadline - time.monotonic()
            if remaining <= 0 or not selector.select(remaining):
                raise Refused()
            chunk = os.read(process.stdout.fileno(), 65536)
            if not chunk:
                break
            available = SERIAL_LIMIT - total
            kept = memoryview(chunk)[:available]
            while kept:
                count = os.write(serial, kept)
                if count <= 0:
                    raise Refused()
                kept = kept[count:]
            if len(chunk) > available:
                raise Refused()
            total += len(chunk)
    remaining = deadline - time.monotonic()
    if remaining <= 0:
        raise Refused()
    return process.wait(timeout=remaining)


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    launching = False
    try:
        if len(args) != 2 or args[0] not in ("--check", "--launch"):
            raise Refused()
        if sys.platform != "linux" or os.getuid() != os.geteuid():
            raise Refused()
        config = _configuration(args[1])
        with ExitStack() as stack:
            guest = _root(config["guest_root"], stack)
            auth = _root(config["auth_root"], stack)
            runtime = _root(config["runtime_root"], stack)
            # Distinct names cannot disguise aliases/bind mounts of the same root.
            identities = {(os.fstat(fd).st_dev, os.fstat(fd).st_ino)
                          for fd in (guest, auth, runtime)}
            if len(identities) != 3 or os.listdir(runtime):
                raise Refused()
            boot = []
            boot_identities = set()
            for field in ("kernel", "initrd", "disk"):
                mode = os.O_RDWR if field == "disk" else os.O_RDONLY
                fd = os.open(config[field], mode | FLAGS, dir_fd=guest)
                stack.callback(os.close, fd)
                node = _regular(fd)
                boot_identities.add((node.st_dev, node.st_ino))
                boot.append(fd)
            if len(boot_identities) != 3:
                raise Refused()
            key = os.open(config["ssh_key"], os.O_RDONLY | FLAGS, dir_fd=auth)
            try:
                node = _regular(key, private=True)
                if node.st_size > 16384 or (node.st_dev, node.st_ino) in boot_identities:
                    raise Refused()
            finally:
                os.close(key)  # Never inherited, included in argv or read as text.
            if args[0] == "--check":
                print("NATIVE_VM_PREFLIGHT_CHECKED")
                return 0
            # Construction and dispatch are one checked boundary; no extendable
            # argv receipt or validate-then-append API is exported to provisioning.
            pinned = [f"/proc/self/fd/{fd}" for fd in boot]
            runtime_path = f"/proc/self/fd/{runtime}"
            command = [
                "/usr/bin/qemu-system-x86_64", "-no-user-config", "-nodefaults",
                "-machine", "accel=tcg", "-cpu", "max", "-smp", "4", "-m", "8192",
                "-kernel", pinned[0], "-initrd", pinned[1],
                "-append", "root=/dev/vda rw console=ttyS0 systemd.unified_cgroup_hierarchy=1 apparmor=1 security=apparmor",
                "-drive", f"file={pinned[2]},format=raw,if=virtio,cache=writeback",
                "-netdev", f"user,id=net0,restrict=on,hostfwd=tcp:127.0.0.1:{config['ssh_port']}-:22",
                "-device", "virtio-net-pci,netdev=net0", "-nographic", "-serial", "stdio",
                "-monitor", "none", "-qmp", f"unix:{runtime_path}/monitor.sock,server=on,wait=off",
                "-pidfile", f"{runtime_path}/qemu.pid", "-no-reboot",
            ]
            serial = os.open("serial.log", os.O_WRONLY | os.O_CREAT | os.O_EXCL | FLAGS,
                             0o600, dir_fd=runtime)
            stack.callback(os.close, serial)
            os.fchmod(serial, 0o600)
            launching = True
            process = None
            reaped = False
            interrupted = False
            def interrupt(_number, _frame):
                nonlocal interrupted
                interrupted = True
                # A signal during spawn must not throw before we capture ownership.
                if process is not None:
                    raise KeyboardInterrupt()
            previous_int = signal.signal(signal.SIGINT, interrupt)
            previous_term = signal.signal(signal.SIGTERM, interrupt)
            try:
                deadline = time.monotonic() + 1800
                process = subprocess.Popen(
                    command, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.STDOUT,
                    close_fds=True, pass_fds=tuple(boot) + (runtime,),
                    env={"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"},
                    cwd="/", start_new_session=True,
                )
                if interrupted:
                    raise KeyboardInterrupt()
                status = _serial(process, serial, deadline)
                reaped = True
                if status != 0:
                    raise Refused()
            finally:
                try:
                    if process is not None:
                        try:
                            process.stdout.close()
                        finally:
                            if not reaped:
                                _stop(process)
                finally:
                    signal.signal(signal.SIGINT, previous_int)
                    signal.signal(signal.SIGTERM, previous_term)
        print("NATIVE_VM_LAUNCH_EXITED")
        return 0
    except (Exception, KeyboardInterrupt):
        print("NATIVE_VM_LAUNCH_FAILED" if launching else "NATIVE_VM_PREFLIGHT_REFUSED")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
