"""No GTK/X11/native/VM execution: real fixture files/pipes, simulated kernel/UI."""
import errno
import ctypes
import importlib.util
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import unittest
from unittest.mock import patch

SOURCE = Path(__file__).resolve().parents[2] / "scripts/native-inline-react-v1/observer.py"
SPEC = importlib.util.spec_from_file_location("inline_observer", SOURCE)
observer = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(observer)
UNIT = "programmable-notes-preview-42-123456.service"
GROUP = observer.GROUP_PREFIX + "app.slice/" + UNIT


def title(**changes):
    return json.dumps({"fixture": "inline-react-v1", "ready": True, "count": 0, "field": "", "focus": "", "error": "", **changes}).encode()


def journal():
    base = {"_EXE": "/usr/lib/systemd/systemd", "_COMM": "systemd", "_UID": "1001", "_TRANSPORT": "journal", "USER_UNIT": UNIT}
    return [{**base, "MESSAGE_ID": "d9b373ed55a64feb8242e02dbe79a49c", "UNIT_RESULT": "timeout"},
            {**base, "MESSAGE": UNIT + ": Service reached runtime time limit. Stopping."}]


class Clock:
    now = 100.0
    def monotonic(self):
        return self.now
    def sleep(self, seconds):
        self.now += seconds


