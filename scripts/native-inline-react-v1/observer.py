"""Sealed guest diagnostic. No provisioning, author API, forced focus or raw logs.

Only --case stop|expiry. Session owns the host/display and all teardown. Title
receipts are diagnostic, never process authority. This observer never kills a
preview: it clicks the trusted host's Stop button only after live verification.
"""
from contextlib import ExitStack
import ctypes
import errno
import json
import os
from pathlib import Path
import re
import selectors
import signal
import stat
import subprocess
import sys
import time

ROOT = Path("/home/fixture/native-inline-react-v1")
UID = 1001
CASES = frozenset(("stop", "expiry"))
PHASES = frozenset(("admission", "host", "bridge", "ready", "pointer", "focus", "keyboard",
                    "stop", "cleanup", "host_input", "expiry", "complete"))
REASONS = frozenset(("none", "profile_refused", "host_not_ready", "policy_refused", "bridge_not_observed",
                    "readiness_deadline", "fixture_error", "input_deadline", "pointer_not_acknowledged",
                    "focus_not_acknowledged", "keyboard_not_acknowledged", "stop_headroom", "identity_changed",
                    "migration_observed", "cleanup_deadline", "expiry_cause_missing", "expiry_deadline",
                    "host_input_not_acknowledged", "observer_error", "evidence_limit", "command_failed"))
OBSERVATIONS = ("bridge", "pointer", "keyboard", "termination", "host_input")
RESULT_FIELDS = frozenset(("version", "profile", "case", "scope", "native_app_tested", "status", "phase", "reason", *OBSERVATIONS))
UNIT = re.compile(r"programmable-notes-preview-[1-9][0-9]{0,9}-[0-9]{1,30}\.service\Z")
GROUP_PREFIX = "/user.slice/user-1001.slice/user@1001.service/"
ERRORS = frozenset(("", "runtime-error", "react-error", "unhandled-rejection", "receipt-overflow"))
READINESS_STATES = frozenset(("not_observed", "missing", "empty", "native_only", "bootstrap_pending",
                              "react_ready", "react_noninitial", "runtime_error", "react_error",
                              "unhandled_rejection", "receipt_overflow", "invalid"))
FLAGS = os.O_CLOEXEC | os.O_NOFOLLOW | os.O_NONBLOCK
RACED_PROCESS = (errno.ENOENT, errno.ESRCH)
TRANSIENT_GROUP = (errno.ENOENT, errno.ENODEV, errno.ESRCH)
HOST_LIMIT = 256 * 1024
EVENT_LIMIT = 256 * 1024
RESULT_LIMIT = 16384


class Refused(Exception):
    def __init__(self, reason):
        self.reason = reason if reason in REASONS else "observer_error"
        super().__init__()  # No untrusted exception text in evidence/stdout.


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise Refused("observer_error")
        result[key] = value
    return result


def _validated_title(raw):
    if type(raw) is not bytes or not 0 < len(raw) <= 256:
        raise Refused("fixture_error")
    try:
        value = json.loads(raw.decode("utf8"), object_pairs_hook=_pairs)
    except (ValueError, UnicodeError):
        raise Refused("fixture_error") from None
    if value == {"bridge": "native-before-webkit"}:
        return "bridge"
    if value == {"fixture": "inline-react-v1", "ready": False, "error": "receipt-overflow"} and type(value["ready"]) is bool:
        return value  # Fixed compiler overflow diagnostic; never a readiness receipt.
    if (type(value) is not dict or set(value) != {"fixture", "ready", "count", "field", "focus", "error"}
            or value["fixture"] != "inline-react-v1" or type(value["ready"]) is not bool
            or type(value["count"]) is not int or not 0 <= value["count"] <= 999
            or type(value["field"]) is not str or len(value["field"].encode("utf-16-le", errors="surrogatepass")) > 32
            or type(value["focus"]) is not str or value["focus"] not in ("", "counter", "field")
            or type(value["error"]) is not str or value["error"] not in ERRORS):
        raise Refused("fixture_error")
    return value


def decode_title(raw):
    value = _validated_title(raw)
    if type(value) is dict and value["error"]:
        raise Refused("fixture_error")
    return value


def title_state(raw):
    """Lossy fixed enum only; diagnostics never make a title acceptable."""
    if raw is None:
        return "missing"
    if raw == b"":
        return "empty"
    try:
        value = _validated_title(raw)
    except Exception:
        return "invalid"
    if value == "bridge":
        return "native_only"
    if value["error"]:
        return value["error"].replace("-", "_")
    if not value["ready"]:
        return "bootstrap_pending"
    return "react_ready" if value["count"] == 0 and value["field"] == "" else "react_noninitial"


NATIVE_FLAGS = ("built", "committed", "finished", "navigation_denied", "load_failed")
NATIVE_TERMINATIONS = frozenset(("none", "crashed", "memory_limit", "api_terminated", "unknown"))


def _native_value(value):
    if (type(value) is not dict or set(value) != {"version", *NATIVE_FLAGS, "termination"}
            or type(value["version"]) is not int or value["version"] != 1
            or any(type(value[key]) is not bool for key in NATIVE_FLAGS)
            or type(value["termination"]) is not str or value["termination"] not in NATIVE_TERMINATIONS):
        return None
    return dict(value)


