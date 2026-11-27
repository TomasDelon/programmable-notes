"""Fixed driver controls using synthetic artifacts/SSH pipes, never a guest."""
from contextlib import redirect_stdout
import base64
import builtins
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import struct
import subprocess
import sys
import tempfile
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/native-vm-inline-react.py"


class Driver(unittest.TestCase):
    def test_keyboard_attempt_notices_are_optional_closed_and_frozen_source_bound(self):
        source = b"def own():\n    pass\n"
        path = self.repo / self.driver.PAYLOAD["observer.py"][0]
        path.write_bytes(source)
        result = self.summary(False)
        result["cases"]["stop"]["reason"] = "command_failed"
        detail = {"phase": "keyboard", "availableMs": 2000, "limitingClock": "local", "elapsedMs": 2010, "timeoutKind": "pipe_wait", "outcome": "failed"}
        row = {"event": "keyboard_attempt", "elapsed": 44, **detail}
        collected = {"stop-events.jsonl": (json.dumps(row) + "\n").encode()}
        details = self.driver._keyboard_attempts(collected, result["cases"], source)
        self.assertEqual(details, {"stop": detail})
        result.update(keyboard_attempts=details, payload={"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}})
        text = " ".join(self.driver._summary_notices(result))
        self.assertIn("keyboard_available_ms=2000 keyboard_limiting_clock=local keyboard_elapsed_ms=2010 keyboard_timeout_kind=pipe_wait keyboard_outcome=failed", text)
        self.assertIn("reason=command_failed", text)
        result["keyboard_attempts"]["stop"]["raw"] = "PRIVATE%0A::error"
        text = " ".join(self.driver._summary_notices(result))
        self.assertNotIn("keyboard_available_ms=", text)
        self.assertNotIn("PRIVATE", text)
        del result["keyboard_attempts"]["stop"]["raw"]
        path.write_bytes(b"def changed():\n    pass\n")
        self.assertNotIn("keyboard_available_ms=", " ".join(self.driver._summary_notices(result)))
        del result["keyboard_attempts"]
        self.assertEqual(len(self.driver._summary_notices(result)), 3)

    def test_native_snapshot_is_failure_only_category_and_source_bound(self):
        source = b"def own():\n    pass\n"
        path = self.repo / self.driver.PAYLOAD["observer.py"][0]
        path.write_bytes(source)
        result = self.summary(False)
        result["cases"]["stop"].update(phase="ready", reason="readiness_deadline")
        snapshot = {"version": 1, "built": True, "committed": False, "finished": False,
                    "navigation_denied": False, "load_failed": False, "termination": "none"}
        readiness = {"stop": {"phase": "ready", "state": "native_only"}}
        event = {"event": "native_snapshot", "elapsed": 44.1, "phase": "ready", "snapshot": snapshot}
        collected = {"stop-events.jsonl": (json.dumps(event) + "\n").encode()}
        details = self.driver._native_snapshots(collected, result["cases"], source, readiness)
        self.assertEqual(details, {"stop": snapshot})
        result.update(native_snapshots=details, readiness_states=readiness,
                      payload={"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}})
        self.assertIn("native_built=true", " ".join(self.driver._summary_notices(result)))
        for state in ("bootstrap_pending", "react_ready"):
            result["readiness_states"]["stop"]["state"] = state
            self.assertNotIn("native_built=", " ".join(self.driver._summary_notices(result)))
        result["readiness_states"]["stop"]["state"] = "missing"
        result["native_snapshots"]["stop"]["uri"] = "PRIVATE"
        self.assertNotIn("PRIVATE", " ".join(self.driver._summary_notices(result)))
        del result["native_snapshots"]["stop"]["uri"]
        path.write_bytes(b"def changed():\n    pass\n")
        self.assertNotIn("native_built=", " ".join(self.driver._summary_notices(result)))
        self.assertIn("scripts/native-inline-react-v1/host/src/native_snapshot.rs", self.driver.SOURCES)

    def test_readiness_enum_is_failed_ready_only_and_frozen_source_bound(self):
        source = b"def own():\n    pass\n"
        path = self.repo / self.driver.PAYLOAD["observer.py"][0]
        path.write_bytes(source)
        result = self.summary(False)
        result["cases"]["stop"].update(phase="ready", reason="readiness_deadline")
        event = {"event": "readiness_state", "elapsed": 44, "phase": "ready", "state": "bootstrap_pending"}
        details = self.driver._readiness_states({"stop-events.jsonl": (json.dumps(event) + "\n").encode()}, result["cases"], source)
        self.assertEqual(details, {"stop": {"phase": "ready", "state": "bootstrap_pending"}})
        result.update(readiness_states=details, payload={"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}})
        text = " ".join(self.driver._summary_notices(result))
        self.assertIn("case=stop readiness_phase=ready readiness_state=bootstrap_pending", text)
        path.write_bytes(b"def changed():\n    pass\n")
        self.assertNotIn("readiness_state=", " ".join(self.driver._summary_notices(result)))

    def test_unsafe_or_misplaced_readiness_omits_diagnostic_without_changing_failure(self):
        source = b"def own():\n    pass\n"
        (self.repo / self.driver.PAYLOAD["observer.py"][0]).write_bytes(source)
        result = self.summary(False)
        result["cases"]["stop"].update(phase="ready", reason="readiness_deadline")
        result["payload"] = {"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}}
        for value in (None, {"expiry": {"phase": "ready", "state": "native_only"}},
                      {"stop": {"phase": "ready", "state": "PRIVATE%0A::error"}},
                      {"stop": {"phase": "ready", "state": "native_only", "title": "PRIVATE"}}):
            result["readiness_states"] = value
            with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
            self.assertNotIn("readiness_state=", output.getvalue())
            self.assertNotIn("PRIVATE", output.getvalue())
            self.assertIn("reason=readiness_deadline", output.getvalue())
    @classmethod
    def setUpClass(cls):
        spec = importlib.util.spec_from_file_location("inline_driver_test", SCRIPT)
        cls.driver = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(cls.driver)

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-inline-driver-test-")
        self.addCleanup(self.temp.cleanup)
        self.repo = Path(self.temp.name)
        self.addCleanup(patch.stopall)
        patch.object(self.driver, "REPOSITORY", self.repo).start()
        for name in self.driver.SOURCES:
            path = self.repo / name
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"synthetic reviewed source\n")
        for name, (relative, _limit) in self.driver.PAYLOAD.items():
            path = self.repo / relative
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_bytes(b"\x7fELFsynthetic" if name == "host" else b"# fixed fixture\n")
        self.secret = self.repo / "controller_ed25519"
        self.secret.write_bytes(b"PRIVATE_CANARY_NEVER_TRANSFER")
        self.build_fixture()

    def build_fixture(self):
        dependencies = {name: "1.2.3" for name in self.driver.DEPENDENCIES}
        (self.repo / "package.json").write_text(json.dumps({"dependencies": dependencies}))
        (self.repo / "package-lock.json").write_text(json.dumps({"packages": {
            "node_modules/" + name: {"version": version} for name, version in dependencies.items()}}))
        (self.repo / ".nvmrc").write_text("24.22.1\n")
        packages = {}
        for name, version in dependencies.items():
            path = self.repo / "node_modules" / name / "package.json"
            path.parent.mkdir(parents=True, exist_ok=True)
            path.write_text(json.dumps({"version": version}))
            packages[name] = {"version": version, "packageJsonSha256": hashlib.sha256(path.read_bytes()).hexdigest()}
        self.build = {"version": 1, "profile": "inline-react-v1", "scope": "fixed-fixture-build-only",
                      "nativeTested": False, "generatedCodeEvaluatedOnHost": False, "nodeVersion": "v24.22.1",
                      "inputs": {key: hashlib.sha256((self.repo / path).read_bytes()).hexdigest() for key, path in (
                          ("sourceSha256", "scripts/native-inline-react-v1/document.mdx"),
                          ("compilerSha256", "scripts/native-inline-react-v1/compile.mjs"),
                          ("packageJsonSha256", "package.json"), ("packageLockSha256", "package-lock.json"))},
                      "dependencies": packages,
                      "artifacts": {part + suffix: (32 if suffix == "Bytes" else "a" * 64)
                                    for part in ("compiledMdx", "javascript", "html") for suffix in ("Bytes", "Sha256")},
                      "receipt": {"transport": "document-title", "maximumUtf8Bytes": 256, "maximumFieldCodeUnits": 16,
                                  "errorCodes": ["runtime-error", "unhandled-rejection", "react-error", "receipt-overflow"]}}
        self.binary = self.binary_for(self.build)
        (self.repo / self.driver.PAYLOAD["host"][0]).write_bytes(self.binary)

    def binary_for(self, build):
        raw = json.dumps(build).encode()
        return b"\x7fELFsynthetic" + self.driver.BUILD_PREFIX + struct.pack(">I", len(raw)) + raw + self.driver.BUILD_SUFFIX

    def test_snapshots_are_fixed_private_and_independent_of_later_source_mutation(self):
        with self.driver._prepare() as prepared:
            self.assertEqual(set(prepared.files), {"host", "session.py", "observer.py", "manifest.json"})
            self.assertFalse(str(prepared.directory).startswith(str(self.repo)))
            manifest = json.loads(prepared.files["manifest.json"])
            self.assertEqual(set(manifest["sources"]), set(self.driver.SOURCES))
            self.assertEqual(set(manifest["files"]), {"host", "session.py", "observer.py"})
            self.assertIs(manifest["native_app_tested"], False)
            for name, raw in prepared.files.items():
                self.assertNotIn(b"PRIVATE_CANARY", raw)
                self.assertEqual((prepared.directory / name).read_bytes(), raw)
                self.assertEqual((prepared.directory / name).stat().st_mode & 0o777, 0o400)
            (self.repo / self.driver.PAYLOAD["host"][0]).write_bytes(b"changed")
            self.assertEqual(prepared.files["host"], self.binary)
            with self.assertRaises(TypeError):
                prepared.files["host"] = b"mutable"
            directory = prepared.directory
        self.assertFalse(directory.exists())

    def test_symlink_fifo_empty_and_oversize_payload_refuse_before_any_child(self):
        path = self.repo / self.driver.PAYLOAD["observer.py"][0]
        for kind in ("symlink", "fifo", "empty", "oversize"):
            with self.subTest(kind=kind):
                path.unlink()
                if kind == "symlink":
                    path.symlink_to(self.secret)
                elif kind == "fifo":
                    os.mkfifo(path)
                else:
                    path.write_bytes(b"" if kind == "empty" else b"x" * (256 * 1024 + 1))
                with patch.object(self.driver.transport.subprocess, "Popen") as spawn:
                    with self.assertRaises(Exception):
                        with self.driver._prepare():
                            pass
                    spawn.assert_not_called()

    def test_public_cli_refuses_options_payloads_commands_and_noncanonical_roots(self):
        for args in ([], ["--run"], ["--run", "/tmp/fixed", "--command", "id"],
                     ["--payload", "/tmp/fixed"], ["--run", "/tmp/a/../fixed"]):
            with patch.object(self.driver.transport, "_smoke") as smoke, redirect_stdout(io.StringIO()) as output:
                self.assertEqual(self.driver.main(args), 2)
                smoke.assert_not_called()
                self.assertNotIn("PRIVATE", output.getvalue())

    def test_fixed_ssh_subsystem_retains_pinned_options_and_has_no_shell_or_forwarding(self):
        args = self.driver._sftp_argv("/tmp/fixed")
        self.assertEqual(args[-3:], ["-s", "fixture@127.0.0.1", "sftp"])
        for option in ("ForwardAgent=no", "StrictHostKeyChecking=yes", "IdentitiesOnly=yes",
                       "ControlMaster=no", "UserKnownHostsFile=/tmp/fixed/auth/known_hosts"):
            self.assertIn(option, args)
        self.assertNotIn("/usr/bin/python3", args)

    def test_receipt_validator_requires_every_case_witness_not_only_status(self):
        for case in ("stop", "expiry"):
            value = self.case(case)
            self.driver._case_receipt(json.dumps(value).encode(), case)
            for key in ("termination", "bridge"):
                broken = {**value, key: "not_run"}
                with self.assertRaises(Exception):
                    self.driver._case_receipt(json.dumps(broken).encode(), case)
            for extra in ({"PRIVATE_KEY": "PRIVATE_CANARY"}, {"native_app_tested": True}, {"version": True}):
                with self.assertRaises(Exception):
                    self.driver._case_receipt(json.dumps({**value, **extra}).encode(), case)

    def case(self, case):
        value = {"version": 1, "profile": "inline-react-v1", "scope": "fixed-native-diagnostic-only",
                 "native_app_tested": False, "case": case, "status": "passed", "phase": "complete", "reason": "none",
                 "bridge": "passed", "termination": "passed"}
        value.update({name: "passed" if case == "stop" else "not_run" for name in ("pointer", "keyboard", "host_input")})
        return value

    def test_sftp_packet_parser_refuses_oversize_wrong_ids_and_errors(self):
        for response in (struct.pack(">I", 65537),
                         self.packet(101, struct.pack(">II", 999, 0)),
                         self.packet(101, struct.pack(">II", 1, 4))):
            with self.subTest(response=response):
                wire = self.driver._Sftp.__new__(self.driver._Sftp)
                wire.identifier = 0
                wire._write = lambda _data: None
                data = io.BytesIO(response)
                wire._read = data.read
                with self.assertRaises(Exception):
                    wire.request(3, b"fixed", 101)

    def test_sftp_upload_uses_real_fragmented_pipes_exclusive_fixed_names_and_offsets(self):
        server = r'''
import os,struct,sys
def read(n):
 raw=bytearray()
 while len(raw)<n:
  chunk=os.read(0,n-len(raw))
  if not chunk: raise EOFError()
  raw.extend(chunk)
 return bytes(raw)
def packet():
 raw=read(struct.unpack('>I',read(4))[0]); return raw[0],raw[1:]
def emit(kind,raw):
 data=struct.pack('>I',len(raw)+1)+bytes([kind])+raw
 for byte in data: os.write(1,bytes([byte]))
kind,raw=packet(); assert kind==1 and raw==struct.pack('>I',3)
emit(2,struct.pack('>I',3))
kind,raw=packet(); identifier=raw[:4]; n=struct.unpack('>I',raw[4:8])[0]
assert kind==3 and raw[8:8+n]==b'/home/fixture/native-inline-react-v1/host'
assert struct.unpack('>III',raw[8+n:])==(42,4,0o600)
emit(102,identifier+struct.pack('>I',1)+b'h')
content=bytearray()
while True:
 kind,raw=packet(); identifier=raw[:4]; assert raw[4:9]==struct.pack('>I',1)+b'h'
 if kind==4:
  assert content==b'a'*70000; emit(101,identifier+struct.pack('>I',0)); break
 assert kind==6 and struct.unpack('>Q',raw[9:17])[0]==len(content)
 n=struct.unpack('>I',raw[17:21])[0]; assert n<=32768 and len(raw[21:])==n
 content.extend(raw[21:]); emit(101,identifier+struct.pack('>I',0))
'''
        process = subprocess.Popen([sys.executable, "-I", "-c", server], stdin=subprocess.PIPE,
                                   stdout=subprocess.PIPE, stderr=subprocess.DEVNULL)
        try:
            wire = self.driver._Sftp(process)
            wire.put("host", b"a" * 70000)
            process.stdin.close()
            self.assertEqual(process.wait(timeout=3), 0)
        finally:
            if process.poll() is None:
                process.kill()
                process.wait(timeout=3)
            process.stdout.close()
            if not process.stdin.closed:
                process.stdin.close()

    def test_collection_rejects_unknown_names_noncanonical_base64_and_oversize(self):
        good = {"version": 1, "files": {"session.json": base64.b64encode(b"{}").decode()}}
        self.assertEqual(self.driver._collection(json.dumps(good).encode()), {"session.json": b"{}"})
        for files in ({}, {"session.json": "{}"}, {"session.json": 1},
                      {"session.json": "eA==\n"}, {"session.json": "eA==", "auth": "eA=="},
                      {"session.json": base64.b64encode(b"x" * 16385).decode()}):
            with self.assertRaises(Exception):
                self.driver._collection(json.dumps({"version": 1, "files": files}).encode())
        self.assertNotIn("host.log", repr(dict(self.driver.EVIDENCE)))
        self.assertNotIn("auth", repr(dict(self.driver.EVIDENCE)))
        self.assertLess(len(self.driver.COLLECT), 4096)

    def execute_collector(self):
        # Execute exactly the collector in a disposable synthetic tree. UID
        # metadata is modeled for non-root portability; real nofollow IO remains.
        real_stat, real_fstat = os.stat, os.fstat
        def node(value):
            return SimpleNamespace(**{name: (1001 if name == "st_uid" else getattr(value, name))
                                      for name in dir(value) if name.startswith("st_")})
        fake = SimpleNamespace(**vars(os))
        fake.getuid = fake.geteuid = lambda: 1001
        fake.fstat = lambda fd: node(real_fstat(fd))
        fake.stat = lambda *args, **options: node(real_stat(*args, **options))
        original = builtins.__import__
        def imported(name, *args, **options):
            return fake if name == "os" else original(name, *args, **options)
        output = io.StringIO()
        code = self.driver.COLLECT.replace(self.driver.ROOT.encode(), str(self.repo).encode())
        with redirect_stdout(output):
            exec(code, {"__builtins__": {**vars(builtins), "__import__": imported}})
        return self.driver._collection(output.getvalue().encode())

    def test_collector_real_files_refuse_symlinks_fifo_hardlinks_and_oversize(self):
        run = self.repo / "run"
        run.mkdir(mode=0o700)
        target = run / "session.json"
        for kind in ("regular", "symlink", "fifo", "hardlink", "oversize"):
            if target.exists() or target.is_symlink():
                target.unlink()
            if kind == "symlink":
                target.symlink_to(self.secret)
            elif kind == "fifo":
                os.mkfifo(target, 0o600)
            elif kind == "hardlink":
                os.link(self.secret, target)
            else:
                target.write_bytes(b"{}" if kind == "regular" else b"x" * 16385)
                target.chmod(0o600)
            if kind == "regular":
                self.assertEqual(self.execute_collector(), {"session.json": b"{}"})
            else:
                with self.assertRaises(Exception):
                    self.execute_collector()

    def test_session_receipt_does_not_promote_failed_or_missing_cases(self):
        value = {"version": 1, "profile": "inline-react-v1", "scope": "fixed-native-diagnostic-only",
                 "native_app_tested": False, "status": "passed", "phase": "complete", "reason": "none",
                 "cases": {"stop": "passed", "expiry": "passed"}, "cleanup": "passed"}
        self.driver._session_receipt(json.dumps(value).encode())
        for change in ({"cleanup": "failed"}, {"cases": {"stop": "failed", "expiry": "passed"}},
                       {"cases": {"stop": "passed"}}, {"phase": "stop"}, {"reason": "internal_error"}):
            with self.assertRaises(Exception):
                self.driver._session_receipt(json.dumps({**value, **change}).encode())

    def test_embedded_build_frame_refuses_duplicates_malformed_stale_and_changed_packages(self):
        sources = {name: (self.repo / name).read_bytes() for name in self.driver.SOURCES}
        self.assertEqual(self.driver._build_evidence(self.binary, sources), self.build)
        for binary in (b"\x7fELF", self.binary * 2, self.binary[:-1],
                       b"\x7fELF" + self.driver.BUILD_PREFIX + struct.pack(">I", 16385) + self.driver.BUILD_SUFFIX,
                       self.binary_for({**self.build, "nativeTested": True}),
                       self.binary_for({**self.build, "nodeVersion": "v0.0.0"}),
                       self.binary_for({**self.build, "artifacts": {**self.build["artifacts"], "htmlBytes": True}})):
            with self.assertRaises(Exception):
                self.driver._build_evidence(binary, sources)
        with self.assertRaises(Exception):
            self.driver._build_evidence(self.binary, {**sources, "scripts/native-inline-react-v1/document.mdx": b"changed"})
        (self.repo / "node_modules/react/package.json").write_text('{"version":"9.9.9"}')
        with self.assertRaises(Exception):
            self.driver._build_evidence(self.binary, sources)

    def summary(self, passed=True):
        session = {"version": 1, "profile": "inline-react-v1", "scope": "fixed-native-diagnostic-only",
                   "native_app_tested": False, "status": "passed", "phase": "complete", "reason": "none",
                   "cases": {"stop": "passed", "expiry": "passed"}, "cleanup": "passed"}
        cases = {case: self.case(case) for case in ("stop", "expiry")}
        if not passed:
            session.update(status="failed", phase="stop", reason="observer_failed",
                           cases={"stop": "failed", "expiry": "not_run"})
            cases = {"stop": {**cases["stop"], "status": "failed", "phase": "keyboard",
                               "reason": "keyboard_not_acknowledged", "keyboard": "failed",
                               "termination": "not_run", "host_input": "not_run"}}
        return {"version": 1, "profile": "inline-react-v1", "scope": "fixed-native-diagnostic-only",
                "native_app_tested": False, "status": "passed" if passed else "failed",
                "guard_normal_exit": True, "session": session, "cases": cases,
                "PRIVATE_METADATA": "PRIVATE_CANARY"}

    def test_valid_failed_summary_emits_only_fixed_diagnosis_and_still_exits_two(self):
        with patch.object(self.driver.transport, "_smoke", return_value=self.summary(False)), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
        text = output.getvalue()
        self.assertEqual(text.count("::notice "), 3)
        self.assertIn("session_status=failed session_phase=stop session_reason=observer_failed cleanup=passed", text)
        self.assertIn("case=stop status=failed phase=keyboard reason=keyboard_not_acknowledged", text)
        self.assertIn("case=expiry status=not_run phase=not_run reason=not_run", text)
        self.assertIn("keyboard=failed", text)
        self.assertNotIn("PRIVATE", text)
        self.assertTrue(text.endswith("NATIVE_INLINE_REACT_FIXTURE_REFUSED\n"))

    def test_malformed_summary_or_transport_failure_never_emits_partial_notices(self):
        forged = self.summary(False)
        forged["cases"]["stop"]["reason"] = "PRIVATE_CANARY%0A::error::injected"
        for result in (None, {}, forged, {**self.summary(), "guard_normal_exit": False},
                       {**self.summary(), "status": "failed"}):
            with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
            self.assertEqual(output.getvalue(), "NATIVE_INLINE_REACT_FIXTURE_REFUSED\n")
        with patch.object(self.driver.transport, "_smoke", side_effect=RuntimeError("PRIVATE_CANARY")), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
        self.assertEqual(output.getvalue(), "NATIVE_INLINE_REACT_FIXTURE_REFUSED\n")

    def test_valid_success_summary_emits_fixed_notices_and_exits_zero(self):
        with patch.object(self.driver.transport, "_smoke", return_value=self.summary()), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 0)
        self.assertEqual(output.getvalue().count("::notice "), 3)
        self.assertNotIn("PRIVATE", output.getvalue())
        self.assertTrue(output.getvalue().endswith("NATIVE_INLINE_REACT_FIXTURE_PASSED\n"))

    def test_desktop_substage_reasons_are_fixed_and_cannot_inject_notices(self):
        for reason in ("xauth_deadline", "display_readiness_deadline", "xvfb_exited"):
            result = self.summary(False)
            result["session"].update(phase="desktop", reason=reason,
                                     cases={"stop": "not_run", "expiry": "not_run"})
            result["cases"] = {}
            with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
            self.assertIn("session_phase=desktop session_reason=" + reason + " cleanup=passed", output.getvalue())
            for rejected in (reason + "_unknown", reason + "%0A::error::PRIVATE_CANARY", 1):
                result["session"]["reason"] = rejected
                with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
                    self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
                self.assertEqual(output.getvalue(), "NATIVE_INLINE_REACT_FIXTURE_REFUSED\n")

    def diagnostics(self):
        return {case: {"original_reason": "observer_failed" if case == "stop" else "not_run",
                       "host_exit": {"state": "exited", "code": 1} if case == "stop" else {"state": "not_started", "code": None},
                       "observer_exit": {"state": "exited", "code": 2} if case == "stop" else {"state": "not_started", "code": None},
                       "host_stage": "start_failed" if case == "stop" else "not_run",
                       "start_failure": "network_not_isolated" if case == "stop" else "not_run"}
                for case in ("stop", "expiry")}

    def test_case_diagnostics_emit_only_bounded_enums_and_original_failed_result_remains_failed(self):
        result = self.summary(False)
        result["session"]["diagnostics"] = self.diagnostics()
        with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
        text = output.getvalue()
        self.assertEqual(text.count("::notice "), 5)
        self.assertIn("diagnostic_original_reason=observer_failed host_state=exited host_code=1", text)
        self.assertIn("observer_state=exited observer_code=2 host_stage=start_failed start_failure=network_not_isolated", text)
        self.assertNotIn("PRIVATE", text)

    def test_malformed_optional_diagnostics_omit_without_changing_core_result(self):
        import copy
        malformed = [None, {}, {**self.diagnostics(), "PRIVATE_CANARY": "PRIVATE_CANARY"}]
        for field, value in (("original_reason", "PRIVATE_CANARY%0A::error::injected"),
                             ("host_stage", "PRIVATE_CANARY"), ("start_failure", []),
                             ("host_exit", {"state": "running", "code": 0}),
                             ("host_exit", {"state": "exited", "code": True}),
                             ("host_exit", {"state": "exited", "code": -65}),
                             ("observer_exit", {"state": "exited", "code": 256}),
                             ("observer_exit", {"state": "exited", "code": None})):
            diagnostic = copy.deepcopy(self.diagnostics())
            diagnostic["stop"][field] = value
            malformed.append(diagnostic)
        for diagnostic in malformed:
            result = self.summary(False)
            result["session"]["diagnostics"] = diagnostic
            parsed = self.driver._session_receipt(json.dumps(result["session"]).encode())
            self.assertEqual(parsed["status"], "failed")
            self.assertNotIn("diagnostics", parsed)
            notices = self.driver._summary_notices(result)
            self.assertEqual(len(notices), 3)
            self.assertNotIn("PRIVATE", " ".join(notices))

    def test_observer_exception_diagnostic_is_bound_to_frozen_source_and_failed_phase(self):
        source = b"def own():\n    raise RuntimeError()\n"
        path = self.repo / self.driver.PAYLOAD["observer.py"][0]
        path.write_bytes(source)
        event = {"event": "observer_exception", "elapsed": 1.25, "phase": "keyboard",
                 "error_type": "RuntimeError", "errno": None,
                 "frames": [{"function": "own", "line": 2}]}
        case = self.summary(False)["cases"]["stop"]
        details = self.driver._observer_exceptions(
            {"stop-events.jsonl": (json.dumps(event) + "\n").encode()}, {"stop": case}, source)
        self.assertEqual(details, {"stop": {name: event[name] for name in ("phase", "error_type", "errno", "frames")}})
        result = self.summary(False)
        result.update(observer_exceptions=details,
                      payload={"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}})
        text = " ".join(self.driver._summary_notices(result))
        self.assertIn("observer_exception_phase=keyboard error_type=RuntimeError errno=none frames=own:2", text)
        self.assertNotIn("PRIVATE", text)
        path.write_bytes(b"def changed():\n    pass\n")
        self.assertNotIn("observer_exception_phase=", " ".join(self.driver._summary_notices(result)))

    def test_invalid_observer_exception_omits_diagnostic_not_original_failure(self):
        source = b"def own():\n    raise RuntimeError()\n"
        (self.repo / self.driver.PAYLOAD["observer.py"][0]).write_bytes(source)
        result = self.summary(False)
        result["payload"] = {"files": {"observer.py": {"sha256": hashlib.sha256(source).hexdigest()}}}
        for invalid in (None, [], {"stop": {"phase": "keyboard", "error_type": "PRIVATE_CANARY%0A::error",
                                           "errno": None, "frames": []}},
                        {"stop": {"phase": "keyboard", "error_type": "RuntimeError", "errno": True,
                                  "frames": [{"function": "own", "line": 2}]}},
                        {"stop": {"phase": "keyboard", "error_type": "RuntimeError", "errno": None,
                                  "frames": [{"function": "PRIVATE_CANARY", "line": 2}]}}):
            result["observer_exceptions"] = invalid
            with patch.object(self.driver.transport, "_smoke", return_value=result), redirect_stdout(io.StringIO()) as output:
                self.assertEqual(self.driver.main(["--run", "/tmp/fixed"]), 2)
            self.assertNotIn("observer_exception_phase=", output.getvalue())
            self.assertNotIn("PRIVATE", output.getvalue())
            self.assertEqual(output.getvalue().count("::notice "), 3)

    @staticmethod
    def packet(kind, data):
        return struct.pack(">I", 1 + len(data)) + bytes([kind]) + data


if __name__ == "__main__":
    unittest.main()