class Titles(unittest.TestCase):
    def test_native_snapshot_decoder_accepts_only_exact_quoted_xprop_fixed_schema(self):
        snapshot = {"version": 1, "built": True, "committed": False, "finished": False,
                    "navigation_denied": False, "load_failed": False, "termination": "none"}
        def output(value):
            return ("_PN_FIXTURE_NATIVE = " + json.dumps(json.dumps(value, separators=(",", ":"))) + "\n").encode()
        self.assertEqual(observer.decode_native_snapshot(output(snapshot)), snapshot)
        self.assertEqual(observer.decode_native_snapshot(output(snapshot)[:-1]), snapshot)
        for extra in (b" ", b"\t", b"\r", b"\n", b"\n\n"):
            self.assertIsNone(observer.decode_native_snapshot(output(snapshot) + extra))
            self.assertIsNone(observer.decode_native_snapshot(output(snapshot).replace(b" = ", b" = " + extra)))

        for changes in ({"version": True}, {"built": 1}, {"termination": "PRIVATE"}, {"uri": "PRIVATE"}):
            self.assertIsNone(observer.decode_native_snapshot(output({**snapshot, **changes})))
        for raw in (b"", b"x" * 1025, output(snapshot).replace(b"_PN_FIXTURE_NATIVE", b"OTHER"),
                    output(snapshot) + b"PRIVATE\n", b'_PN_FIXTURE_NATIVE = "PRIVATE"\n'):
            self.assertIsNone(observer.decode_native_snapshot(raw))
    def test_last_state_has_only_fixed_categories_and_known_errors_still_refuse(self):
        cases = [(None, "missing"), (b"", "empty"), (b'{"bridge":"native-before-webkit"}', "native_only"),
                 (title(ready=False), "bootstrap_pending"), (title(), "react_ready"),
                 (title(count=2), "react_noninitial"), (b"PRIVATE_INVALID_TITLE", "invalid"),
                 (b"x" * 257, "invalid"), (title(field="x" * 17), "invalid")]
        for raw, expected in cases:
            self.assertEqual(observer.title_state(raw), expected)
        for error in observer.ERRORS - {""}:
            self.assertEqual(observer.title_state(title(error=error)), error.replace("-", "_"))
            with self.assertRaises(observer.Refused) as failure: observer.decode_title(title(error=error))
            self.assertEqual(failure.exception.reason, "fixture_error")
        overflow = b'{"fixture":"inline-react-v1","ready":false,"error":"receipt-overflow"}'
        self.assertEqual(observer.title_state(overflow), "receipt_overflow")
        with self.assertRaises(observer.Refused) as failure: observer.decode_title(overflow)
        self.assertEqual(failure.exception.reason, "fixture_error")
        self.assertEqual(observer.title_state(overflow.replace(b"false", b"0")), "invalid")
    def test_exact_bridge_and_initial_or_ready_receipt(self):
        self.assertEqual(observer.decode_title(b'{"bridge":"native-before-webkit"}'), "bridge")
        self.assertEqual(observer.decode_title(title())["count"], 0)
        self.assertFalse(observer.decode_title(title(ready=False))["ready"])
        self.assertEqual(observer.decode_title(title(field="x" * 16, count=999, focus="field"))["field"], "x" * 16)
        self.assertEqual(observer.decode_title(title(field="😀" * 8))["field"], "😀" * 8)

    def test_malformed_foreign_duplicate_and_unbounded_receipts_refused(self):
        invalid = [b"x" * 257, b"\xff", b"{}", b"[]", b'{"bridge":"native-before-webkit","extra":1}',
                   b'{"fixture":"inline-react-v1","fixture":"inline-react-v1"}', title(fixture="other"), title(count=True),
                   title(count=-1), title(count=1000), title(ready=1), title(field="x" * 17), title(field="😀" * 9),
                   title(focus="forced"), title(error="arbitrary private error"), title(unit=UNIT)]
        for raw in invalid:
            with self.subTest(size=len(raw)), self.assertRaises(observer.Refused):
                observer.decode_title(raw)

    def test_sticky_error_codes_never_become_ready_acknowledgements(self):
        for code in observer.ERRORS - {""}:
            with self.assertRaises(observer.Refused):
                observer.decode_title(title(error=code))

    def test_root_group_and_wrong_user_manager_are_refused(self):
        self.assertEqual(observer.group_path(GROUP, UNIT), Path("/sys/fs/cgroup") / GROUP[1:])
        for group in ("", "/", "/user.slice", GROUP.replace("1001", "1000"), GROUP + "/child", GROUP.replace("app.slice", "..")):
            with self.assertRaises(observer.Refused):
                observer.group_path(group, UNIT)

    def test_persistent_native_bridge_is_independent_when_react_state_already_arrived(self):
        class Library:
            def __init__(self): self.buffer = None
            def XGetWindowProperty(self, display, window, atom, offset, length, delete, expected, actual, fmt, count, remaining, value):
                self.raw = title() if atom == 3 else b'{"bridge":"native-before-webkit"}'
                self.buffer = ctypes.create_string_buffer(self.raw)
                ctypes.cast(actual, ctypes.POINTER(ctypes.c_ulong)).contents.value = 2
                ctypes.cast(fmt, ctypes.POINTER(ctypes.c_int)).contents.value = 8
                ctypes.cast(count, ctypes.POINTER(ctypes.c_ulong)).contents.value = len(self.raw)
                ctypes.cast(remaining, ctypes.POINTER(ctypes.c_ulong)).contents.value = 0
                ctypes.cast(value, ctypes.POINTER(ctypes.c_void_p)).contents.value = ctypes.addressof(self.buffer)
                return 0
            def XFree(self, value): pass
        x = object.__new__(observer.X11)
        x.x, x.display, x.atom, x.bridge_atom, x.utf8, x.unexpected = Library(), 1, 3, 4, 2, False
        self.assertTrue(x.state(20)["ready"])
        self.assertEqual(x.last_state, "react_ready")
        self.assertTrue(x.bridge(20))
        self.assertTrue(x.state(20)["ready"])


