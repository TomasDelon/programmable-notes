"""Sealed fixed diagnostic driver. No caller-selected payload, command or guest path.

Only --run ABS_PACKED_ROOT. Transport keys never enter the payload or guest.
Synthetic pipe controls do not establish native execution or application safety.
"""
from contextlib import contextmanager
import base64
import hashlib
import importlib.util
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
import tempfile
import time
from types import MappingProxyType, SimpleNamespace

SPEC = importlib.util.spec_from_file_location("inline_transport", Path(__file__).with_name("native-vm-smoke.py"))
transport = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(transport)
Refused = transport.Refused


class CleanupFailed(Exception):
    pass


REPOSITORY = Path(__file__).resolve().parents[1]
ROOT = "/home/fixture/native-inline-react-v1"
PROFILE = "inline-react-v1"
SCOPE = "fixed-native-diagnostic-only"
SOURCES = (
    "scripts/native-inline-react-v1/host/src/native_snapshot.rs",
    "scripts/native-inline-react-v1/host/src/main.rs", "scripts/native-inline-react-v1/host/build.rs",
    "scripts/native-inline-react-v1/host/Cargo.toml", "scripts/native-inline-react-v1/host/Cargo.lock",
    "scripts/native-inline-react-v1/compile.mjs", "scripts/native-inline-react-v1/document.mdx",
    "native-policy/src/lib.rs", "native-policy/Cargo.toml", "native-policy/Cargo.lock",
    "package.json", "package-lock.json", ".nvmrc",
)
PAYLOAD = MappingProxyType({
    "host": ("src-tauri/target/release/pn-native-inline-react-v1", 64 * 1024**2),
    "session.py": ("scripts/native-inline-react-v1/session.py", 256 * 1024),
    "observer.py": ("scripts/native-inline-react-v1/observer.py", 256 * 1024),
})
OBSERVATIONS = ("bridge", "pointer", "keyboard", "termination", "host_input")
STATES = {"passed", "failed", "not_run"}
CASE_PHASES = {"admission", "host", "bridge", "ready", "pointer", "focus", "keyboard", "stop",
               "cleanup", "host_input", "expiry", "complete"}
CASE_REASONS = {"none", "profile_refused", "host_not_ready", "policy_refused", "bridge_not_observed",
                "readiness_deadline", "fixture_error", "input_deadline", "pointer_not_acknowledged",
                "focus_not_acknowledged", "keyboard_not_acknowledged", "stop_headroom", "identity_changed",
                "migration_observed", "cleanup_deadline", "expiry_cause_missing", "expiry_deadline",
                "host_input_not_acknowledged", "observer_error", "evidence_limit", "command_failed"}
SESSION_PHASES = {"preflight", "desktop", "stop", "expiry", "cleanup", "complete"}
SESSION_REASONS = {"none", "preflight_refused", "desktop_failed", "observer_failed", "receipt_invalid",
                   "output_limit", "deadline", "interrupted", "cleanup_failed", "internal_error",
                   "xauth_deadline", "display_readiness_deadline", "xvfb_exited"}
HOST_STAGES = {"not_run", "unknown", "ready", "supervisor_start", "unit_ready", "start_failed"}
START_FAILURES = {"not_run", "none", "unknown", "unit_not_active", "network_not_isolated",
                  "privileges_missing", "invalid_limits", "input_rejected"}
EVIDENCE = MappingProxyType({
    "session.json": ("run/session.json", 16384),
    **{f"{case}-{name}": (f"run/evidence/{case}/{name}", limit)
       for case in ("stop", "expiry") for name, limit in
       (("result.json", 16384), ("events.jsonl", 256 * 1024))},
})
BUILD_PREFIX = b"PN_INLINE_REACT_V1_BUILD\0"
BUILD_SUFFIX = b"\0PN_INLINE_REACT_V1_BUILD_END\0"
DEPENDENCIES = ("@mdx-js/mdx", "esbuild", "react", "react-dom", "scheduler")


def _digest(raw):
    return hashlib.sha256(raw).hexdigest()