def decode_native_snapshot(raw):
    """Only the fixed xprop quoted ASCII representation; no raw strings escape."""
    try:
        if type(raw) is not bytes or not 0 < len(raw) <= 1024:
            return None
        text = raw.decode("ascii")
        prefix = "_PN_FIXTURE_NATIVE = "
        if not text.startswith(prefix):
            return None
        line = text[len(prefix):]
        if line.endswith("\n"):
            line = line[:-1]
        if (not line.startswith('"') or not line.endswith('"')
                or any(char in line for char in "\r\n\t")):
            return None
        quoted = json.loads(line, object_pairs_hook=_pairs)
        if type(quoted) is not str or not 0 < len(quoted.encode("ascii")) <= 256:
            return None
        return _native_value(json.loads(quoted, object_pairs_hook=_pairs))
    except Exception:
        return None


def native_snapshot_event(evidence, backend, target, child, phase):
    try:
        if phase != "ready" or target is None or backend.readiness_state() not in ("native_only", "missing"):
            return
        value = _native_value(backend.native_snapshot(child, target["start"]))
        if value is not None:
            evidence.event("native_snapshot", phase="ready", snapshot=value)
    except Exception:
        pass  # Optional fixed diagnosis cannot affect Stop or the original failure.


def readiness_event(evidence, backend, phase):
    if phase != "ready":
        return
    try:
        state = backend.readiness_state()  # Cached enum: no additional native read.
        if type(state) is str and state in READINESS_STATES:
            evidence.event("readiness_state", phase="ready", state=state)
    except Exception:
        pass  # Optional diagnosis cannot replace the original failed witness.


def _open_directory(path):
    path = Path(path)
    if not path.is_absolute() or any(part in (".", "..") for part in path.parts):
        raise Refused("profile_refused")
    fd = os.open("/", os.O_RDONLY | os.O_DIRECTORY | FLAGS)
    try:
        for part in path.parts[1:]:
            child = os.open(part, os.O_RDONLY | os.O_DIRECTORY | FLAGS, dir_fd=fd)
            os.close(fd)
            fd = child
        return fd
    except BaseException:
        os.close(fd)
        raise


def _private(node, directory=False):
    if (node.st_uid != UID or stat.S_IMODE(node.st_mode) != (0o700 if directory else 0o600)
            or (not stat.S_ISDIR(node.st_mode) if directory else not stat.S_ISREG(node.st_mode) or node.st_nlink != 1)):
        raise Refused("profile_refused")


def _read(path, limit):
    fd = os.open(path, os.O_RDONLY | FLAGS)
    try:
        data = bytearray()
        while len(data) <= limit:
            raw = os.read(fd, min(65536, limit + 1 - len(data)))
            if not raw:
                return bytes(data)
            data.extend(raw)
        raise Refused("observer_error")
    finally:
        os.close(fd)


class Evidence:
    def __init__(self, case):
        self.stack = ExitStack()
        self.events_bytes = 0
        self.started = time.monotonic()
        try:
            for path in (ROOT, ROOT / "run", ROOT / "run/evidence", ROOT / "run/evidence" / case):
                fd = _open_directory(path)
                self.stack.callback(os.close, fd)
                _private(os.fstat(fd), True)
            self.directory = fd
            self.host_fd = os.open("host.log", os.O_RDONLY | FLAGS, dir_fd=fd)
            self.stack.callback(os.close, self.host_fd)
            _private(os.fstat(self.host_fd))
            # Reserve both names before observation; a partial attempt is never reused.
            self.result_fd = os.open("result.json", os.O_WRONLY | os.O_CREAT | os.O_EXCL | FLAGS, 0o600, dir_fd=fd)
            self.stack.callback(os.close, self.result_fd)
            self.events_fd = os.open("events.jsonl", os.O_WRONLY | os.O_CREAT | os.O_EXCL | FLAGS, 0o600, dir_fd=fd)
            self.stack.callback(os.close, self.events_fd)
            self.host_identity = (os.fstat(self.host_fd).st_dev, os.fstat(self.host_fd).st_ino)
        except BaseException:
            self.stack.close()
            raise

    def host_log(self):
        node = os.fstat(self.host_fd)
        named = os.stat("host.log", dir_fd=self.directory, follow_symlinks=False)
        _private(node)
        _private(named)
        if (node.st_dev, node.st_ino) != self.host_identity or (named.st_dev, named.st_ino) != self.host_identity or node.st_size > HOST_LIMIT:
            raise Refused("evidence_limit")
        raw = os.pread(self.host_fd, HOST_LIMIT + 1, 0)
        if len(raw) > HOST_LIMIT:
            raise Refused("evidence_limit")
        return raw.decode("utf8", errors="strict")

    def event(self, event, **values):
        # All callers supply fixed field names/codes and independently validated
        # process identities; never raw host/journal/exception/title data.
        raw = (json.dumps({"event": event, "elapsed": round(time.monotonic() - self.started, 6), **values}, sort_keys=True) + "\n").encode()
        if len(raw) > 8192 or self.events_bytes + len(raw) > EVENT_LIMIT:
            raise Refused("evidence_limit")
        _write(self.events_fd, raw)
        self.events_bytes += len(raw)

    def finish(self, result):
        raw = (json.dumps(result, sort_keys=True) + "\n").encode()
        if len(raw) > RESULT_LIMIT or set(result) != RESULT_FIELDS:
            raise Refused("evidence_limit")
        _write(self.result_fd, raw)

    def close(self):
        self.stack.close()