class Files(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-observer-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for path in (self.root / "run", self.root / "run/evidence", self.root / "run/evidence/stop"):
            path.mkdir(mode=0o700)
        self.case = self.root / "run/evidence/stop"
        self.log = self.case / "host.log"
        self.log.write_text("PRIVATE_HOST_LOG_DO_NOT_PUBLISH\n")
        self.log.chmod(0o600)
        self.addCleanup(patch.stopall)
        patch.object(observer, "ROOT", self.root).start()
        # Ownership-only fixture adaptation; all real file flags/modes/links remain checked.
        patch.object(observer, "UID", os.getuid()).start()

    def test_fixed_owned_files_are_new_private_bounded_and_host_text_not_copied(self):
        evidence = observer.Evidence("stop")
        try:
            self.assertIn("PRIVATE", evidence.host_log())
            evidence.event("pointer_ack", count=2)
            result = {"version": 1, "profile": "inline-react-v1", "case": "stop", "scope": "fixed-native-diagnostic-only",
                      "native_app_tested": False, "status": "failed", "phase": "host", "reason": "host_not_ready",
                      **{key: "not_run" for key in observer.OBSERVATIONS}}
            evidence.finish(result)
        finally:
            evidence.close()
        for name in ("events.jsonl", "result.json"):
            path = self.case / name
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)
            self.assertNotIn("PRIVATE", path.read_text())
        with self.assertRaises(FileExistsError):
            observer.Evidence("stop")

    def test_symlink_hardlink_and_wrong_log_mode_refused_before_read(self):
        for kind in ("symlink", "hardlink", "mode"):
            self.log.unlink()
            target = self.root / "keep"
            target.write_bytes(b"PRIVATE")
            target.chmod(0o600)
            if kind == "symlink":
                self.log.symlink_to(target)
            elif kind == "hardlink":
                os.link(target, self.log)
            else:
                self.log.write_bytes(b"PRIVATE")
                self.log.chmod(0o644)
            with self.assertRaises(Exception):
                observer.Evidence("stop")
            self.assertFalse((self.case / "result.json").exists())

    def test_log_replacement_growth_and_events_overflow_refused(self):
        evidence = observer.Evidence("stop")
        self.addCleanup(evidence.close)
        self.log.rename(self.case / "old.log")
        self.log.write_text("replacement")
        self.log.chmod(0o600)
        with self.assertRaises(observer.Refused):
            evidence.host_log()
        with self.assertRaises(observer.Refused):
            evidence.event("too_large", data="x" * 8192)
        evidence.events_bytes = observer.EVENT_LIMIT
        with self.assertRaises(observer.Refused):
            evidence.event("pointer_ack", count=2)

    def test_symlink_ancestor_refused_without_escape(self):
        alias = self.root / "alias"
        alias.symlink_to(self.root / "run", target_is_directory=True)
        with self.assertRaises(OSError):
            observer._open_directory(alias / "evidence")