def _capture(path, limit):
    relative = path.relative_to(REPOSITORY).as_posix()
    allowed = set(SOURCES) | {value[0] for value in PAYLOAD.values()} | {
        "node_modules/" + name + "/package.json" for name in DEPENDENCIES}
    if relative not in allowed:
        raise Refused()
    # Scoped npm package names contain '@'; do not weaken the packed-root
    # grammar to read them. Only this fixed source allowlist can enter this walk.
    fd = transport.guard._open_absolute(str(REPOSITORY), directory=True)
    try:
        parts = relative.split("/")
        for index, part in enumerate(parts):
            flags = transport.guard.FLAGS | os.O_RDONLY
            if index < len(parts) - 1:
                flags |= os.O_DIRECTORY
            child = os.open(part, flags, dir_fd=fd)
            os.close(fd)
            fd = child
    except BaseException:
        os.close(fd)
        raise
    try:
        before = os.fstat(fd)
        if (not stat.S_ISREG(before.st_mode) or before.st_uid != os.getuid()
                or before.st_size <= 0 or before.st_size > limit or before.st_mode & 0o022):
            raise Refused()
        # Cargo can hardlink its trusted output into deps/. Freeze bytes rather
        # than treating the build output's pathname or link count as authority.
        raw = bytearray()
        while len(raw) <= limit:
            chunk = os.read(fd, min(65536, limit + 1 - len(raw)))
            if not chunk:
                break
            raw.extend(chunk)
        after = os.fstat(fd)
        named = os.stat(path, follow_symlinks=False)
        identity = transport._identity
        if len(raw) != before.st_size or identity(before) != identity(after) or identity(before) != identity(named):
            raise Refused()
        return bytes(raw)
    finally:
        os.close(fd)


def _build_evidence(binary, sources):
    # Trusted build producer, not a supply-chain attestation. Never execute the
    # native host or evaluate its generated document on the controller.
    if binary.count(BUILD_PREFIX) != 1 or binary.count(BUILD_SUFFIX) != 1:
        raise Refused()
    start = binary.index(BUILD_PREFIX) + len(BUILD_PREFIX)
    if len(binary) < start + 4:
        raise Refused()
    length = struct.unpack(">I", binary[start:start + 4])[0]
    if not 0 < length <= 16384 or binary[start + 4 + length:start + 4 + length + len(BUILD_SUFFIX)] != BUILD_SUFFIX:
        raise Refused()
    build = _json(binary[start + 4:start + 4 + length], 16384)
    if (type(build) is not dict or set(build) != {"version", "profile", "scope", "nativeTested",
            "generatedCodeEvaluatedOnHost", "nodeVersion", "inputs", "dependencies", "artifacts", "receipt"}
            or type(build["version"]) is not int or build["version"] != 1 or build["profile"] != PROFILE
            or build["scope"] != "fixed-fixture-build-only" or build["nativeTested"] is not False
            or build["generatedCodeEvaluatedOnHost"] is not False):
        raise Refused()
    node = sources[".nvmrc"].decode("ascii").strip()
    if re.fullmatch(r"[0-9]+\.[0-9]+\.[0-9]+", node) is None or build["nodeVersion"] != "v" + node:
        raise Refused()
    expected = {"sourceSha256": _digest(sources["scripts/native-inline-react-v1/document.mdx"]),
                "compilerSha256": _digest(sources["scripts/native-inline-react-v1/compile.mjs"]),
                "packageJsonSha256": _digest(sources["package.json"]),
                "packageLockSha256": _digest(sources["package-lock.json"])}
    if build["inputs"] != expected:
        raise Refused()
    project, lock = _json(sources["package.json"], 8 * 1024**2), _json(sources["package-lock.json"], 8 * 1024**2)
    if type(build["dependencies"]) is not dict or set(build["dependencies"]) != set(DEPENDENCIES):
        raise Refused()
    for name in DEPENDENCIES:
        metadata = _capture(REPOSITORY / "node_modules" / name / "package.json", 1024 * 1024)
        version = _json(metadata, 1024 * 1024).get("version")
        pinned = project.get("dependencies", {}).get(name, project.get("devDependencies", {}).get(name))
        if (type(version) is not str or not 0 < len(version) <= 128
                or version != lock.get("packages", {}).get("node_modules/" + name, {}).get("version")
                or (pinned is not None and version != pinned)
                or build["dependencies"][name] != {"version": version, "packageJsonSha256": _digest(metadata)}):
            raise Refused()
    artifacts = build["artifacts"]
    if type(artifacts) is not dict or set(artifacts) != {
            part + suffix for part in ("compiledMdx", "javascript", "html") for suffix in ("Sha256", "Bytes")}:
        raise Refused()
    for part in ("compiledMdx", "javascript", "html"):
        size, digest = artifacts[part + "Bytes"], artifacts[part + "Sha256"]
        if (type(size) is not int or not 0 < size <= 4 * 1024**2
                or type(digest) is not str or re.fullmatch(r"[0-9a-f]{64}", digest) is None):
            raise Refused()
    if build["receipt"] != {"transport": "document-title", "maximumUtf8Bytes": 256,
            "maximumFieldCodeUnits": 16, "errorCodes": ["runtime-error", "unhandled-rejection", "react-error", "receipt-overflow"]}:
        raise Refused()
    return build


