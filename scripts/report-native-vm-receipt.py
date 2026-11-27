"""Publish only fixed, validated OS-admission categories as check annotations.

The input is a private regular receipt, not a log or an arbitrary message. Never
print rejected data, file paths, exception text, hashes or credential material.
Reporting a valid failed receipt exits zero; its original workflow step remains
failed. This reporter cannot convert OS admission into native app acceptance.
"""

import importlib.util
import json
import os
from pathlib import Path
import re
import sys

spec = importlib.util.spec_from_file_location(
    "receipt_guard", Path(__file__).with_name("native-vm-launch.py"))
guard = importlib.util.module_from_spec(spec)
spec.loader.exec_module(guard)
STAGES = {"boot_wait", "probe", "pin", "key", "fixture", "powerdown", "guard_exit"}
SSH = {"none", "host_key", "authentication", "timeout", "connection", "protocol", "other"}
BASE = {"version", "scope", "native_app_tested", "status"}
PROBE_CHECKS = {"schema", "version", "uid", "authorized_count", "authorized_sha256",
                "pid1_systemd", "cgroup_v2", "mounts_allowed", "root_ext4_vda", "agent_absent", "container_absent", "logind_active"}
BOOT_MARKERS = {"linux_kernel_started", "systemd_started", "multiuser", "sshd_started",
                "kernel_panic", "emergency", "network_wait", "crng_ready", "root_device_timeout", "initramfs_shell"}
PASSED = {"wrong_pin_rejected", "wrong_key_rejected", "guard_normal_exit", "pid1_systemd",
          "cgroup_v2", "mounts_allowed", "root_ext4_vda", "agent_absent", "container_absent", "logind_active"}


def annotation(receipt):
    if (type(receipt) is not dict or type(receipt.get("version")) is not int
            or receipt["version"] != 1 or receipt.get("scope") != "guest-os-admission-only"
            or receipt.get("native_app_tested") is not False):
        raise guard.Refused()
    if receipt.get("status") == "passed":
        if set(receipt) != BASE | PASSED | {"uid", "authorized_count", "authorized_sha256"}:
            raise guard.Refused()
        if any(receipt[name] is not True for name in PASSED):
            raise guard.Refused()
        for key, expected in (("uid", 1001), ("authorized_count", 1)):
            if type(receipt[key]) is not int or receipt[key] != expected:
                raise guard.Refused()
        digest = receipt["authorized_sha256"]
        if type(digest) is not str or re.fullmatch(r"[0-9a-f]{64}", digest) is None:
            raise guard.Refused()
        return "::notice title=Guest OS admission::status=passed scope=guest-os-admission-only native_app_tested=false"
    required = BASE | {"stage", "reason", "ssh_error"}
    if (receipt.get("status") != "failed" or not required <= set(receipt)
            or set(receipt) - required - {"origin_stage", "returncode", "guard_status", "probe_check", "boot_markers", "serial_bytes"}):
        raise guard.Refused()
    for key, allowed in (("stage", STAGES | {"cleanup"}),
                         ("reason", {"refused", "timeout", "cleanup_failed"}),
                         ("ssh_error", SSH)):
        if type(receipt[key]) is not str or receipt[key] not in allowed:
            raise guard.Refused()
    if receipt["stage"] == "cleanup":
        if (receipt["reason"] != "cleanup_failed" or type(receipt.get("origin_stage")) is not str
                or receipt["origin_stage"] not in STAGES):
            raise guard.Refused()
    elif "origin_stage" in receipt or receipt["reason"] == "cleanup_failed":
        raise guard.Refused()
    if "probe_check" in receipt:
        if (type(receipt["probe_check"]) is not str or receipt["probe_check"] not in PROBE_CHECKS
                or receipt["ssh_error"] != "protocol"
                or not ((receipt["stage"] == "probe" and receipt["reason"] == "refused")
                        or (receipt["stage"] == "cleanup" and receipt["origin_stage"] == "probe"))):
            raise guard.Refused()
    if "boot_markers" in receipt or "serial_bytes" in receipt:
        markers = receipt.get("boot_markers")
        count = receipt.get("serial_bytes")
        if (not ((receipt["stage"] == "boot_wait" and receipt["reason"] in {"refused", "timeout"})
                 or (receipt["stage"] == "cleanup" and receipt["origin_stage"] == "boot_wait"))
                or type(markers) is not list or len(markers) > len(BOOT_MARKERS)
                or any(type(marker) is not str or marker not in BOOT_MARKERS for marker in markers)
                or markers != sorted(set(markers))
                or type(count) is not int or not 0 <= count <= guard.SERIAL_LIMIT):
            raise guard.Refused()
    message = ["status=failed", "stage=" + receipt["stage"], "reason=" + receipt["reason"],
               "ssh_error=" + receipt["ssh_error"]]
    for key in ("origin_stage", "returncode", "guard_status", "probe_check"):
        if key not in receipt:
            continue
        value = receipt[key]
        if key not in {"origin_stage", "probe_check"} and (type(value) is not int or not -255 <= value <= 255):
            raise guard.Refused()
        message.append(key + "=" + str(value))
    if "boot_markers" in receipt:
        message.append("boot_markers=" + (",".join(receipt["boot_markers"]) or "none"))
        message.append("serial_bytes=" + str(receipt["serial_bytes"]))
    message.append("native_app_tested=false")
    return "::error title=Guest OS admission::" + " ".join(message)


def main():
    try:
        if len(sys.argv) != 2 or sys.platform != "linux":
            raise guard.Refused()
        fd = guard._open_absolute(sys.argv[1])
        try:
            if guard._regular(fd, private=True).st_size > 16384:
                raise guard.Refused()
            raw = bytearray()
            while len(raw) <= 16384:
                chunk = os.read(fd, min(4096, 16385 - len(raw)))
                if not chunk:
                    break
                raw.extend(chunk)
            if len(raw) > 16384:
                raise guard.Refused()
            receipt = json.loads(raw, object_pairs_hook=guard._pairs)
        finally:
            os.close(fd)
        print(annotation(receipt))
        return 0
    except (Exception, KeyboardInterrupt):
        print("NATIVE_VM_RECEIPT_REFUSED")
        return 2


if __name__ == "__main__":
    raise SystemExit(main())