def _write(fd, raw):
    view = memoryview(raw)
    while view:
        count = os.write(fd, view)
        if count <= 0:
            raise Refused("evidence_limit")
        view = view[count:]


def _command(args, deadline, limit=8192):
    """Only internal fixed argv call sites; bounded owned children, no shell."""
    if time.monotonic() >= deadline:
        raise Refused("command_failed")
    process = None
    caught = []
    old = {number: signal.signal(number, lambda number, _frame: caught.append(number))
           for number in (signal.SIGTERM, signal.SIGINT)}
    try:
        try:
            environment = {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"}
            environment.update({key: os.environ[key] for key in ("DISPLAY", "XAUTHORITY", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS") if key in os.environ})
            process = subprocess.Popen(args, stdin=subprocess.DEVNULL, stdout=subprocess.PIPE, stderr=subprocess.DEVNULL,
                                       cwd="/", env=environment, close_fds=True, start_new_session=True)
        finally:
            for number, handler in old.items():
                signal.signal(number, handler)
        if caught:
            raise Refused("command_failed")
        output = bytearray()
        with selectors.DefaultSelector() as poll:
            poll.register(process.stdout, selectors.EVENT_READ)
            while True:
                remaining = deadline - time.monotonic()
                if remaining <= 0 or not poll.select(remaining):
                    raise Refused("command_failed")
                raw = os.read(process.stdout.fileno(), 65536)
                if not raw:
                    break
                output.extend(raw)
                if len(output) > limit:
                    raise Refused("command_failed")
        remaining = deadline - time.monotonic()
        if remaining <= 0 or process.wait(timeout=remaining) != 0 or time.monotonic() >= deadline:
            raise Refused("command_failed")
        return bytes(output)
    finally:
        if process is not None:
            ignored = {number: signal.signal(number, signal.SIG_IGN) for number in (signal.SIGTERM, signal.SIGINT)}
            try:
                if process.returncode is None:
                    try:
                        os.killpg(process.pid, signal.SIGKILL)
                    except ProcessLookupError:
                        pass
                    process.wait(timeout=1)
                process.stdout.close()
            finally:
                for number, handler in ignored.items():
                    signal.signal(number, handler)


def identity(pid):
    try:
        raw = _read(Path("/proc") / str(pid) / "stat", 8192).decode("utf8")
    except OSError as error:
        if error.errno in RACED_PROCESS:
            return None
        raise
    fields = raw.rsplit(") ", 1)
    if len(fields) != 2 or not fields[0].startswith(str(pid) + " ("):
        raise Refused("identity_changed")
    fields = fields[1].split()
    if len(fields) < 20 or not re.fullmatch(r"[A-Za-z]", fields[0]) or not fields[19].isdecimal():
        raise Refused("identity_changed")
    return {"start": fields[19], "state": fields[0]}


def group_path(group, unit):
    if (type(group) is not str or not group.startswith(GROUP_PREFIX) or not UNIT.fullmatch(unit)
            or not group.endswith("/" + unit) or len(group) > 512
            or any(not part or part in (".", "..") for part in group[1:].split("/"))):
        raise Refused("policy_refused")
    return Path("/sys/fs/cgroup") / group[1:]


def _membership(pid):
    try:
        return _read(Path("/proc") / str(pid) / "cgroup", 8192).decode("ascii").strip()
    except OSError as error:
        if error.errno in RACED_PROCESS:
            return None
        raise


def _inside(value, group):
    return value == "0::" + group or value.startswith("0::" + group + "/")


def live(unit, deadline):
    raw = _command(["/usr/bin/systemctl", "--user", "show", unit, "-p", "MainPID", "-p", "ControlGroup", "-p", "ActiveEnterTimestampMonotonic", "-p", "RuntimeMaxUSec"], deadline)
    props = _pairs(line.split("=", 1) for line in raw.decode("ascii").splitlines() if "=" in line)
    if set(props) != {"MainPID", "ControlGroup", "ActiveEnterTimestampMonotonic", "RuntimeMaxUSec"}:
        raise Refused("policy_refused")
    if not props["MainPID"].isdecimal() or not 1 < int(props["MainPID"]) < 2**31:
        raise Refused("identity_changed")
    pid = int(props["MainPID"])
    group = props["ControlGroup"]
    root = group_path(group, unit)
    before = identity(pid)
    if before is None or before["state"] == "Z" or _membership(pid) != "0::" + group:
        raise Refused("identity_changed")
    status = _read(Path("/proc") / str(pid) / "status", 16384).decode("ascii")
    lines = [line.split() for line in status.splitlines()]
    if (["Uid:", "1001", "1001", "1001", "1001"] not in lines or ["NoNewPrivs:", "1"] not in lines):
        raise Refused("policy_refused")
    own_net, child_net = os.readlink("/proc/self/ns/net"), os.readlink(f"/proc/{pid}/ns/net")
    if (not re.fullmatch(r"net:\[[0-9]+\]", own_net) or not re.fullmatch(r"net:\[[0-9]+\]", child_net) or own_net == child_net):
        raise Refused("policy_refused")
    policy = {name: _read(root / name, 256).decode("ascii").strip() for name in ("cpu.max", "memory.max", "memory.swap.max", "pids.max")}
    if policy != {"cpu.max": "25000 100000", "memory.max": "536870912", "memory.swap.max": "0", "pids.max": "128"}:
        raise Refused("policy_refused")
    if props["RuntimeMaxUSec"] not in ("1min", "60000000") or not props["ActiveEnterTimestampMonotonic"].isdecimal():
        raise Refused("policy_refused")
    start = int(props["ActiveEnterTimestampMonotonic"]) / 1_000_000
    after = identity(pid)
    if start <= 0 or start > time.monotonic() or after is None or after["start"] != before["start"] or after["state"] == "Z" or _membership(pid) != "0::" + group:
        raise Refused("identity_changed")
    return {"unit": unit, "pid": pid, "start_identity": before["start"], "group": group, "root": root, "start": start, "policy": policy,
            "host_net": own_net, "child_net": child_net}


def sample(target, known, unresolved):
    """Recursive membership plus identity history. None is NEVER an empty group."""
    root, group = target["root"], target["group"]
    try:
        if not root.is_dir():
            os.stat(root, follow_symlinks=False)  # Only true ENOENT proves removal.
            raise Refused("policy_refused")
        pending = [(root, 0)]
        visited, pids = 0, set()
        while pending:
            directory, depth = pending.pop()
            visited += 1
            if visited > 32 or depth > 8:
                raise Refused("policy_refused")
            raw = _read(directory / "cgroup.procs", 8192).decode("ascii")
            for value in raw.split():
                if not value.isdecimal() or not 1 < int(value) < 2**31:
                    raise Refused("policy_refused")
                pids.add(int(value))
            with os.scandir(directory) as entries:
                for entry in entries:
                    if entry.is_symlink():
                        raise Refused("policy_refused")
                    if entry.is_dir(follow_symlinks=False):
                        pending.append((Path(entry.path), depth + 1))
        if len(pids) > 128:
            raise Refused("policy_refused")
        events = dict(line.split() for line in _read(root / "cgroup.events", 4096).decode("ascii").splitlines())
        if events.get("populated") not in ("0", "1"):
            raise Refused("policy_refused")
    except OSError as error:
        if error.errno == errno.ENOENT:
            try:
                os.stat(root, follow_symlinks=False)
            except FileNotFoundError:
                return True
        if error.errno in TRANSIENT_GROUP:
            return None
        raise
    for pid in pids:
        current = identity(pid)
        if current is None:
            unresolved.add(pid)
            continue
        known[(pid, current["start"])] = current["state"]
        unresolved.discard(pid)
        where = _membership(pid)
        if where is not None and not _inside(where, group):
            raise Refused("migration_observed")
    if len(known) > 512 or len(unresolved) > 128:
        raise Refused("evidence_limit")
    return not pids and events["populated"] == "0"


def historical_alive(target, known, unresolved):
    alive = False
    for pid in tuple(unresolved):
        current = identity(pid)
        if current is None:
            unresolved.discard(pid)
        else:
            # No original start was available: conservatively retain this PID.
            known[(pid, current["start"])] = current["state"]
            unresolved.discard(pid)
    for (pid, start) in tuple(known):
        current = identity(pid)
        if current is not None and current["start"] == start and current["state"] != "Z":
            alive = True
            where = _membership(pid)
            if where is not None and not _inside(where, target["group"]):
                raise Refused("migration_observed")
    return alive


def cleanup(target, known, unresolved, deadline, pulse=None):
    while time.monotonic() < deadline:
        empty = sample(target, known, unresolved)
        if pulse is not None:
            pulse()
        if empty is True and not historical_alive(target, known, unresolved):
            if sample(target, known, unresolved) is True and not historical_alive(target, known, unresolved) and time.monotonic() < deadline:
                return
        time.sleep(min(.05, max(0, deadline - time.monotonic())))
    raise Refused("cleanup_deadline")


def expiry_cause(records, unit):
    def manager(record):
        return (type(record) is dict and record.get("_EXE") in ("/usr/lib/systemd/systemd", "/lib/systemd/systemd")
                and record.get("_COMM") == "systemd" and record.get("_UID") == "1001"
                and record.get("_TRANSPORT") == "journal" and record.get("USER_UNIT") == unit)
    return (any(manager(row) and row.get("MESSAGE_ID") == "d9b373ed55a64feb8242e02dbe79a49c" and row.get("UNIT_RESULT") == "timeout" for row in records)
            and any(manager(row) and row.get("MESSAGE") == unit + ": Service reached runtime time limit. Stopping." for row in records))


def exception_event(evidence, phase, error):
    names = {"OSError", "PermissionError", "FileNotFoundError", "ProcessLookupError", "ValueError", "TypeError", "RuntimeError", "TimeoutExpired", "Refused"}
    frames, frame = [], error.__traceback__
    while frame is not None and len(frames) < 8:
        if frame.tb_frame.f_code.co_filename == __file__:
            name = frame.tb_frame.f_code.co_name
            frames.append({"line": frame.tb_lineno, "function": name if re.fullmatch(r"[A-Za-z_]{1,40}", name) else "callback"})
        frame = frame.tb_next
    number = getattr(error, "errno", None)
    try:
        evidence.event("observer_exception", phase=phase, error_type=type(error).__name__ if type(error).__name__ in names else "Exception",
                       errno=number if type(number) is int and 0 <= number <= 4096 else None, frames=frames)
    except Exception:
        pass  # Preserve the original failed witness if evidence itself fails.


class RendererPolicy:
    """One bounded actual renderer snapshot, independent of author receipts."""
    def __init__(self, target, known, evidence):
        self.target, self.known, self.evidence = target, known, evidence
        self.seen = set()
        self.last = -1.

    def tick(self, deadline, force=False):
        if not force and time.monotonic() - self.last < 1:
            return
        self.last = time.monotonic()
        for pid, start in tuple(self.known):
            if (pid, start) in self.seen or time.monotonic() >= deadline:
                continue
            try:
                comm = _read(Path("/proc") / str(pid) / "comm", 128).strip()
                if comm not in (b"WebKitWebProces", b"WebKitWebProcess"):
                    continue
                fields = dict((line.split(":", 1)[0], line.split(":", 1)[1].split()) for line in _read(Path("/proc") / str(pid) / "status", 16384).decode("ascii").splitlines() if ":" in line)
                net = os.readlink(f"/proc/{pid}/ns/net")
                current = identity(pid)
                if current is None or current["start"] != start or current["state"] == "Z":
                    continue
                where = _membership(pid)
                if where is None:
                    continue
                if not _inside(where, self.target["group"]):
                    raise Refused("migration_observed")
                uid_ok = fields.get("Uid") == ["1001"] * 4
                nnp_ok = fields.get("NoNewPrivs") == ["1"]
                seccomp_ok = fields.get("Seccomp") == ["2"]
                net_ok = bool(re.fullmatch(r"net:\[[0-9]+\]", net)) and net != self.target["host_net"]
                self.evidence.event("renderer_policy", pid=pid, start=start, uid_1001=uid_ok, no_new_privs=nnp_ok, seccomp_filter=seccomp_ok, distinct_host_net=net_ok)
                if not (uid_ok and nnp_ok and seccomp_ok and net_ok):
                    raise Refused("policy_refused")
                self.seen.add((pid, start))
            except OSError as error:
                if error.errno in RACED_PROCESS:
                    continue
                self.evidence.event("renderer_policy_unavailable", pid=pid, start=start)
                raise Refused("policy_refused") from None

    def require(self):
        if not self.seen:
            self.evidence.event("renderer_policy_not_observed")
            raise Refused("policy_refused")


class X11:
    def __init__(self):
        self.last_state = "not_observed"
        self.x = ctypes.CDLL("libX11.so.6")
        ulong, uint, integer, pointer = ctypes.c_ulong, ctypes.c_uint, ctypes.c_int, ctypes.c_void_p
        self.x.XOpenDisplay.argtypes, self.x.XOpenDisplay.restype = [ctypes.c_char_p], pointer
        self.x.XCloseDisplay.argtypes = [pointer]
        self.x.XQueryTree.argtypes = [pointer, ulong, ctypes.POINTER(ulong), ctypes.POINTER(ulong), ctypes.POINTER(ctypes.POINTER(ulong)), ctypes.POINTER(uint)]
        self.x.XGetGeometry.argtypes = [pointer, ulong, ctypes.POINTER(ulong), ctypes.POINTER(integer), ctypes.POINTER(integer), ctypes.POINTER(uint), ctypes.POINTER(uint), ctypes.POINTER(uint), ctypes.POINTER(uint)]
        self.x.XInternAtom.argtypes, self.x.XInternAtom.restype = [pointer, ctypes.c_char_p, integer], ulong
        self.x.XGetWindowProperty.argtypes = [pointer, ulong, ulong, ctypes.c_long, ctypes.c_long, integer, ulong, ctypes.POINTER(ulong), ctypes.POINTER(integer), ctypes.POINTER(ulong), ctypes.POINTER(ulong), ctypes.POINTER(pointer)]
        self.x.XFree.argtypes = [pointer]
        class ErrorEvent(ctypes.Structure):
            _fields_ = [("type", integer), ("display", pointer), ("resource", ulong), ("serial", ulong), ("code", ctypes.c_ubyte), ("request", ctypes.c_ubyte), ("minor", ctypes.c_ubyte)]
        self.unexpected = False
        callback = ctypes.CFUNCTYPE(integer, pointer, pointer)
        def on_error(_display, error):
            if ctypes.cast(error, ctypes.POINTER(ErrorEvent)).contents.code != 3:
                self.unexpected = True
            return 0
        self.callback = callback(on_error)
        self.x.XSetErrorHandler.argtypes = [callback]
        self.x.XSetErrorHandler(self.callback)
        self.display = self.x.XOpenDisplay(None)
        if not self.display:
            raise Refused("profile_refused")
        self.atom = self.x.XInternAtom(self.display, b"_PN_FIXTURE_STATE", 0)
        self.bridge_atom = self.x.XInternAtom(self.display, b"_PN_FIXTURE_BRIDGE", 0)
        self.utf8 = self.x.XInternAtom(self.display, b"UTF8_STRING", 0)

    def children(self, window):
        root, parent, values, count = ctypes.c_ulong(), ctypes.c_ulong(), ctypes.POINTER(ctypes.c_ulong)(), ctypes.c_uint()
        try:
            ok = self.x.XQueryTree(self.display, window, ctypes.byref(root), ctypes.byref(parent), ctypes.byref(values), ctypes.byref(count))
            if self.unexpected or count.value > 16:
                raise Refused("observer_error")
            return [values[index] for index in range(count.value)] if ok else []
        finally:
            if values:
                self.x.XFree(values)

    def _property(self, window, atom):
        actual, fmt, count, remaining, value = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_ulong(), ctypes.c_ulong(), ctypes.c_void_p()
        try:
            status = self.x.XGetWindowProperty(self.display, window, atom, 0, 64, 0, self.utf8,
                                               ctypes.byref(actual), ctypes.byref(fmt), ctypes.byref(count), ctypes.byref(remaining), ctypes.byref(value))
            if self.unexpected:
                raise Refused("observer_error")
            if status != 0 or actual.value == 0:
                return None
            if atom == self.atom and actual.value == self.utf8 and fmt.value == 8 and not remaining.value and count.value == 0:
                self.last_state = "empty"
            if actual.value != self.utf8 or fmt.value != 8 or remaining.value or not 0 < count.value <= 256 or not value:
                raise Refused("fixture_error")
            return ctypes.string_at(value, count.value)
        finally:
            if value:
                self.x.XFree(value)

    def state(self, window):
        self.last_state = "invalid"
        raw = self._property(window, self.atom)
        self.last_state = title_state(raw)
        return decode_title(raw) if raw is not None else None

    def bridge(self, window):
        raw = self._property(window, self.bridge_atom)
        if raw is not None and raw != b'{"bridge":"native-before-webkit"}':
            raise Refused("bridge_not_observed")
        return raw is not None

    def geometry(self, window):
        root, x, y, width, height, border, depth = ctypes.c_ulong(), ctypes.c_int(), ctypes.c_int(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint(), ctypes.c_uint()
        ok = self.x.XGetGeometry(self.display, window, ctypes.byref(root), ctypes.byref(x), ctypes.byref(y), ctypes.byref(width), ctypes.byref(height), ctypes.byref(border), ctypes.byref(depth))
        if not ok or self.unexpected or (width.value, height.value) != (300, 120):
            raise Refused("observer_error")

    def close(self):
        self.x.XCloseDisplay(self.display)


class Backend:
    def __init__(self, evidence, absolute):
        self.evidence, self.absolute = evidence, absolute
        self.x = X11()

    def host(self):
        lines = self.evidence.host_log().splitlines()
        ready = [re.fullmatch(r"HOST_READY pid=([1-9][0-9]{0,9}) trusted_parent=([1-9][0-9]{0,19}) host_xid=([1-9][0-9]{0,19})", line) for line in lines]
        ready = [match for match in ready if match]
        units = [line.removeprefix("HOST_UNIT ") for line in lines if line.startswith("HOST_UNIT ")]
        if len(ready) > 1 or len(units) > 1 or units and not UNIT.fullmatch(units[0]):
            raise Refused("host_not_ready")
        if not ready or not units:
            return None
        pid = int(ready[0][1])
        if (not 1 < pid < 2**31 or not units[0].startswith(f"programmable-notes-preview-{pid}-")
                or not 0 < int(ready[0][2]) < 2**64 or not 0 < int(ready[0][3]) < 2**64):
            raise Refused("host_not_ready")
        current = identity(pid)
        if current is None or current["state"] == "Z" or os.readlink(f"/proc/{pid}/exe") != str(ROOT / "host"):
            raise Refused("host_not_ready")
        return {"unit": units[0], "host_pid": pid, "host_start": current["start"], "socket": int(ready[0][2]), "host_xid": int(ready[0][3])}

    def host_live(self, host):
        current = identity(host["host_pid"])
        if current is None or current["start"] != host["host_start"] or current["state"] == "Z":
            raise Refused("identity_changed")

    def target(self, unit):
        return live(unit, min(self.absolute, time.monotonic() + 2))

    def bridge(self, host):
        for child in self.x.children(host["socket"]):
            if self.x.bridge(child):
                self.x.geometry(child)
                return child
        return None

    def state(self, child):
        return self.x.state(child)

    def readiness_state(self):
        return self.x.last_state

    def native_snapshot(self, child, start):
        # Existing _command permits a further one-second kill/reap wait. This is
        # nominally .5s work + 1s cleanup, not a hard realtime scheduling promise.
        try:
            now = time.monotonic()
            if (type(child) is not int or not 0 < child < 2**64
                    or not 0 <= now - start < 44.5 or self.absolute - now < 1.5):
                return None
            raw = _command(["/usr/bin/xprop", "-id", str(child), "-notype", "-f",
                            "_PN_FIXTURE_NATIVE", "8s", "_PN_FIXTURE_NATIVE"],
                           min(now + .5, start + 45, self.absolute), 1024)
            if time.monotonic() >= min(start + 46, self.absolute):
                return None
            return decode_native_snapshot(raw)
        except Exception:
            return None

    def gui(self, *args, deadline):
        _command(["/usr/bin/xdotool", *map(str, args)], min(self.absolute, deadline, time.monotonic() + 2))

    def journal(self, target, deadline):
        raw = _command(["/usr/bin/journalctl", "--user", "--user-unit=" + target["unit"], "--output=json", "--no-pager", "-n", "64"], min(deadline, self.absolute, time.monotonic() + 2), HOST_LIMIT)
        return [json.loads(line, object_pairs_hook=_pairs) for line in raw.splitlines()]

    def close(self):
        self.x.close()


def _wait(until, probe, reason):
    while time.monotonic() < until:
        value = probe()
        if value is not None and value is not False and time.monotonic() < until:
            return value
        time.sleep(min(.05, max(0, until - time.monotonic())))
    raise Refused(reason)


def _same(first, second):
    return all(first[key] == second[key] for key in ("unit", "pid", "start_identity", "group", "start"))


def run(case, evidence, backend, absolute):
    result = {"version": 1, "profile": "inline-react-v1", "case": case, "scope": "fixed-native-diagnostic-only",
              "native_app_tested": False, "status": "failed", "phase": "host", "reason": "none",
              **{key: "not_run" for key in OBSERVATIONS}}
    target = host = renderer = child = None
    known, unresolved = {}, set()
    failure = None
    def phase(value):
        result["phase"] = value
    def state_until(child, until, predicate, reason):
        def current():
            sample(target, known, unresolved)
            historical_alive(target, known, unresolved)
            renderer.tick(until)
            value = backend.state(child)
            return value if type(value) is dict and value["ready"] and predicate(value) else None
        return _wait(until, current, reason)
    try:
        host = _wait(min(absolute, time.monotonic() + 8), backend.host, "host_not_ready")
        target = backend.target(host["unit"])
        known[(target["pid"], target["start_identity"])] = "live"
        sample(target, known, unresolved)
        renderer = RendererPolicy(target, known, evidence)
        evidence.event("verified_live", unit=target["unit"], pid=target["pid"], start=target["start_identity"], group=target["group"], policy=target["policy"], host_net=target["host_net"], child_net=target["child_net"])
        phase("bridge")
        def bridge():
            sample(target, known, unresolved)
            historical_alive(target, known, unresolved)
            renderer.tick(min(absolute, target["start"] + 44))
            return backend.bridge(host)
        child = _wait(min(absolute, target["start"] + 44), bridge, "bridge_not_observed")
        result["bridge"] = "passed"
        evidence.event("native_bridge", child_xid=child)
        if case == "stop":
            phase("ready")
            state_until(child, min(absolute, target["start"] + 44), lambda state: state["count"] == 0 and state["field"] == "", "readiness_deadline")
            renderer.tick(min(absolute, target["start"] + 49), force=True)
            renderer.require()
            phase("pointer")
            until = min(absolute, target["start"] + 49)
            backend.gui("mousemove", "--window", child, 30, 15, "click", 1, "click", 1, deadline=until)
            state_until(child, until, lambda state: state["count"] == 2, "pointer_not_acknowledged")
            result["pointer"] = "passed"
            evidence.event("pointer_ack", count=2)
            phase("focus")
            backend.gui("mousemove", "--window", child, 170, 15, "click", 1, deadline=until)
            state_until(child, until, lambda state: state["focus"] == "field" and state["count"] == 2, "focus_not_acknowledged")
            phase("keyboard")
            backend.gui("type", "--clearmodifiers", "--delay", 1, "hello", deadline=until)
            state_until(child, until, lambda state: state["field"] == "hello" and state["focus"] == "field" and state["count"] == 2, "keyboard_not_acknowledged")
            result["keyboard"] = "passed"
            evidence.event("keyboard_ack", field="hello", focus="field")
    except Refused as error:
        readiness_event(evidence, backend, result["phase"])
        native_snapshot_event(evidence, backend, target, child, result["phase"])
        exception_event(evidence, result["phase"], error)
        failure = (result["phase"], error.reason)
    except Exception as error:
        readiness_event(evidence, backend, result["phase"])
        native_snapshot_event(evidence, backend, target, child, result["phase"])
        exception_event(evidence, result["phase"], error)
        failure = (result["phase"], "observer_error")
    if target is not None:
        try:
            if case == "stop":
                phase("stop")
                current = backend.target(host["unit"])
                if not _same(target, current):
                    raise Refused("identity_changed")
                if time.monotonic() >= min(absolute, target["start"] + 50):
                    raise Refused("stop_headroom")
                if sample(target, known, unresolved) is None:
                    raise Refused("identity_changed")
                historical_alive(target, known, unresolved)
                latest = identity(target["pid"])
                if latest is None or latest["start"] != target["start_identity"] or latest["state"] == "Z":
                    raise Refused("identity_changed")
                backend.host_live(host)
                clicked = time.monotonic()
                deadline = min(absolute, clicked + 5)
                evidence.event("verified_before_stop", unit=target["unit"], pid=target["pid"], start=target["start_identity"], unit_age=clicked-target["start"])
                backend.gui("mousemove", "--window", host["host_xid"], 50, 275, "click", 1, deadline=min(deadline, target["start"] + 50))
                phase("cleanup")
                cleanup(target, known, unresolved, deadline, pulse=lambda: renderer.tick(deadline))
                # The session drains trusted stdout concurrently. A completed
                # Stop may precede its log flush; share the SAME cleanup deadline.
                _wait(deadline, lambda: "HOST_BUTTON_STOP Ok(())" in evidence.host_log().splitlines(), "cleanup_deadline")
                cleanup(target, known, unresolved, deadline)
                result["termination"] = "passed"
                evidence.event("bounded_stop", elapsed=time.monotonic()-clicked, identities=[list(key) for key in known])
                phase("host_input")
                host_deadline = min(absolute, time.monotonic() + 2)
                backend.gui("mousemove", "--window", host["host_xid"], 60, 25, "click", 1, "key", "--clearmodifiers", "ctrl+a", "type", "--clearmodifiers", "--delay", 1, "hostok", deadline=host_deadline)
                _wait(host_deadline, lambda: "HOST_ENTRY hostok" in evidence.host_log().splitlines(), "host_input_not_acknowledged")
                backend.host_live(host)
                result["host_input"] = "passed"
            else:
                phase("expiry")
                deadline = min(absolute, target["start"] + 75)
                cleanup(target, known, unresolved, deadline, pulse=lambda: renderer.tick(deadline))
                if time.monotonic() < target["start"] + 60:
                    raise Refused("expiry_cause_missing")
                _wait(deadline, lambda: expiry_cause(backend.journal(target, deadline), target["unit"]), "expiry_cause_missing")
                if time.monotonic() >= deadline:
                    raise Refused("expiry_deadline")
                result["termination"] = "passed"
                evidence.event("expiry_cause", unit=target["unit"], uid=1001, runtime_limit=True, result_timeout=True)
        except Refused as error:
            exception_event(evidence, result["phase"], error)
            result["termination"] = "failed" if result["termination"] != "passed" else "passed"
            failure = failure or (result["phase"], error.reason)
        except Exception as error:
            exception_event(evidence, result["phase"], error)
            if result["termination"] != "passed":
                result["termination"] = "failed"
            failure = failure or (result["phase"], "observer_error")
    if renderer is not None and not renderer.seen:
        evidence.event("renderer_policy_not_observed")
    if failure is None and ((case == "stop" and all(result[key] == "passed" for key in OBSERVATIONS))
                            or (case == "expiry" and result["bridge"] == result["termination"] == "passed")):
        result.update(status="passed", phase="complete", reason="none")
    else:
        failed_phase, reason = failure or (result["phase"], "observer_error")
        result.update(phase=failed_phase, reason=reason)
        key = {"bridge": "bridge", "pointer": "pointer", "focus": "keyboard", "keyboard": "keyboard", "host_input": "host_input"}.get(failed_phase)
        if key is not None and result[key] != "passed":
            result[key] = "failed"
    return result


def observe(case):
    absolute = time.monotonic() + 85
    if case not in CASES or os.getuid() != 1001 or os.geteuid() != 1001:
        raise Refused("profile_refused")
    if (os.environ.get("DISPLAY") != ":93" or os.environ.get("XDG_RUNTIME_DIR") != "/run/user/1001"
            or os.environ.get("DBUS_SESSION_BUS_ADDRESS") != "unix:path=/run/user/1001/bus"
            or os.environ.get("XAUTHORITY") != str(ROOT / "run/auth/Xauthority")):
        raise Refused("profile_refused")
    auth = _open_directory(ROOT / "run/auth")
    try:
        _private(os.fstat(auth), True)
        fd = os.open("Xauthority", os.O_RDONLY | FLAGS, dir_fd=auth)
        try:
            _private(os.fstat(fd))
            if not 0 < os.fstat(fd).st_size <= 4096:
                raise Refused("profile_refused")
        finally:
            os.close(fd)
    finally:
        os.close(auth)
    evidence = Evidence(case)
    backend = None
    try:
        try:
            backend = Backend(evidence, absolute)
            result = run(case, evidence, backend, absolute)
        except Exception as error:
            exception_event(evidence, "admission", error)
            result = {"version": 1, "profile": "inline-react-v1", "case": case, "scope": "fixed-native-diagnostic-only",
                      "native_app_tested": False, "status": "failed", "phase": "admission",
                      "reason": error.reason if isinstance(error, Refused) else "observer_error",
                      **{key: "not_run" for key in OBSERVATIONS}}
        if time.monotonic() >= absolute:
            result.update(status="failed", reason="observer_error")
        evidence.finish(result)
        return result
    finally:
        if backend is not None:
            backend.close()
        evidence.close()


def main(argv=None):
    args = sys.argv[1:] if argv is None else argv
    if len(args) != 2 or args[0] != "--case" or args[1] not in CASES:
        return 2
    old = {}
    def interrupted(_number, _frame):
        raise Refused("observer_error")
    try:
        for number in (signal.SIGINT, signal.SIGTERM):
            old[number] = signal.signal(number, interrupted)
        return 0 if observe(args[1])["status"] == "passed" else 2
    except (Exception, KeyboardInterrupt):
        return 2
    finally:
        for number, handler in old.items():
            signal.signal(number, handler)


if __name__ == "__main__":
    sys.exit(main())