@contextmanager
def _prepare():
    # This executes before guest launch, outside the packed root and its auth.
    files = {name: _capture(REPOSITORY / relative, limit) for name, (relative, limit) in PAYLOAD.items()}
    if not files["host"].startswith(b"\x7fELF"):
        raise Refused()
    sources = {name: _capture(REPOSITORY / name, 8 * 1024**2) for name in SOURCES}
    build = _build_evidence(files["host"], sources)
    manifest = {"version": 1, "profile": PROFILE, "native_app_tested": False,
                "files": {name: {"bytes": len(raw), "sha256": _digest(raw)} for name, raw in files.items()},
                "sources": {name: _digest(raw) for name, raw in sources.items()}}
    encoded = (json.dumps(manifest, sort_keys=True, separators=(",", ":")) + "\n").encode()
    if len(encoded) > 16384:
        raise Refused()
    files["manifest.json"] = encoded
    with tempfile.TemporaryDirectory(prefix="pn-inline-payload-") as temporary:
        directory = Path(temporary)
        os.chmod(directory, 0o700)
        for name, raw in files.items():
            fd = os.open(directory / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC, 0o400)
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
        yield SimpleNamespace(directory=directory, files=MappingProxyType(files), manifest_sha256=_digest(encoded), build_evidence=build)


def _sftp_argv(root_path):
    # Only the subsystem changes; preserve the exact restrictive SSH options.
    original = transport._ssh(root_path + "/auth/controller_ed25519", root_path + "/auth/known_hosts")
    return original[:-4] + ["-s", "fixture@127.0.0.1", "sftp"]


def _string(raw):
    return struct.pack(">I", len(raw)) + raw


class _Sftp:
    """Only the v3 operations needed for four fixed puts and named bounded gets.

    The direct owned SSH child runs the subsystem: no host sftp grandchild, shell,
    remote archive extraction, globbing, recursive download or unbounded file sink.
    """
    def __init__(self, process):
        self.process, self.identifier = process, 0
        self.deadline = time.monotonic() + 60
        self.input, self.output = process.stdin.fileno(), process.stdout.fileno()
        os.set_blocking(self.input, False)
        os.set_blocking(self.output, False)
        self._write(struct.pack(">IBI", 5, 1, 3))
        kind, raw = self.packet()
        if kind != 2 or len(raw) < 4 or struct.unpack(">I", raw[:4])[0] != 3:
            raise Refused()

    def _wait(self, fd, event):
        remaining = self.deadline - time.monotonic()
        if remaining <= 0:
            raise TimeoutError()
        with selectors.DefaultSelector() as selector:
            selector.register(fd, event)
            if not selector.select(remaining):
                raise TimeoutError()

    def _write(self, raw):
        view = memoryview(raw)
        while view:
            self._wait(self.input, selectors.EVENT_WRITE)
            try:
                count = os.write(self.input, view)
            except BlockingIOError:
                continue
            if count <= 0:
                raise Refused()
            view = view[count:]

    def _read(self, amount):
        result = bytearray()
        while len(result) < amount:
            self._wait(self.output, selectors.EVENT_READ)
            try:
                raw = os.read(self.output, amount - len(result))
            except BlockingIOError:
                continue
            if not raw:
                raise Refused()
            result.extend(raw)
        return bytes(result)

    def packet(self):
        size = struct.unpack(">I", self._read(4))[0]
        if not 1 <= size <= 65536:
            raise Refused()
        raw = self._read(size)
        return raw[0], raw[1:]

    def request(self, kind, raw, expected, *, missing=False):
        self.identifier += 1
        payload = bytes([kind]) + struct.pack(">I", self.identifier) + raw
        self._write(struct.pack(">I", len(payload)) + payload)
        received, reply = self.packet()
        if len(reply) < 4 or struct.unpack(">I", reply[:4])[0] != self.identifier:
            raise Refused()
        reply = reply[4:]
        if received == 101:
            if len(reply) < 4:
                raise Refused()
            status = struct.unpack(">I", reply[:4])[0]
            if missing and status in (1, 2):
                return None
            if expected != 101 or status != 0:
                raise Refused()
            return b""
        if received != expected:
            raise Refused()
        return reply

    @staticmethod
    def blob(raw):
        if len(raw) < 4:
            raise Refused()
        size = struct.unpack(">I", raw[:4])[0]
        if size != len(raw) - 4:
            raise Refused()
        return raw[4:]

    def put(self, name, raw):
        # EXCL is mandatory: even an intervening creator must not be overwritten.
        reply = self.request(3, _string((ROOT + "/" + name).encode()) + struct.pack(">III", 0x2 | 0x8 | 0x20, 4, 0o600), 102)
        handle = self.blob(reply)
        if not 0 < len(handle) <= 256:
            raise Refused()
        for offset in range(0, len(raw), 32768):
            self.request(6, _string(handle) + struct.pack(">Q", offset) + _string(raw[offset:offset + 32768]), 101)
        self.request(4, _string(handle), 101)