class Kernel(unittest.TestCase):
    def test_proc_enoent_esrch_are_races_not_blanket_permission_normalization(self):
        for code in (errno.ENOENT, errno.ESRCH):
            with patch.object(observer, "_read", side_effect=OSError(code, "PRIVATE")):
                self.assertIsNone(observer.identity(42))
                self.assertIsNone(observer._membership(42))
        with patch.object(observer, "_read", side_effect=PermissionError(errno.EACCES, "PRIVATE")):
            with self.assertRaises(PermissionError):
                observer.identity(42)

    def test_stat_uses_last_parenthesis_and_start_identity(self):
        raw = b"42 (name with ) parentheses) S " + b"0 " * 18 + b"777 0\n"
        with patch.object(observer, "_read", return_value=raw):
            self.assertEqual(observer.identity(42), {"state": "S", "start": "777"})

    def test_live_check_allows_scheduler_state_change_but_rejects_policy_or_identity_changes(self):
        properties = f"MainPID=42\nControlGroup={GROUP}\nActiveEnterTimestampMonotonic=1000000\nRuntimeMaxUSec=1min\n".encode()
        files = {"status": b"Uid:\t1001\t1001\t1001\t1001\nNoNewPrivs:\t1\n", "cpu.max": b"25000 100000", "memory.max": b"536870912", "memory.swap.max": b"0", "pids.max": b"128"}
        def read(path, _limit):
            return files[Path(path).name]
        with patch.object(observer, "_command", return_value=properties), patch.object(observer, "_read", side_effect=read), \
                patch.object(observer, "_membership", return_value="0::" + GROUP), \
                patch.object(observer.os, "readlink", side_effect=lambda p: "net:[1]" if p == "/proc/self/ns/net" else "net:[2]"):
            with patch.object(observer, "identity", side_effect=[{"start": "7", "state": "R"}, {"start": "7", "state": "S"}]):
                self.assertEqual(observer.live(UNIT, 10**20)["start_identity"], "7")
            for variant in ("uid", "nnp", "cpu", "zombie", "reused", "same_net"):
                original = dict(files)
                if variant == "uid": files["status"] = files["status"].replace(b"1001", b"1000")
                if variant == "nnp": files["status"] = files["status"].replace(b"1\n", b"0\n")
                if variant == "cpu": files["cpu.max"] = b"max 100000"
                second = {"start": "8" if variant == "reused" else "7", "state": "Z" if variant == "zombie" else "S"}
                with patch.object(observer, "identity", side_effect=[{"start": "7", "state": "S"}, second]):
                    if variant == "same_net":
                        with patch.object(observer.os, "readlink", return_value="net:[1]"), self.assertRaises(observer.Refused):
                            observer.live(UNIT, 10**20)
                    else:
                        with self.assertRaises(observer.Refused): observer.live(UNIT, 10**20)
                files.clear(); files.update(original)

    def fixture(self):
        temp = tempfile.TemporaryDirectory(prefix="pn-cgroup-sample-")
        self.addCleanup(temp.cleanup)
        root = Path(temp.name)
        (root / "cgroup.procs").write_text("42\n")
        (root / "cgroup.events").write_text("populated 1\n")
        child = root / "child"
        child.mkdir()
        (child / "cgroup.procs").write_text("43\n")
        return {"root": root, "group": GROUP}

    def test_recursive_membership_tracks_starts_and_never_treats_esrch_as_empty(self):
        target = self.fixture()
        known, unresolved = {}, set()
        with patch.object(observer, "identity", side_effect=lambda pid: None if pid == 43 else {"start": "7", "state": "S"}), \
                patch.object(observer, "_membership", return_value="0::" + GROUP):
            self.assertFalse(observer.sample(target, known, unresolved))
        self.assertEqual(set(known), {(42, "7")})
        self.assertEqual(unresolved, {43})

    def test_indeterminate_or_missing_controller_is_not_empty_while_root_exists(self):
        target = self.fixture()
        original = observer._read
        def fail(path, limit):
            if Path(path).name == "cgroup.events": raise OSError(errno.ENODEV, "PRIVATE")
            return original(path, limit)
        with patch.object(observer, "_read", side_effect=fail):
            self.assertIsNone(observer.sample(target, {}, set()))
        (target["root"] / "cgroup.procs").unlink()
        self.assertIsNone(observer.sample(target, {}, set()))

    def test_matching_survivor_or_migration_prevents_cleanup_even_if_group_empty(self):
        clock = Clock()
        target = {"group": GROUP}
        for membership in ("0::" + GROUP, "0::/escaped"):
            with patch.object(observer, "sample", return_value=True), patch.object(observer, "identity", return_value={"start": "7", "state": "R"}), \
                    patch.object(observer, "_membership", return_value=membership), patch.object(observer.time, "monotonic", clock.monotonic), patch.object(observer.time, "sleep", clock.sleep):
                with self.assertRaises(observer.Refused):
                    observer.cleanup(target, {(42, "7"): "R"}, set(), clock.now + .2)

    def test_cleanup_requires_confirmed_valid_samples_and_original_deadline(self):
        clock = Clock()
        with patch.object(observer, "sample", side_effect=[None, True, True]), patch.object(observer, "identity", return_value=None), \
                patch.object(observer.time, "monotonic", clock.monotonic), patch.object(observer.time, "sleep", clock.sleep):
            observer.cleanup({"group": GROUP}, {(42, "7"): "S"}, set(), clock.now + 1)
        with patch.object(observer, "sample", return_value=True), patch.object(observer, "identity", return_value=None), \
                patch.object(observer.time, "monotonic", side_effect=[100, 100.2, 100.2, 100.2]), self.assertRaises(observer.Refused):
            observer.cleanup({"group": GROUP}, {}, set(), 100.1)

    def test_pid_reuse_and_zombie_are_not_matching_live_descendants(self):
        for identity in ({"start": "8", "state": "R"}, {"start": "7", "state": "Z"}, None):
            with patch.object(observer, "identity", return_value=identity):
                self.assertFalse(observer.historical_alive({"group": GROUP}, {(42, "7"): "S"}, set()))

    def test_expiry_requires_both_authenticated_manager_records_not_author_message(self):
        records = journal()
        self.assertTrue(observer.expiry_cause(records, UNIT))
        for key, value in (("_EXE", "/bin/author"), ("_COMM", "author"), ("_UID", "1000"), ("_TRANSPORT", "stdout"), ("USER_UNIT", "other.service")):
            self.assertFalse(observer.expiry_cause([{**row, key: value} for row in records], UNIT))
        self.assertFalse(observer.expiry_cause(records[:1], UNIT))
        self.assertFalse(observer.expiry_cause(records[1:], UNIT))
        self.assertFalse(observer.expiry_cause([{**records[0], "UNIT_RESULT": "signal"}, records[1]], UNIT))

    def test_actual_renderer_snapshot_is_independent_of_title_and_requires_effective_policy(self):
        evidence = FakeEvidence()
        target = {"host_net": "net:[1]", "group": GROUP}
        status = b"Uid: 1001 1001 1001 1001\nNoNewPrivs: 1\nSeccomp: 2\n"
        def read(path, _limit):
            return b"WebKitWebProces\n" if Path(path).name == "comm" else status
        with patch.object(observer, "_read", side_effect=read), patch.object(observer.os, "readlink", return_value="net:[2]"), \
                patch.object(observer, "identity", return_value={"start": "7", "state": "S"}), patch.object(observer, "_membership", return_value="0::" + GROUP):
            policy = observer.RendererPolicy(target, {(42, "7"): "S"}, evidence)
            policy.tick(10**20)
            policy.require()
            self.assertEqual(policy.seen, {(42, "7")})
            self.assertEqual(evidence.events[-1][0], "renderer_policy")
            status = status.replace(b"Seccomp: 2", b"Seccomp: 0")
            policy = observer.RendererPolicy(target, {(42, "7"): "S"}, evidence)
            with self.assertRaises(observer.Refused): policy.tick(10**20)
            self.assertEqual(policy.seen, set())
        with patch.object(observer, "_read", side_effect=OSError(errno.ESRCH, "PRIVATE")):
            policy = observer.RendererPolicy(target, {(42, "7"): "S"}, evidence)
            policy.tick(10**20)
            with self.assertRaises(observer.Refused): policy.require()

    def test_exception_receipt_keeps_phase_errno_frames_without_private_message_or_path(self):
        evidence = FakeEvidence()
        try:
            observer._read("/PRIVATE_LOCATION_NOT_PUBLISHED", 8)
        except Exception as error:
            observer.exception_event(evidence, "cleanup", error)
        kind, value = evidence.events[-1]
        self.assertEqual(kind, "observer_exception")
        self.assertEqual(value["phase"], "cleanup")
        self.assertEqual(value["errno"], errno.ENOENT)
        self.assertTrue(value["frames"])
        self.assertNotIn("PRIVATE", json.dumps(value))


