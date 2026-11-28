"""Pure sanitizer controls: no guest, display, subprocess or source evaluation."""
import ast
import importlib.util
import json
from pathlib import Path
import unittest

ROOT = Path(__file__).resolve().parents[2]
SPEC = importlib.util.spec_from_file_location("observer_diagnostics", ROOT / "scripts/native-inline-react-diagnostics.py")
diagnostics = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(diagnostics)
SOURCE = b'''def run():
    value = 1
    def nested():
        return 2
    return value

def interrupted():
    raise ValueError()

def sibling():
    return 3

def factory():
    return lambda: 1 / 0
'''


def value(**changes):
    return {"phase": "host", "error_type": "Refused", "errno": None,
            "frames": [{"function": "run", "line": 2}, {"function": "interrupted", "line": 8}], **changes}


def event(**changes):
    return {"event": "observer_exception", "elapsed": 1.5, **value(), **changes}


def wire(*rows):
    return b"".join((json.dumps(row) + "\n").encode() for row in rows)


class Diagnostics(unittest.TestCase):
    def test_keyboard_attempt_is_exact_bounded_and_old_events_remain_optional(self):
        detail = {"phase": "keyboard", "availableMs": 500, "limitingClock": "unit_input", "elapsedMs": 510, "timeoutKind": "pipe_wait", "outcome": "failed"}
        row = {"event": "keyboard_attempt", "elapsed": 49.01, **detail}
        self.assertEqual(diagnostics.extract_keyboard_attempt(wire(row), SOURCE, "keyboard"), detail)
        for phase in ("stop", "cleanup", "host_input", "complete"):
            self.assertEqual(diagnostics.validate_keyboard_attempt(detail, SOURCE, phase), detail)
        self.assertIsNone(diagnostics.extract_keyboard_attempt(wire(event()), SOURCE, "keyboard"))
        self.assertIsNone(diagnostics.extract_keyboard_attempt(wire(row), SOURCE, "ready"))
        self.assertIsNone(diagnostics.extract_keyboard_attempt(wire(row, row), SOURCE, "keyboard"))
        self.assertIsNone(diagnostics.extract_keyboard_attempt(wire(row) + b"{broken\n", SOURCE, "keyboard"))
        self.assertIsNone(diagnostics.validate_keyboard_attempt(detail, b"invalid (", "keyboard"))
        saved = diagnostics.validate_keyboard_attempt(detail, SOURCE, "keyboard")
        detail["availableMs"] = 0
        self.assertEqual(saved["availableMs"], 500)

    def test_keyboard_attempt_refuses_injected_or_noncanonical_values(self):
        detail = {"phase": "keyboard", "availableMs": 2000, "limitingClock": "local", "elapsedMs": 2010, "timeoutKind": "pipe_wait", "outcome": "failed"}
        for changes in ({"phase": "host"}, {"availableMs": True}, {"availableMs": -1}, {"availableMs": 2001}, {"availableMs": 1.5}, {"availableMs": 500}, {"elapsedMs": True}, {"elapsedMs": -1}, {"elapsedMs": 190001}, {"elapsedMs": 1}, {"elapsedMs": float("nan")}, {"limitingClock": "PRIVATE%0A::error"}, {"timeoutKind": "PRIVATE"}, {"outcome": "PRIVATE"}, {"outcome": "returned"}, {"timeoutKind": "before_start"}, {"raw": "PRIVATE"}):
            self.assertIsNone(diagnostics.validate_keyboard_attempt({**detail, **changes}, SOURCE, "keyboard"))
        row = {"event": "keyboard_attempt", "elapsed": 49.01, **detail}
        for raw in (wire({**row, "elapsed": True}), wire({**row, "elapsed": float("nan")}), wire({**row, "raw": "PRIVATE"}), wire(row)[:-1], wire(row).replace(b'"availableMs": 2000', b'"availableMs": 2000, "availableMs": 2')):
            self.assertIsNone(diagnostics.extract_keyboard_attempt(raw, SOURCE, "keyboard"))

    def test_native_snapshot_is_exact_detached_and_category_gated(self):
        value = {"version": 2, "guards_installed": False, "publication_requested": False, "publication_returned": False, "provisional_started": False, **{key: False for key in diagnostics.NATIVE_FLAGS}, "termination": "none"}
        row = {"event": "native_snapshot", "elapsed": 44.1, "phase": "ready", "snapshot": value}
        extract = lambda raw=wire(row), phase="ready", state="native_only": diagnostics.extract_native_snapshot(raw, SOURCE, phase, state)
        self.assertEqual(extract(), value)
        for state in ("missing",):
            self.assertEqual(extract(state=state), value)
        for state in ("react_ready", "bootstrap_pending", "PRIVATE"):
            self.assertIsNone(extract(state=state))
        self.assertIsNone(extract(phase="stop"))
        for changes in ({"version": True}, {"version": 1}, {"built": 1}, {"guards_installed": 1},
                        {"publication_requested": "true"}, {"publication_returned": None},
                        {"provisional_started": []}, {"termination": "PRIVATE"}, {"uri": "PRIVATE"}):
            bad = {**row, "snapshot": {**value, **changes}}
            self.assertIsNone(extract(wire(bad, row)))
        for missing in value:
            self.assertIsNone(extract(wire({**row, "snapshot": {key: detail for key, detail in value.items() if key != missing}})))
        legacy = {key: detail for key, detail in value.items() if key not in {"guards_installed", "publication_requested", "publication_returned", "provisional_started"}}
        self.assertIsNone(extract(wire({**row, "snapshot": {**legacy, "version": 1}})))
        for bad in (wire({**row, "message": "PRIVATE"}), wire({**row, "elapsed": float("nan")}),
                    wire(row) + b"{broken\n", wire(row)[:-1], wire({**row, "snapshot": []})):
            self.assertIsNone(extract(bad))
        copy = diagnostics.validate_native_snapshot(value, SOURCE, "ready", "missing")
        value["built"] = True
        self.assertFalse(copy["built"])

    def test_readiness_state_is_fixed_enum_and_only_for_ready_failure(self):
        for state in diagnostics.READINESS_STATES:
            row = {"event": "readiness_state", "elapsed": 44, "phase": "ready", "state": state}
            self.assertEqual(diagnostics.extract_readiness_state(wire(row), SOURCE, "ready"), {"phase": "ready", "state": state})
            self.assertIsNone(diagnostics.extract_readiness_state(wire(row), SOURCE, "keyboard"))
        base = {"event": "readiness_state", "elapsed": 44, "phase": "ready", "state": "native_only"}
        for changes in ({"state": "PRIVATE%0A::error"}, {"title": "PRIVATE"}, {"phase": "host"}, {"elapsed": True}, {"elapsed": float("nan")}):
            self.assertIsNone(diagnostics.extract_readiness_state(wire({**base, **changes}), SOURCE, "ready"))
        self.assertIsNone(diagnostics.extract_readiness_state(wire(base) + b"{broken\n", SOURCE, "ready"))
        self.assertIsNone(diagnostics.extract_readiness_state(wire({**base, "state": "PRIVATE"}, base), SOURCE, "ready"))
        self.assertIsNone(diagnostics.validate_readiness_state({"phase": "ready", "state": "native_only", "title": "PRIVATE"}, SOURCE, "ready"))
        self.assertIsNone(diagnostics.validate_readiness_state({"phase": "ready", "state": "native_only"}, b"invalid syntax (", "ready"))
    def extract(self, raw=None, source=SOURCE, phase="host"):
        return diagnostics.extract_observer_exception(wire(event()) if raw is None else raw, source, phase)

    def test_valid_interruption_frames_are_distinguished_without_messages(self):
        result = self.extract()
        self.assertEqual(result, value())
        self.assertEqual(result["frames"][-1], {"function": "interrupted", "line": 8})
        self.assertNotIn("elapsed", result)
        self.assertNotIn("event", result)
        self.assertNotIn("message", result)

    def test_actual_frozen_observer_own_function_and_line_are_accepted(self):
        source = (ROOT / "scripts/native-inline-react-v1/observer.py").read_bytes()
        tree = ast.parse(source)
        interrupted = next(node for node in ast.walk(tree) if isinstance(node, ast.FunctionDef) and node.name == "interrupted")
        frame = {"function": "interrupted", "line": interrupted.body[0].lineno}
        self.assertEqual(self.extract(wire(event(frames=[frame])), source)["frames"], [frame])

    def test_first_matching_failure_is_retained_and_not_replaced_by_later_cause(self):
        rows = [event(phase="cleanup", error_type="PermissionError", errno=13),
                {"event": "pointer_ack", "count": 2}, event(), event(error_type="OSError", errno=5)]
        self.assertEqual(self.extract(wire(*rows)), value())
        # Invalid first matching evidence cannot be replaced with a later cause.
        self.assertIsNone(self.extract(wire(event(message="PRIVATE"), event())))

    def test_missing_wrong_phase_and_unrecognized_event_are_omitted(self):
        for raw in (b"", wire({"event": "other"}), wire(event(phase="cleanup")), wire({"event": "observer_exception"})):
            self.assertIsNone(self.extract(raw))
        self.assertIsNone(self.extract(phase="complete"))
        self.assertIsNone(self.extract(phase="PRIVATE"))

    def test_exact_event_and_exception_fields_only(self):
        for extra in ("message", "path", "source", "stack", "private", "status"):
            with self.subTest(extra=extra):
                self.assertIsNone(self.extract(wire(event(**{extra: "PRIVATE"}))))
                self.assertIsNone(diagnostics.validate_observer_exception(value(**{extra: "PRIVATE"}), SOURCE, "host"))
        for key in event():
            missing = event(); del missing[key]
            self.assertIsNone(self.extract(wire(missing)))

    def test_finite_closed_error_types_errno_and_phase(self):
        for kind in diagnostics.ERROR_TYPES:
            self.assertEqual(self.extract(wire(event(error_type=kind)))["error_type"], kind)
        for field, bad in (("error_type", "PRIVATE"), ("error_type", True), ("phase", "PRIVATE"), ("errno", -1),
                           ("errno", 4097), ("errno", True), ("errno", 1.0), ("errno", "13")):
            self.assertIsNone(self.extract(wire(event(**{field: bad}))))
        for number in (None, 0, 3, 13, 4096):
            self.assertEqual(self.extract(wire(event(errno=number)))["errno"], number)

    def test_elapsed_must_be_finite_bounded_numeric_and_never_republished(self):
        for bad in (-1, 191, True, "1", float("nan"), float("inf"), float("-inf")):
            self.assertIsNone(self.extract(wire(event(elapsed=bad))))
        for number in (0, 190, .5):
            self.assertEqual(self.extract(wire(event(elapsed=number))), value())

    def test_frames_require_actual_own_function_body_not_signature_sibling_or_nested_body(self):
        for frame in ({"function": "run", "line": 1}, {"function": "run", "line": 4},
                      {"function": "run", "line": 11}, {"function": "interrupted", "line": 2},
                      {"function": "module", "line": 2}, {"function": "/PRIVATE", "line": 2},
                      {"function": "run", "line": True}, {"function": "run", "line": 2.0},
                      {"function": "run", "line": 2, "path": "PRIVATE"}):
            self.assertIsNone(self.extract(wire(event(frames=[frame]))))
        self.assertEqual(self.extract(wire(event(frames=[{"function": "nested", "line": 4}])))["frames"], [{"function": "nested", "line": 4}])
        self.assertEqual(self.extract(wire(event(frames=[{"function": "callback", "line": 14}])))["frames"], [{"function": "callback", "line": 14}])

    def test_frames_and_source_bounds_and_wrong_types_omit(self):
        for frames in (None, {}, "PRIVATE", [value()["frames"][0]] * 9):
            self.assertIsNone(self.extract(wire(event(frames=frames))))
        self.assertEqual(self.extract(wire(event(frames=[])))["frames"], [])
        for source in (b"", b"x" * (diagnostics.SOURCE_LIMIT + 1), b"\xff", b"not valid python (", "def run(): pass"):
            self.assertIsNone(self.extract(source=source))

    def test_unicode_or_unbounded_function_names_never_enter_notice_data(self):
        for name in ("sëcret", "x" * 41):
            source = ("def " + name + "():\n    return 1\n").encode()
            self.assertIsNone(self.extract(wire(event(frames=[{"function": name, "line": 2}])), source))

    def test_source_is_parsed_without_executing_top_level_or_callbacks(self):
        source = b"raise RuntimeError('MUST NOT EXECUTE')\n" + SOURCE
        result = self.extract(wire(event(frames=[{"function": "run", "line": 3}])), source)
        self.assertEqual(result["frames"], [{"function": "run", "line": 3}])

    def test_bounded_jsonl_rejects_duplicates_malformed_unicode_nonfinite_and_large_rows(self):
        raw = wire(event())
        for bad in (raw[:-1], b"\xff\n", b"{broken\n", b"[]\n", raw.replace(b'"errno": null', b'"errno": null, "errno": 13'),
                    b'{"event":"other","value":NaN}\n' + raw, b"x" * 8193 + b"\n", b"{}\n" * 4097,
                    b"x" * (diagnostics.EVENT_LIMIT + 1), raw + b"{broken\n", raw + b"x" * 8193 + b"\n"):
            self.assertIsNone(self.extract(bad))

    def test_validation_returns_fresh_detached_plain_data(self):
        original = value()
        result = diagnostics.validate_observer_exception(original, SOURCE, "host")
        original["frames"][0]["line"] = 999
        self.assertEqual(result["frames"][0]["line"], 2)
        self.assertIsNone(diagnostics.validate_observer_exception(result, SOURCE, "cleanup"))


if __name__ == "__main__":
    unittest.main()