def _json(raw, limit):
    if type(raw) is not bytes or not 0 < len(raw) <= limit:
        raise Refused()
    try:
        return json.loads(raw, object_pairs_hook=transport.guard._pairs)
    except (ValueError, UnicodeError):
        raise Refused() from None


def _base(value):
    if (type(value) is not dict or type(value.get("version")) is not int or value["version"] != 1
            or value.get("profile") != PROFILE or value.get("scope") != SCOPE
            or value.get("native_app_tested") is not False or value.get("status") not in {"passed", "failed"}):
        raise Refused()


def _case_receipt(raw, case):
    value = _json(raw, 16384)
    _base(value)
    if (set(value) != {"version", "profile", "scope", "native_app_tested", "status", "case", "phase", "reason", *OBSERVATIONS}
            or value["case"] != case or value["phase"] not in CASE_PHASES or value["reason"] not in CASE_REASONS
            or any(value[name] not in STATES for name in OBSERVATIONS)):
        raise Refused()
    if value["status"] == "passed":
        expected = {name: "passed" if case == "stop" or name in {"bridge", "termination"} else "not_run" for name in OBSERVATIONS}
        if value["phase"] != "complete" or value["reason"] != "none" or any(value[name] != state for name, state in expected.items()):
            raise Refused()
    return value


def _case_diagnostics(value):
    """Optional advisory data: invalid details cannot alter the core outcome."""
    if type(value) is not dict or set(value) != {"stop", "expiry"}:
        return None
    result = {}
    for case in ("stop", "expiry"):
        item = value[case]
        if (type(item) is not dict or set(item) != {"original_reason", "host_exit", "observer_exit", "host_stage", "start_failure"}
                or type(item["original_reason"]) is not str or item["original_reason"] not in SESSION_REASONS | {"not_run"}
                or type(item["host_stage"]) is not str or item["host_stage"] not in HOST_STAGES
                or type(item["start_failure"]) is not str or item["start_failure"] not in START_FAILURES):
            return None
        copied = {name: item[name] for name in ("original_reason", "host_stage", "start_failure")}
        for name in ("host_exit", "observer_exit"):
            exit_value = item[name]
            if (type(exit_value) is not dict or set(exit_value) != {"state", "code"}
                    or type(exit_value["state"]) is not str
                    or exit_value["state"] not in {"not_started", "running", "exited", "unknown"}):
                return None
            code = exit_value["code"]
            if exit_value["state"] == "exited":
                if type(code) is not int or not -64 <= code <= 255:
                    return None
            elif code is not None:
                return None
            copied[name] = {"state": exit_value["state"], "code": code}
        result[case] = copied
    return result


def _session_receipt(raw):
    value = _json(raw, 16384)
    _base(value)
    required = {"version", "profile", "scope", "native_app_tested", "status", "phase", "reason", "cases", "cleanup"}
    if (not required <= set(value) or set(value) - required - {"diagnostics"}
            or value["phase"] not in SESSION_PHASES or value["reason"] not in SESSION_REASONS
            or type(value["cases"]) is not dict or set(value["cases"]) != {"stop", "expiry"}
            or any(state not in STATES for state in value["cases"].values()) or value["cleanup"] not in STATES):
        raise Refused()
    if value["status"] == "passed" and (value["phase"] != "complete" or value["reason"] != "none"
            or set(value["cases"].values()) != {"passed"} or value["cleanup"] != "passed"):
        raise Refused()
    if "diagnostics" in value:
        diagnostic = _case_diagnostics(value.pop("diagnostics"))
        if diagnostic is not None:
            value["diagnostics"] = diagnostic
    return value


BOOTSTRAP = (f"import os,stat\nassert os.getuid()==os.geteuid()==1001\n"
             f"os.mkdir('{ROOT}',0o700)\n").encode()