class FakeEvidence:
    log = ""
    def __init__(self): self.events = []
    def event(self, kind, **values): self.events.append((kind, values))
    def host_log(self): return self.log


class FakeBackend:
    def __init__(self, clock, evidence, case):
        self.clock, self.evidence, self.case = clock, evidence, case
        self.stopped, self.calls, self.target_calls = False, [], 0
        self.focus_ok, self.ready, self.bridge_ok, self.cause_ok = True, True, True, True
        self.state_value = json.loads(title())
        self.reads = []
        self.last_readiness = "not_observed"
        self.snapshot_calls = []
    def host(self): return {"unit": UNIT, "host_pid": 42, "host_xid": 100, "socket": 200}
    def target(self, unit):
        self.target_calls += 1
        return {"unit": unit, "pid": 43, "start_identity": "7", "group": GROUP, "root": Path("/synthetic-group"), "start": 100., "policy": {}, "host_net": "net:[1]", "child_net": "net:[2]"}
    def host_live(self, host): pass
    def bridge(self, host): return 300 if self.bridge_ok else None
    def state(self, child):
        self.reads.append(self.clock.now)
        self.last_readiness = "bootstrap_pending" if not self.ready else "react_ready"
        return {**self.state_value, "ready": self.ready}
    def readiness_state(self): return self.last_readiness
    def native_snapshot(self, child, start):
        self.snapshot_calls.append((child, start))
        return None
    def gui(self, *args, deadline):
        self.calls.append(args)
        self.clock.now += .01
        if args[:4] == ("mousemove", "--window", 300, 30): self.state_value["count"] = 2
        elif args[:4] == ("mousemove", "--window", 300, 170): self.state_value["focus"] = "field" if self.focus_ok else "counter"
        elif args[0] == "type": self.state_value["field"] = "hello"
        elif args[:4] == ("mousemove", "--window", 100, 50): self.stopped = True; self.evidence.log += "HOST_BUTTON_STOP Ok(())\n"
        elif args[:4] == ("mousemove", "--window", 100, 60): self.evidence.log += "HOST_ENTRY hostok\n"
    def journal(self, target, deadline): return journal() if self.cause_ok else []
    def dead(self): return self.stopped or self.case == "expiry" and self.clock.now >= 160


