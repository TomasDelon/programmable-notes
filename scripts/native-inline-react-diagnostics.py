"""Optional fixed observer diagnostics. Pure data only; never admission or execution.

Inputs are already bounded collected events and the exact frozen public observer
source. No paths, callbacks, exception strings or module execution are accepted.
Invalid/missing diagnostics return None without changing the original outcome.
"""
import ast
import json
import math
import re

EVENT_LIMIT = 256 * 1024
SOURCE_LIMIT = 64 * 1024
ROW_LIMIT = 8192
PHASES = frozenset(("admission", "host", "bridge", "ready", "pointer", "focus", "keyboard",
                    "stop", "cleanup", "host_input", "expiry", "complete"))
ERROR_TYPES = frozenset(("OSError", "PermissionError", "FileNotFoundError", "ProcessLookupError",
                         "ValueError", "TypeError", "RuntimeError", "TimeoutExpired", "Refused", "Exception"))
READINESS_STATES = frozenset(("not_observed", "missing", "empty", "native_only", "bootstrap_pending",
                              "react_ready", "react_noninitial", "runtime_error", "react_error",
                              "unhandled_rejection", "receipt_overflow", "invalid"))
EXCEPTION_FIELDS = frozenset(("phase", "error_type", "errno", "frames"))
EVENT_FIELDS = EXCEPTION_FIELDS | {"event", "elapsed"}
SCOPES = (ast.FunctionDef, ast.AsyncFunctionDef, ast.ClassDef)
CALLBACKS = (ast.Lambda, ast.ListComp, ast.SetComp, ast.DictComp, ast.GeneratorExp)


def _source_frames(source):
    if type(source) is not bytes or not 0 < len(source) <= SOURCE_LIMIT:
        return None
    tree = ast.parse(source.decode("utf8"))  # Parse only; never compile/import/eval.
    nodes = list(ast.walk(tree))
    if len(nodes) > 16384 or len(source.splitlines()) > 4096:
        return None
    allowed = {}
    for node in nodes:
        if isinstance(node, SCOPES):
            if not node.body or not re.fullmatch(r"[A-Za-z_]{1,40}", node.name):
                continue
            lines = set(range(node.body[0].lineno, node.end_lineno + 1))
            # A parent's lexical range includes nested code objects, but those
            # body lines cannot be attributed to the parent's executing frame.
            for child in ast.walk(node):
                if child is not node and isinstance(child, SCOPES) and child.body:
                    start = child.body[0].lineno
                    if start == child.lineno:
                        start += 1  # A one-line def also executes on its parent's line.
                    lines.difference_update(range(start, child.end_lineno + 1))
            allowed.setdefault(node.name, set()).update(lines)
        elif isinstance(node, CALLBACKS):
            # Observer maps Python's <lambda>/<listcomp>/... code names to this
            # single literal. It never authorizes arbitrary callback names.
            allowed.setdefault("callback", set()).update(range(node.lineno, node.end_lineno + 1))
    return allowed


def _validated(value, allowed, failed_phase):
    if (type(failed_phase) is not str or failed_phase not in PHASES or failed_phase == "complete"
            or type(value) is not dict or set(value) != EXCEPTION_FIELDS
            or type(value["phase"]) is not str or value["phase"] != failed_phase
            or type(value["error_type"]) is not str or value["error_type"] not in ERROR_TYPES
            or (value["errno"] is not None and (type(value["errno"]) is not int or not 0 <= value["errno"] <= 4096))
            or type(value["frames"]) is not list or len(value["frames"]) > 8):
        return None
    frames = []
    for frame in value["frames"]:
        if (type(frame) is not dict or set(frame) != {"function", "line"}
                or type(frame["function"]) is not str or type(frame["line"]) is not int
                or frame["line"] not in allowed.get(frame["function"], ())):
            return None
        frames.append({"function": frame["function"], "line": frame["line"]})
    return {"phase": value["phase"], "error_type": value["error_type"], "errno": value["errno"], "frames": frames}


def validate_observer_exception(value, observer_source, failed_phase):
    """Revalidate an optional aggregate against its frozen source, returning a copy."""
    try:
        allowed = _source_frames(observer_source)
        return _validated(value, allowed, failed_phase) if allowed is not None else None
    except Exception:
        return None


def _pairs(items):
    result = {}
    for key, value in items:
        if key in result:
            raise ValueError()
        result[key] = value
    return result


def _constant(_value):
    raise ValueError()