def _execution_code(prepared):
    # All inserted text is a locally computed hex digest. No caller strings.
    return ("import hashlib,json,os,stat\n"
            f"root='{ROOT}'\nassert os.getuid()==os.geteuid()==1001\n"
            "fd=os.open(root,os.O_RDONLY|os.O_DIRECTORY|os.O_NOFOLLOW)\n"
            "assert stat.S_IMODE(os.fstat(fd).st_mode)==0o700\n"
            "assert set(os.listdir(fd))=={'host','session.py','observer.py','manifest.json'}\n"
            "def read(name,limit,mode):\n"
            " f=os.open(name,os.O_RDONLY|os.O_NOFOLLOW|os.O_NONBLOCK,dir_fd=fd)\n"
            " try:\n"
            "  node=os.fstat(f); assert stat.S_ISREG(node.st_mode) and node.st_uid==1001 and node.st_nlink==1 and 0<node.st_size<=limit and stat.S_IMODE(node.st_mode)==0o600\n"
            "  raw=bytearray()\n"
            "  while len(raw)<=limit:\n"
            "   chunk=os.read(f,min(65536,limit+1-len(raw)))\n"
            "   if not chunk: break\n"
            "   raw.extend(chunk)\n"
            "  assert len(raw)==node.st_size; os.fchmod(f,mode); return bytes(raw)\n"
            " finally: os.close(f)\n"
            "raw=read('manifest.json',16384,0o600)\n"
            f"assert hashlib.sha256(raw).hexdigest()=='{prepared.manifest_sha256}'\n"
            "manifest=json.loads(raw)\n"
            "for name,limit,mode in [('host',67108864,0o700),('session.py',262144,0o600),('observer.py',262144,0o600)]:\n"
            " raw=read(name,limit,mode); expected=manifest['files'][name]\n"
            " assert len(raw)==expected['bytes'] and hashlib.sha256(raw).hexdigest()==expected['sha256']\n"
            "os.close(fd)\n"
            "os.execv('/usr/bin/python3',['/usr/bin/python3','-I',root+'/session.py'])\n").encode()


# No SFTP-v3 OPEN flag can guarantee nofollow. Collect through this fixed,
# descriptor-relative read-only program instead of downloading path aliases.
COLLECT = ("import base64,json,os,stat\n"
           f"paths={repr(dict(EVIDENCE))}\n"
           "flags=os.O_RDONLY|os.O_CLOEXEC|os.O_NOFOLLOW|os.O_NONBLOCK\n"
           "fd=os.open('/',flags|os.O_DIRECTORY)\n"
           f"for part in '{ROOT}'.strip('/').split('/'):\n"
           " child=os.open(part,flags|os.O_DIRECTORY,dir_fd=fd); os.close(fd); fd=child\n"
           "assert os.getuid()==os.geteuid()==1001\n"
           "node=os.fstat(fd); assert node.st_uid==1001 and stat.S_IMODE(node.st_mode)==0o700\n"
           "files={}\n"
           "def identity(n): return (n.st_dev,n.st_ino,n.st_uid,n.st_mode,n.st_nlink,n.st_size,n.st_mtime_ns,n.st_ctime_ns)\n"
           "for name,(relative,limit) in paths.items():\n"
           " parent=os.dup(fd); leaf=None\n"
           " try:\n"
           "  parts=relative.split('/')\n"
           "  for part in parts[:-1]:\n"
           "   child=os.open(part,flags|os.O_DIRECTORY,dir_fd=parent); os.close(parent); parent=child\n"
           "   node=os.fstat(parent); assert node.st_uid==1001 and stat.S_IMODE(node.st_mode)==0o700\n"
           "  leaf=os.open(parts[-1],flags,dir_fd=parent); before=os.fstat(leaf)\n"
           "  assert stat.S_ISREG(before.st_mode) and before.st_uid==1001 and before.st_nlink==1 and stat.S_IMODE(before.st_mode)==0o600 and before.st_size<=limit\n"
           "  raw=bytearray()\n"
           "  while len(raw)<=limit:\n"
           "   chunk=os.read(leaf,min(65536,limit+1-len(raw)))\n"
           "   if not chunk: break\n"
           "   raw.extend(chunk)\n"
           "  assert len(raw)==before.st_size and identity(before)==identity(os.fstat(leaf))==identity(os.stat(parts[-1],dir_fd=parent,follow_symlinks=False))\n"
           "  files[name]=base64.b64encode(raw).decode('ascii')\n"
           " except FileNotFoundError:\n"
           "  if name=='session.json': raise\n"
           " finally:\n"
           "  if leaf is not None: os.close(leaf)\n"
           "  os.close(parent)\n"
           "os.close(fd)\nprint(json.dumps({'version':1,'files':files},sort_keys=True))\n").encode()