class Flow(unittest.TestCase):
    def test_native_probe_records_once_only_for_cached_missing_or_native_only(self):
        snapshot = {"version": 1, **{key: False for key in observer.NATIVE_FLAGS}, "termination": "none"}
        for state in ("native_only", "missing", "bootstrap_pending", "react_ready"):
            def adjust(backend):
                backend.ready = False
                backend.readiness_state = lambda: state
                def probe(child, start):
                    backend.snapshot_calls.append((child, start))
                    return snapshot
                backend.native_snapshot = probe
            result, backend, evidence, _ = self.run_case("stop", adjust)
            expected = state in ("native_only", "missing")
            self.assertEqual(len(backend.snapshot_calls), int(expected))
            self.assertEqual(sum(kind == "native_snapshot" for kind, _ in evidence.events), int(expected))
            self.assertEqual(result["reason"], "readiness_deadline")
            self.assertEqual(result["termination"], "passed")

    def test_native_probe_is_optional_and_cannot_waive_original_stop_50_gate(self):
        def adjust(backend):
            backend.ready = False
            backend.readiness_state = lambda: "native_only"
            def late(child, start):
                backend.clock.now = 150
                return None
            backend.native_snapshot = late
        result, backend, _, _ = self.run_case("stop", adjust)
        self.assertEqual(result["phase"], "ready")
        self.assertEqual(result["reason"], "readiness_deadline")
        self.assertEqual(result["termination"], "failed")
        self.assertFalse(any(call[:4] == ("mousemove", "--window", 100, 50) for call in backend.calls))
    def test_readiness_diagnostic_is_one_cached_enum_without_new_read_or_deadline_change(self):
        result, backend, evidence, clock = self.run_case("stop", lambda backend: setattr(backend, "ready", False))
        self.assertEqual(result["phase"], "ready")
        self.assertEqual(result["reason"], "readiness_deadline")
        self.assertEqual(result["termination"], "passed")
        self.assertEqual(result["host_input"], "passed")
        values = [value for kind, value in evidence.events if kind == "readiness_state"]
        self.assertEqual(values, [{"phase": "ready", "state": "bootstrap_pending"}])
        self.assertTrue(backend.reads)
        self.assertLess(max(backend.reads), 144)
        self.assertLess(clock.now, 155)

    def test_optional_diagnostic_failure_cannot_mask_original_failure(self):
        def adjust(backend):
            backend.ready = False
            backend.readiness_state = lambda: (_ for _ in ()).throw(ValueError("PRIVATE"))
        result, _, evidence, _ = self.run_case("stop", adjust)
        self.assertEqual(result["reason"], "readiness_deadline")
        self.assertFalse(any(kind == "readiness_state" for kind, _ in evidence.events))
    def run_case(self, case, adjust=lambda _backend: None, zombie=False):
        clock, evidence = Clock(), FakeEvidence()
        backend = FakeBackend(clock, evidence, case)
        adjust(backend)
        def identity(pid):
            if backend.dead(): return None
            return {"start": "7", "state": "Z" if zombie and backend.target_calls > 1 else "S"}
        with patch.object(observer, "RendererPolicy") as renderer, patch.object(observer.time, "monotonic", clock.monotonic), patch.object(observer.time, "sleep", clock.sleep), \
                patch.object(observer, "sample", side_effect=lambda *_: backend.dead()), patch.object(observer, "identity", side_effect=identity), \
                patch.object(observer, "_membership", return_value="0::" + GROUP):
            result = observer.run(case, evidence, backend, 185.)
        self.assertEqual(set(result), observer.RESULT_FIELDS)
        self.assertIn(result["phase"], observer.PHASES)
        self.assertIn(result["reason"], observer.REASONS)
        self.assertFalse(result["native_app_tested"])
        return result, backend, evidence, clock

    def test_stop_real_action_order_simulation_and_all_required_receipts(self):
        result, backend, _, _ = self.run_case("stop")
        self.assertEqual(result["status"], "passed")
        self.assertTrue(all(result[key] == "passed" for key in observer.OBSERVATIONS))
        self.assertEqual(backend.calls[2], ("type", "--clearmodifiers", "--delay", 1, "hello"))
        self.assertEqual(len([call for call in backend.calls if call[0] == "type"]), 1)
        self.assertFalse(any("windowfocus" in call or "windowactivate" in call for call in backend.calls))

    def test_delayed_session_stdout_flush_shares_original_five_second_cleanup_bound(self):
        def adjust(backend):
            original = backend.evidence.host_log
            def delayed():
                text = original()
                return text.replace("HOST_BUTTON_STOP Ok(())\n", "") if backend.clock.now < 100.25 else text
            backend.evidence.host_log = delayed
        result, _, evidence, clock = self.run_case("stop", adjust)
        self.assertEqual(result["status"], "passed")
        elapsed = next(value["elapsed"] for kind, value in evidence.events if kind == "bounded_stop")
        self.assertGreaterEqual(elapsed, .2)
        self.assertLess(elapsed, 5)
        self.assertLess(clock.now, 105)

    def test_no_typing_before_explicit_focus_and_no_deadline_extension(self):
        result, backend, _, clock = self.run_case("stop", lambda backend: setattr(backend, "focus_ok", False))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "focus_not_acknowledged")
        self.assertEqual(result["termination"], "passed")
        self.assertFalse(any(call[0] == "type" for call in backend.calls))
        self.assertLess(clock.now, 155)

    def test_startup_timeout_retains_valid_stop_but_never_reports_input_pass(self):
        result, backend, _, _ = self.run_case("stop", lambda backend: setattr(backend, "ready", False))
        self.assertEqual(result["reason"], "readiness_deadline")
        self.assertEqual(result["pointer"], "not_run")
        self.assertEqual(result["keyboard"], "not_run")
        self.assertEqual(result["termination"], "passed")
        self.assertFalse(any(call[0] == "type" for call in backend.calls))

    def test_already_zombie_before_stop_never_receives_stop_attribution(self):
        result, backend, _, _ = self.run_case("stop", zombie=True)
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["termination"], "failed")
        self.assertFalse(any(call[:4] == ("mousemove", "--window", 100, 50) for call in backend.calls))

    def test_expiry_has_no_input_or_stop_and_requires_trusted_cause_by_75(self):
        result, backend, evidence, clock = self.run_case("expiry")
        self.assertEqual(result["status"], "passed")
        self.assertEqual(result["bridge"], "passed")
        self.assertEqual(result["termination"], "passed")
        self.assertTrue(all(result[key] == "not_run" for key in ("pointer", "keyboard", "host_input")))
        self.assertEqual(backend.calls, [])
        self.assertTrue(any(kind == "expiry_cause" for kind, _ in evidence.events))
        self.assertLess(clock.now, 175)

    def test_disappearance_without_expiry_cause_is_failed_not_pass(self):
        result, backend, _, clock = self.run_case("expiry", lambda backend: setattr(backend, "cause_ok", False))
        self.assertEqual(result["status"], "failed")
        self.assertEqual(result["reason"], "expiry_cause_missing")
        self.assertEqual(backend.calls, [])
        self.assertLessEqual(clock.now, 175)