def extract_observer_exception(events, observer_source, failed_phase):
    """Preserve the first matching failure; malformed diagnostics are omitted."""
    try:
        if (type(events) is not bytes or not 0 < len(events) <= EVENT_LIMIT or not events.endswith(b"\n")
                or type(failed_phase) is not str or failed_phase not in PHASES or failed_phase == "complete"):
            return None
        allowed = _source_frames(observer_source)
        if allowed is None:
            return None
        rows = events.splitlines()
        if len(rows) > 4096:
            return None
        selected = None
        for raw in rows:
            if not 0 < len(raw) <= ROW_LIMIT:
                return None
            value = json.loads(raw.decode("utf8"), object_pairs_hook=_pairs, parse_constant=_constant)
            if type(value) is not dict:
                return None
            if selected is not None:
                continue  # Still validate JSONL structure; never replace the cause.
            if value.get("event") != "observer_exception" or value.get("phase") != failed_phase:
                continue
            if (set(value) != EVENT_FIELDS or type(value["event"]) is not str
                    or type(value["elapsed"]) not in (int, float) or not math.isfinite(value["elapsed"])
                    or not 0 <= value["elapsed"] <= 190):
                return None
            selected = _validated({key: value[key] for key in EXCEPTION_FIELDS}, allowed, failed_phase)
            if selected is None:
                return None
        return selected
    except Exception:
        return None


def validate_readiness_state(value, observer_source, failed_phase):
    try:
        if (failed_phase != "ready" or type(failed_phase) is not str or _source_frames(observer_source) is None
                or type(value) is not dict or set(value) != {"phase", "state"}
                or type(value["phase"]) is not str or value["phase"] != "ready"
                or type(value["state"]) is not str or value["state"] not in READINESS_STATES):
            return None
        return {"phase": "ready", "state": value["state"]}
    except Exception:
        return None


def extract_readiness_state(events, observer_source, failed_phase):
    try:
        if (type(events) is not bytes or not 0 < len(events) <= EVENT_LIMIT or not events.endswith(b"\n")
                or type(failed_phase) is not str or failed_phase != "ready" or _source_frames(observer_source) is None):
            return None
        rows = events.splitlines()
        if len(rows) > 4096:
            return None
        selected = None
        for raw in rows:
            if not 0 < len(raw) <= ROW_LIMIT:
                return None
            value = json.loads(raw.decode("utf8"), object_pairs_hook=_pairs, parse_constant=_constant)
            if type(value) is not dict:
                return None
            if selected is not None or value.get("event") != "readiness_state":
                continue
            if (set(value) != {"event", "elapsed", "phase", "state"}
                    or type(value["event"]) is not str or type(value["elapsed"]) not in (int, float)
                    or not math.isfinite(value["elapsed"]) or not 0 <= value["elapsed"] <= 190):
                return None
            selected = validate_readiness_state({"phase": value["phase"], "state": value["state"]}, observer_source, failed_phase)
            if selected is None:
                return None
        return selected
    except Exception:
        return None


NATIVE_FLAGS = ("built", "committed", "finished", "navigation_denied", "load_failed")
NATIVE_TERMINATIONS = frozenset(("none", "crashed", "memory_limit", "api_terminated", "unknown"))


def validate_native_snapshot(value, observer_source, failed_phase, readiness_state):
    try:
        if (failed_phase != "ready" or readiness_state not in ("native_only", "missing")
                or _source_frames(observer_source) is None or type(value) is not dict
                or set(value) != {"version", *NATIVE_FLAGS, "termination"}
                or type(value["version"]) is not int or value["version"] != 1
                or any(type(value[key]) is not bool for key in NATIVE_FLAGS)
                or type(value["termination"]) is not str or value["termination"] not in NATIVE_TERMINATIONS):
            return None
        return dict(value)
    except Exception:
        return None


def extract_native_snapshot(events, observer_source, failed_phase, readiness_state):
    try:
        if (type(events) is not bytes or not 0 < len(events) <= EVENT_LIMIT or not events.endswith(b"\n")
                or failed_phase != "ready" or readiness_state not in ("native_only", "missing")
                or _source_frames(observer_source) is None):
            return None
        rows = events.splitlines()
        if len(rows) > 4096:
            return None
        selected = None
        for raw in rows:
            if not 0 < len(raw) <= ROW_LIMIT:
                return None
            value = json.loads(raw.decode("utf8"), object_pairs_hook=_pairs, parse_constant=_constant)
            if type(value) is not dict:
                return None
            if selected is not None or value.get("event") != "native_snapshot":
                continue
            if (set(value) != {"event", "elapsed", "phase", "snapshot"} or value["phase"] != "ready"
                    or type(value["elapsed"]) not in (int, float) or not math.isfinite(value["elapsed"])
                    or not 0 <= value["elapsed"] <= 190):
                return None
            selected = validate_native_snapshot(value["snapshot"], observer_source, failed_phase, readiness_state)
            if selected is None:
                return None
        return selected
    except Exception:
        return None