def _collection(raw):
    envelope = _json(raw, 1024 * 1024)
    if (type(envelope) is not dict or set(envelope) != {"version", "files"}
            or type(envelope["version"]) is not int or envelope["version"] != 1
            or type(envelope["files"]) is not dict or set(envelope["files"]) - set(EVIDENCE)
            or "session.json" not in envelope["files"]):
        raise Refused()
    result = {}
    for name, encoded in envelope["files"].items():
        if type(encoded) is not str or len(encoded) > 4 * ((EVIDENCE[name][1] + 2) // 3):
            raise Refused()
        try:
            decoded = base64.b64decode(encoded, validate=True)
        except ValueError:
            raise Refused() from None
        if len(decoded) > EVIDENCE[name][1] or base64.b64encode(decoded).decode("ascii") != encoded:
            raise Refused()
        result[name] = decoded
    return result


def _diagnostic_module():
    spec = importlib.util.spec_from_file_location(
        "fixed_observer_diagnostics", Path(__file__).with_name("native-inline-react-diagnostics.py"))
    module = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(module)
    return module


def _observer_exceptions(collected, cases, source):
    result = {}
    try:
        helper = _diagnostic_module()
        for case in ("stop", "expiry"):
            value = cases.get(case)
            if value is not None and value["status"] == "failed":
                detail = helper.extract_observer_exception(
                    collected.get(case + "-events.jsonl", b""), source, value["phase"])
                if detail is not None:
                    result[case] = detail
    except Exception:
        return {}  # Optional diagnosis never replaces the original witness.
    return result


def _readiness_states(collected, cases, source):
    try:
        value = cases.get("stop")
        if value is None or value["status"] != "failed" or value["phase"] != "ready":
            return {}
        detail = _diagnostic_module().extract_readiness_state(collected.get("stop-events.jsonl", b""), source, "ready")
        return {"stop": detail} if detail is not None else {}
    except Exception:
        return {}  # Optional diagnosis never changes admission or the outcome.


def _native_snapshots(collected, cases, source, readiness):
    try:
        case = cases.get("stop")
        if case is None or case["status"] != "failed" or case["phase"] != "ready":
            return {}
        state = readiness["stop"]["state"]
        detail = _diagnostic_module().extract_native_snapshot(collected.get("stop-events.jsonl", b""), source, "ready", state)
        return {"stop": detail} if detail is not None else {}
    except Exception:
        return {}


def _run_admitted(root_path, witnesses, guard_process, prepared):
    # This private entry is called only by the sealed smoke branch after all OS
    # and pin/key controls. Every new connection rechecks host identity witnesses.
    def check():
        if guard_process.poll() is not None:
            raise Refused()
        transport._revalidate(witnesses)
    def ssh(code, timeout, limit=4096):
        check()
        if len(code) > 4096:
            raise Refused()
        args = transport._ssh(root_path + "/auth/controller_ed25519", root_path + "/auth/known_hosts")
        with transport._owned(args, stdin=subprocess.PIPE) as process:
            return transport._drain(process, timeout, limit=limit, payload=code)
    @contextmanager
    def sftp():
        check()
        with transport._owned(_sftp_argv(root_path), stdin=subprocess.PIPE) as process:
            yield _Sftp(process)
            process.stdin.close()
            status, output = transport._drain(process, 5)
            if status != 0 or output:
                raise Refused()
    try:
        status, _ = ssh(BOOTSTRAP, 10)
        if status != 0:
            raise Refused()
        with sftp() as wire:
            for name, raw in prepared.files.items():
                wire.put(name, raw)
        status, _ = ssh(_execution_code(prepared), 200)
        if status not in (0, 2):
            raise Refused()
        collect_status, envelope = ssh(COLLECT, 20, 1024 * 1024)
        if collect_status != 0:
            raise Refused()
        collected = _collection(envelope)
        session = _session_receipt(collected.get("session.json"))
        if (status == 0) != (session["status"] == "passed"):
            raise Refused()
        cases = {}
        for case in ("stop", "expiry"):
            raw = collected.get(f"{case}-result.json")
            if raw is None:
                if session["cases"][case] != "not_run":
                    raise Refused()
                continue
            cases[case] = _case_receipt(raw, case)
            if cases[case]["status"] != session["cases"][case]:
                raise Refused()
            if cases[case]["status"] == "passed" and not collected.get(f"{case}-events.jsonl"):
                raise Refused()
        # Preserve public bounded evidence as bytes only; never interpret event
        # strings as admission, commands, paths or public console annotations.
        evidence = Path(root_path) / "checks/inline-react-evidence"
        evidence.mkdir(mode=0o700)
        for name, raw in collected.items():
            fd = os.open(evidence / name, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_CLOEXEC | os.O_NOFOLLOW, 0o600)
            with os.fdopen(fd, "wb") as stream:
                stream.write(raw)
        passed = (session["status"] == "passed" and len(cases) == 2
                  and all(value["status"] == "passed" for value in cases.values()))
        result = {"version": 1, "profile": PROFILE, "scope": SCOPE, "native_app_tested": False,
                "status": "passed" if passed else "failed", "session": session, "cases": cases,
                "build": prepared.build_evidence,
                "payload": _json(prepared.files["manifest.json"], 16384),
                "manifest_sha256": prepared.manifest_sha256,
                "evidence_sha256": {name: _digest(raw) for name, raw in collected.items()}}
        exceptions = _observer_exceptions(collected, cases, prepared.files["observer.py"])
        if exceptions:
            result["observer_exceptions"] = exceptions
        readiness = _readiness_states(collected, cases, prepared.files["observer.py"])
        if readiness:
            result["readiness_states"] = readiness
        snapshots = _native_snapshots(collected, cases, prepared.files["observer.py"], readiness)
        if snapshots:
            result["native_snapshots"] = snapshots
        keyboard = _keyboard_attempts(collected, cases, prepared.files["observer.py"])
        if keyboard:
            result["keyboard_attempts"] = keyboard
        return result
    except transport.CleanupFailed:
        raise CleanupFailed() from None
    except transport.TimedOut:
        raise TimeoutError() from None


def _observer_exception_notices(result, cases, prefix):
    values = result.get("observer_exceptions")
    if type(values) is not dict or set(values) - {"stop", "expiry"} or not values:
        return []
    try:
        expected = result["payload"]["files"]["observer.py"]["sha256"]
        source = _capture(REPOSITORY / PAYLOAD["observer.py"][0], PAYLOAD["observer.py"][1])
        if type(expected) is not str or _digest(source) != expected:
            return []
        helper = _diagnostic_module()
        notices = []
        for case in ("stop", "expiry"):
            if case not in values or cases[case]["status"] != "failed":
                continue
            detail = helper.validate_observer_exception(values[case], source, cases[case]["phase"])
            if detail is None:
                continue
            frames = ",".join(frame["function"] + ":" + str(frame["line"]) for frame in detail["frames"])
            notices.append(prefix + "case=" + case + " observer_exception_phase=" + detail["phase"]
                           + " error_type=" + detail["error_type"]
                           + " errno=" + ("none" if detail["errno"] is None else str(detail["errno"]))
                           + " frames=" + (frames or "none"))
        return notices
    except Exception:
        return []  # Changed/missing source or invalid details omit only diagnosis.


def _readiness_state_notices(result, cases, prefix):
    try:
        values = result.get("readiness_states")
        if type(values) is not dict or set(values) != {"stop"} or cases["stop"]["status"] != "failed" or cases["stop"]["phase"] != "ready":
            return []
        expected = result["payload"]["files"]["observer.py"]["sha256"]
        source = _capture(REPOSITORY / PAYLOAD["observer.py"][0], PAYLOAD["observer.py"][1])
        if type(expected) is not str or _digest(source) != expected:
            return []
        detail = _diagnostic_module().validate_readiness_state(values["stop"], source, "ready")
        if detail is None:
            return []
        return [prefix + "case=stop readiness_phase=ready readiness_state=" + detail["state"]]
    except Exception:
        return []  # No raw title, field or script/error string is ever printed.


def _native_snapshot_notices(result, cases, prefix):
    try:
        values = result.get("native_snapshots")
        if (type(values) is not dict or set(values) != {"stop"}
                or cases["stop"]["status"] != "failed" or cases["stop"]["phase"] != "ready"):
            return []
        expected = result["payload"]["files"]["observer.py"]["sha256"]
        source = _capture(REPOSITORY / PAYLOAD["observer.py"][0], PAYLOAD["observer.py"][1])
        if type(expected) is not str or _digest(source) != expected:
            return []
        helper = _diagnostic_module()
        readiness = result.get("readiness_states")
        if type(readiness) is not dict or set(readiness) != {"stop"}:
            return []
        state = helper.validate_readiness_state(readiness["stop"], source, "ready")
        if state is None:
            return []
        detail = helper.validate_native_snapshot(values["stop"], source, "ready", state["state"])
        if detail is None:
            return []
        fields = ["native_" + key + "=" + str(detail[key]).lower() for key in helper.NATIVE_FLAGS]
        return [prefix + "case=stop " + " ".join(fields) + " native_termination=" + detail["termination"]]
    except Exception:
        return []  # Advisory only: no raw property/URI/error enters annotations.


def _keyboard_attempts(collected, cases, source):
    try:
        case = cases.get("stop")
        if case is None or case["pointer"] != "passed" or case["bridge"] != "passed":
            return {}
        detail = _diagnostic_module().extract_keyboard_attempt(collected.get("stop-events.jsonl", b""), source, case["phase"])
        return {"stop": detail} if detail is not None else {}
    except Exception:
        return {}


def _keyboard_attempt_notices(result, cases, prefix):
    try:
        values = result.get("keyboard_attempts")
        if (type(values) is not dict or set(values) != {"stop"}
                or cases["stop"]["pointer"] != "passed" or cases["stop"]["bridge"] != "passed"):
            return []
        expected = result["payload"]["files"]["observer.py"]["sha256"]
        source = _capture(REPOSITORY / PAYLOAD["observer.py"][0], PAYLOAD["observer.py"][1])
        if type(expected) is not str or _digest(source) != expected:
            return []
        detail = _diagnostic_module().validate_keyboard_attempt(values["stop"], source, cases["stop"]["phase"])
        if detail is None:
            return []
        return [prefix + "case=stop keyboard_available_ms=" + str(detail["availableMs"])
                + " keyboard_limiting_clock=" + detail["limitingClock"]
                + " keyboard_elapsed_ms=" + str(detail["elapsedMs"])
                + " keyboard_timeout_kind=" + detail["timeoutKind"]
                + " keyboard_outcome=" + detail["outcome"]]
    except Exception:
        return []  # No raw argv/output/exception/diagnostic data enters notices.


def _summary_notices(result):
    # Build the entire fixed-enum output before printing anything. An invalid
    # later case must not leave a partial annotation that looks validated.
    _base(result)
    if result.get("guard_normal_exit") is not True or type(result.get("cases")) is not dict:
        raise Refused()
    session = _session_receipt(json.dumps(result.get("session")).encode())
    cases = {}
    if set(result["cases"]) - {"stop", "expiry"}:
        raise Refused()
    for case in ("stop", "expiry"):
        if case not in result["cases"]:
            if session["cases"][case] != "not_run":
                raise Refused()
            cases[case] = {"status": "not_run", "phase": "not_run", "reason": "not_run",
                           **{name: "not_run" for name in OBSERVATIONS}}
        else:
            cases[case] = _case_receipt(json.dumps(result["cases"][case]).encode(), case)
            if cases[case]["status"] != session["cases"][case]:
                raise Refused()
    passed = session["status"] == "passed" and all(value["status"] == "passed" for value in cases.values())
    if (result["status"] == "passed") != passed:
        raise Refused()
    prefix = ("::notice title=Fixed inline React diagnostic::profile=inline-react-v1 "
              "scope=fixed-native-diagnostic-only native_app_tested=false ")
    notices = [prefix + "session_status=" + session["status"] + " session_phase=" + session["phase"]
               + " session_reason=" + session["reason"] + " cleanup=" + session["cleanup"]]
    for case, value in cases.items():
        fields = ["case=" + case] + [name + "=" + value[name]
                                    for name in ("status", "phase", "reason", *OBSERVATIONS)]
        notices.append(prefix + " ".join(fields))
    for case, diagnostic in session.get("diagnostics", {}).items():
        fields = ["case=" + case, "diagnostic_original_reason=" + diagnostic["original_reason"]]
        for process in ("host", "observer"):
            value = diagnostic[process + "_exit"]
            fields.extend((process + "_state=" + value["state"],
                           process + "_code=" + ("none" if value["code"] is None else str(value["code"]))))
        fields.extend(("host_stage=" + diagnostic["host_stage"], "start_failure=" + diagnostic["start_failure"]))
        notices.append(prefix + " ".join(fields))
    notices.extend(_observer_exception_notices(result, cases, prefix))
    notices.extend(_readiness_state_notices(result, cases, prefix))
    notices.extend(_native_snapshot_notices(result, cases, prefix))
    notices.extend(_keyboard_attempt_notices(result, cases, prefix))
    return notices


def main(argv=None):
    previous = {}
    try:
        args = sys.argv[1:] if argv is None else argv
        if len(args) != 2 or args[0] != "--run":
            raise Refused()
        transport.guard._absolute(args[1])
        def interrupted(_number, _frame):
            raise Refused()
        for number in (signal.SIGINT, signal.SIGTERM):
            previous[number] = signal.signal(number, interrupted)
        result = transport._smoke(args[1], inline_react=True)
        notices = _summary_notices(result)
        for notice in notices:
            print(notice)
        if (type(result) is not dict or result.get("status") != "passed"
                or result.get("native_app_tested") is not False or result.get("guard_normal_exit") is not True):
            raise Refused()
    except (Exception, KeyboardInterrupt):
        print("NATIVE_INLINE_REACT_FIXTURE_REFUSED")
        return 2
    finally:
        for number, handler in previous.items():
            signal.signal(number, handler)
    print("NATIVE_INLINE_REACT_FIXTURE_PASSED")
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