class Commands(unittest.TestCase):
    def test_native_probe_start_cutoff_normal_deadline_and_late_omission(self):
        backend = object.__new__(observer.Backend)
        backend.absolute = 185
        clock = Clock(); clock.now = 144
        raw = b'_PN_FIXTURE_NATIVE = "{\\"version\\":1,\\"built\\":true,\\"committed\\":false,\\"finished\\":false,\\"navigation_denied\\":false,\\"load_failed\\":false,\\"termination\\":\\"none\\"}"\n'
        calls = []
        def command(args, deadline, limit):
            calls.append((args, deadline, limit))
            return raw
        with patch.object(observer.time, "monotonic", clock.monotonic), patch.object(observer, "_command", side_effect=command):
            self.assertTrue(backend.native_snapshot(123, 100)["built"])
            self.assertEqual(calls[0], (["/usr/bin/xprop", "-id", "123", "-notype", "-f", "_PN_FIXTURE_NATIVE", "8s", "_PN_FIXTURE_NATIVE"], 144.5, 1024))
            clock.now = 144.5
            self.assertIsNone(backend.native_snapshot(123, 100))
            self.assertEqual(len(calls), 1)
        def late(*_args):
            clock.now = 146
            return raw
        clock.now = 144
        with patch.object(observer.time, "monotonic", clock.monotonic), patch.object(observer, "_command", side_effect=late):
            self.assertIsNone(backend.native_snapshot(123, 100))

    def test_native_probe_timeout_kills_and_reaps_owned_child_without_native_execution(self):
        import time
        backend = object.__new__(observer.Backend)
        backend.absolute = time.monotonic() + 85
        processes = []
        original = subprocess.Popen
        def spawn(args, **kwargs):
            self.assertEqual(args[0], "/usr/bin/xprop")
            process = original([sys.executable, "-I", "-c", "import time;time.sleep(10)"], **kwargs)
            processes.append(process)
            return process
        with patch.object(observer.subprocess, "Popen", side_effect=spawn):
            self.assertIsNone(backend.native_snapshot(123, time.monotonic() - 44))
        self.assertEqual(len(processes), 1)
        self.assertIsNotNone(processes[0].poll())
    def test_actual_pipe_bound_timeout_and_sanitized_cli(self):
        import time
        self.assertEqual(observer._command([sys.executable, "-I", "-c", "print('fixed')"], time.monotonic() + 2), b"fixed\n")
        for source, bound, seconds in (("print('x'*100)", 8, 2), ("import time;time.sleep(5)", 8, .03)):
            with self.assertRaises(observer.Refused):
                observer._command([sys.executable, "-I", "-c", source], time.monotonic() + seconds, bound)
        for args in ([], ["--case", "other"], ["--case", "stop", "--root", "/private"], ["--unit", UNIT]):
            self.assertEqual(observer.main(args), 2)


if __name__ == "__main__":
    unittest.main()
