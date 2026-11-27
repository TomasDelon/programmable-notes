"""Simulated SSH/guard only; fresh local keygen and AF_UNIX fixtures, never a VM."""

import base64
import builtins
from contextlib import redirect_stdout
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import socket
import stat
import struct
import subprocess
import tempfile
import threading
from types import SimpleNamespace
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/native-vm-smoke.py"
SPEC = importlib.util.spec_from_file_location("native_vm_smoke", SCRIPT)
smoke = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(smoke)
SPEC_PREP = importlib.util.spec_from_file_location("smoke_preparation", SCRIPT.with_name("native-vm-provision.py"))
prep = importlib.util.module_from_spec(SPEC_PREP)
SPEC_PREP.loader.exec_module(prep)
GUEST_PUBLIC = b"ssh-ed25519 " + base64.b64encode(struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + b"x" * 32) + b" pn-native-guest\n"


class Process:
    def __init__(self, output=b"", status=0, guard=False):
        self.stdin = io.BytesIO()
        read, write = os.pipe()
        os.write(write, output)
        os.close(write)
        self.stdout = os.fdopen(read, "rb", buffering=0)
        self.returncode = None
        self.status, self.guard = status, guard
        self.terminated = self.killed = 0
        self.waits = []
        self.pid = 123456

    def poll(self):
        return self.returncode

    def wait(self, timeout):
        self.waits.append(timeout)
        self.returncode = self.status
        return self.status

    def terminate(self):
        self.terminated += 1
        self.status = 2

    def kill(self):
        self.killed += 1
        self.status = -9


class Smoke(unittest.TestCase):
    def execute_probe(self, *, mount_suffix=b"", auth_suffix=b""):
        authorized = (self.root / "context/controller.pub").read_bytes()
        reads = {
            "/proc/self/mountinfo": [b"1 0 8:0 / / rw - ext4 /dev/vda rw\n2 1 0:1 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n", mount_suffix, b""],
            "/home/fixture/.ssh/authorized_keys": [authorized, auth_suffix, b""],
            "/sys/fs/cgroup/cgroup.controllers": [b"cpu memory pids\n", b""],
            "/proc/1/comm": [b"systemd\n", b""],
        }
        def read(path, amount):
            self.assertIn(path, reads)
            chunk = reads[path].pop(0)
            self.assertLessEqual(len(chunk), amount)
            return chunk
        fake = SimpleNamespace(O_RDONLY=os.O_RDONLY, O_CLOEXEC=os.O_CLOEXEC,
                               O_NOFOLLOW=os.O_NOFOLLOW, O_NONBLOCK=os.O_NONBLOCK,
                               open=lambda path, flags: path, read=read, close=lambda path: None,
                               stat=lambda path, **options: SimpleNamespace(st_rdev=os.makedev(8, 0), st_mode=stat.S_IFBLK),
                               major=os.major, minor=os.minor, getuid=lambda: 1001, environ={})
        original_import = builtins.__import__
        def import_module(name, *args, **options):
            return fake if name == "os" else original_import(name, *args, **options)
        output = io.StringIO()
        with redirect_stdout(output):
            exec(smoke.PROBE, {"__builtins__": {**vars(builtins), "__import__": import_module}})
        return json.loads(output.getvalue())

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-smoke-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "packed"
        with redirect_stdout(io.StringIO()):
            self.assertEqual(prep.main(["--prepare", str(self.root)]), 0)
        for name, content in (("vmlinuz", b"kernel"), ("initrd.img", b"initrd"), ("ssh_host_ed25519_key.pub", GUEST_PUBLIC)):
            path = self.root / "guest" / name
            path.write_bytes(content)
            path.chmod(0o600)
        disk = self.root / "guest/root.ext4"
        with disk.open("wb") as stream:
            stream.truncate(6 * 1024**3)
        disk.chmod(0o600)
        self.known = self.root / "auth/known_hosts"
        self.known.write_bytes(b"[127.0.0.1]:2227 " + b" ".join(GUEST_PUBLIC.split()[:2]) + b"\n")
        self.known.chmod(0o600)
        (self.root / "client-state").mkdir(mode=0o700)
        self.config = {"version": 1, "guest_root": str(self.root / "guest"),
                       "auth_root": str(self.root / "auth"), "runtime_root": str(self.root / "runtime"),
                       "kernel": "vmlinuz", "initrd": "initrd.img", "disk": "root.ext4",
                       "ssh_key": "controller_ed25519", "ssh_port": 2227}
        self.config_path = self.root / "launch.json"
        self.save_config()
        authorization = (self.root / "context/controller.pub").read_bytes()
        self.facts = {"version": 1, "uid": 1001, "pid1_systemd": True, "cgroup_v2": True,
                      "mounts_allowed": True, "root_ext4_vda": True, "authorized_count": 1,
                      "authorized_sha256": hashlib.sha256(authorization).hexdigest(), "agent_absent": True}
        self.calls, self.processes = [], []
        self.guard = None
        self.ssh_transform = lambda status, data, _kind: (status, data)
        self.original_popen = subprocess.Popen

    def save_config(self):
        self.config_path.write_text(json.dumps(self.config))
        self.config_path.chmod(0o600)

    def dispatch(self, argv, **options):
        self.calls.append((argv, options))
        if argv[0] == "/usr/bin/ssh-keygen":
            return self.original_popen(argv, **options)
        if argv[0] == "/usr/bin/python3":
            process = Process(b"NATIVE_VM_LAUNCH_EXITED\n", guard=True)
            self.guard = process
        elif argv[0] == "/usr/bin/ssh":
            identity = argv[argv.index("-i") + 1]
            if any(arg.endswith("/wrong_known_hosts") for arg in argv):
                kind, status, data = "pin", 255, b"Host key verification failed.\n"
            elif identity.endswith("/negative_ed25519"):
                kind, status, data = "key", 255, b"Permission denied (publickey).\n"
            else:
                kind, status, data = "positive", 0, json.dumps(self.facts).encode()
            status, data = self.ssh_transform(status, data, kind)
            process = Process(data, status)
        else:
            self.fail("Unexpected executable")
        self.processes.append(process)
        self.addCleanup(process.stdout.close)
        return process

    def run_mocked(self, monitor=None):
        output = io.StringIO()
        with patch.object(subprocess, "Popen", side_effect=self.dispatch), \
                patch.object(smoke, "_powerdown", side_effect=monitor or (lambda *_args: None)), redirect_stdout(output):
            result = smoke.main(["--smoke", str(self.root)])
        return result, output.getvalue()

    def failure_receipt(self, stage):
        path = self.root / "smoke-receipt.json"
        self.assertTrue(path.is_file(), "A validated failed run must retain its fixed receipt.")
        raw = path.read_bytes()
        self.assertLess(len(raw), 1024)
        receipt = json.loads(raw)
        self.assertEqual(receipt["status"], "failed")
        self.assertEqual(receipt["scope"], "guest-os-admission-only")
        self.assertIs(receipt["native_app_tested"], False)
        self.assertEqual(receipt["stage"], stage)
        self.assertNotIn(str(self.root), raw.decode())
        self.assertNotIn("PRIVATE", raw.decode())
        for name in ("returncode", "guard_status"):
            if name in receipt:
                self.assertIs(type(receipt[name]), int)
                self.assertLessEqual(abs(receipt[name]), 255)
        return receipt

    def test_fixed_success_brackets_both_refusals_and_requires_guard_normal_exit(self):
        result, output = self.run_mocked()
        self.assertEqual((result, output), (0, "NATIVE_VM_OS_SMOKE_PASSED\n"))
        ssh = [args for args, _ in self.calls if args[0] == "/usr/bin/ssh"]
        self.assertEqual(len(ssh), 5)
        self.assertEqual(self.guard.terminated, 0)
        self.assertEqual(self.guard.killed, 0)
        receipt = json.loads((self.root / "smoke-receipt.json").read_text())
        self.assertEqual(receipt["scope"], "guest-os-admission-only")
        self.assertIs(receipt["native_app_tested"], False)
        self.assertTrue(receipt["wrong_pin_rejected"])
        self.assertTrue(receipt["wrong_key_rejected"])

    def test_ssh_argv_has_fixed_account_command_identity_and_restrictive_options(self):
        self.assertEqual(self.run_mocked()[0], 0)
        for args, options in self.calls:
            self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"})
            self.assertTrue(options["close_fds"])
            if args[0] != "/usr/bin/ssh-keygen":
                self.assertFalse(options.get("pass_fds", ()))
            if args[0] == "/usr/bin/ssh":
                self.assertEqual(args[-4:], ["fixture@127.0.0.1", "/usr/bin/python3", "-I", "-"])
                self.assertIn("StrictHostKeyChecking=yes", args)
                self.assertIn("IdentityAgent=none", args)
                self.assertIn("ForwardAgent=no", args)
                self.assertIn("ClearAllForwardings=yes", args)
                self.assertIn("ProxyCommand=none", args)
                self.assertIn("ProxyJump=none", args)
                self.assertIn("ControlMaster=no", args)
                self.assertIn("GlobalKnownHostsFile=/dev/null", args)
                self.assertEqual(args[args.index("-F") + 1], "/dev/null")
                self.assertEqual(args[args.index("-p") + 1], "2227")

    def test_unknown_arguments_refuse_before_any_dispatch(self):
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()) as output:
            self.assertEqual(smoke.main(["--smoke", str(self.root), "--ssh-args=secret"]), 2)
        dispatch.assert_not_called()
        self.assertEqual(output.getvalue(), "NATIVE_VM_OS_SMOKE_REFUSED\n")

    def test_wrong_launch_root_binding_refuses_before_any_child(self):
        self.config["auth_root"] = str(self.root / "context")
        self.save_config()
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()
        self.assertFalse((self.root / "checks").exists())
        self.assertFalse((self.root / "smoke-receipt.json").exists())

    def test_wrong_port_or_unsafe_launch_mode_refuses_before_any_child(self):
        self.config["ssh_port"] = 2228
        self.save_config()
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()

    def test_wrong_known_host_pin_and_symlink_refuse_before_launch(self):
        self.known.write_bytes(b"wrong\n")
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()
        self.known.unlink()
        self.known.symlink_to(self.root / "guest/ssh_host_ed25519_key.pub")
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()

    def test_existing_checks_or_nonempty_runtime_refuse_without_mutation(self):
        (self.root / "checks").mkdir(mode=0o700)
        sentinel = self.root / "checks/sentinel"
        sentinel.write_bytes(b"keep")
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()
        self.assertEqual(sentinel.read_bytes(), b"keep")

    def test_unsafe_private_key_or_parent_modes_refuse_before_any_child(self):
        (self.root / "auth/controller_ed25519").chmod(0o644)
        with patch.object(subprocess, "Popen") as dispatch, redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        dispatch.assert_not_called()

    def test_probe_false_share_condition_blocks_and_signals_only_owned_guard(self):
        self.facts["mounts_allowed"] = False
        result, output = self.run_mocked()
        self.assertEqual(result, 2)
        self.assertEqual(output, "NATIVE_VM_OS_SMOKE_REFUSED\n")
        self.assertEqual(self.guard.terminated, 1)
        self.assertEqual(self.guard.killed, 0)
        receipt = self.failure_receipt("probe")
        self.assertEqual(receipt.get("probe_check"), "mounts_allowed")

    def test_known_schema_and_field_refusals_report_only_fixed_check_names(self):
        expected = self.facts["authorized_sha256"]
        malformed = [b"", b"PRIVATE_INVALID_JSON", b"\xff", b"{}", b"[]", b"x" * 4097,
                     json.dumps(self.facts).replace('"version": 1', '"version":1,"version":1').encode()]
        cases = [(raw, "schema") for raw in malformed]
        for field, value in (("version", True), ("uid", "PRIVATE_UID"), ("authorized_count", 2),
                             ("pid1_systemd", False), ("cgroup_v2", False), ("mounts_allowed", 1),
                             ("root_ext4_vda", False), ("agent_absent", False), ("authorized_sha256", "PRIVATE_HASH")):
            cases.append((json.dumps({**self.facts, field: value}).encode(), field))
        cases.append((json.dumps({**self.facts, "PRIVATE_UNKNOWN": "PRIVATE_VALUE"}).encode(), "schema"))
        for raw, check in cases:
            with self.subTest(check=check):
                with self.assertRaises(Exception) as failure:
                    smoke._facts(raw, expected)
                self.assertEqual(getattr(failure.exception, "probe_check", None), check)
                self.assertIsInstance(failure.exception, smoke.Refused)
                self.assertNotIn("PRIVATE", str(failure.exception))

    def test_first_probe_field_failure_is_deterministic(self):
        expected = self.facts["authorized_sha256"]
        broken = {**self.facts, "pid1_systemd": False, "cgroup_v2": False,
                  "mounts_allowed": False, "authorized_sha256": "PRIVATE_HASH"}
        for _ in range(4):
            with self.assertRaises(smoke.Refused) as failure:
                smoke._facts(json.dumps(broken).encode(), expected)
            self.assertEqual(getattr(failure.exception, "probe_check", None), "pid1_systemd")

    def test_unknown_probe_exception_does_not_invent_a_check(self):
        with patch.object(smoke, "_facts", side_effect=RuntimeError("PRIVATE_UNKNOWN")):
            self.assertEqual(self.run_mocked()[0], 2)
        receipt = self.failure_receipt("probe")
        self.assertEqual(receipt["ssh_error"], "protocol")
        self.assertNotIn("probe_check", receipt)

    def test_successful_probe_then_later_failure_does_not_retain_a_check(self):
        # A pin-refusal failure happens outside _facts, after a successful probe.
        self.ssh_transform = lambda status, data, kind: (0, json.dumps(self.facts).encode()) if kind == "pin" else (status, data)
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertNotIn("probe_check", self.failure_receipt("pin"))

    def test_invalid_json_unknown_fields_and_truthy_boolean_never_admit(self):
        expected = self.facts["authorized_sha256"]
        for raw in (b"not-json", b"{}", json.dumps({**self.facts, "mounts_allowed": 1}).encode(),
                    json.dumps({**self.facts, "unknown_mount_path": "SECRET"}).encode(), b"x" * 4097):
            with self.assertRaises(Exception):
                smoke._facts(raw, expected)

    def test_wrong_uid_authorized_hash_or_agent_environment_never_admit(self):
        expected = self.facts["authorized_sha256"]
        for changes in ({"uid": 0}, {"authorized_sha256": "0" * 64}, {"authorized_count": 2}, {"agent_absent": False}, {"root_ext4_vda": False}):
            with self.assertRaises(Exception):
                smoke._facts(json.dumps({**self.facts, **changes}).encode(), expected)

    def test_negative_pin_that_authenticates_is_a_failure(self):
        self.ssh_transform = lambda status, data, kind: (0, json.dumps(self.facts).encode()) if kind == "pin" else (status, data)
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(self.guard.terminated, 1)

    def test_negative_network_failure_is_not_identity_refusal(self):
        self.ssh_transform = lambda status, data, kind: (255, b"Connection refused\n") if kind == "key" else (status, data)
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(self.guard.terminated, 1)

    def test_guard_marker_or_nonzero_exit_cannot_produce_success(self):
        def corrupt(*_args):
            self.guard.status = 2
        self.assertEqual(self.run_mocked(corrupt)[0], 2)
        self.failure_receipt("guard_exit")

    def test_guard_cleanup_timeout_never_sigkills_parent_or_reports_success(self):
        self.facts["cgroup_v2"] = False
        actual_dispatch = self.dispatch
        def dispatch(args, **options):
            process = actual_dispatch(args, **options)
            if process is self.guard:
                def wait(timeout):
                    raise subprocess.TimeoutExpired("PRIVATE", timeout)
                process.wait = wait
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch), patch.object(smoke, "_powerdown"), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        self.assertEqual(self.guard.terminated, 1)
        self.assertEqual(self.guard.killed, 0)
        self.assertEqual(output.getvalue(), "NATIVE_VM_OS_SMOKE_REFUSED\n")
        receipt = self.failure_receipt("cleanup")
        self.assertEqual(receipt["origin_stage"], "probe")
        self.assertEqual(receipt["reason"], "cleanup_failed")
        self.assertEqual(receipt.get("probe_check"), "cgroup_v2")

    def test_monitor_sends_only_fixed_powerdown_to_owned_unix_socket(self):
        path = self.root / "runtime/monitor.sock"
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(server.close)
        server.bind(str(path))
        server.listen(1)
        observed = []
        def receive():
            connection, _ = server.accept()
            with connection:
                observed.append(connection.recv(128))
        worker = threading.Thread(target=receive, daemon=True)
        worker.start()
        smoke._powerdown(str(self.root))
        worker.join(timeout=2)
        self.assertEqual(observed, [b"system_powerdown\n"])

    def test_guard_spawn_signal_is_retained_and_owned_guard_reaped(self):
        actual = self.dispatch
        def dispatch(args, **options):
            process = actual(args, **options)
            if process is self.guard:
                signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch), patch.object(smoke, "_powerdown"), redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        self.assertIsNotNone(self.guard)
        self.assertEqual(self.guard.terminated, 1)
        self.assertEqual(self.guard.killed, 0)

    def test_identity_replacement_between_calls_refuses_before_next_ssh(self):
        def replace(status, data, kind):
            if kind == "positive":
                path = self.root / "auth/controller_ed25519"
                path.rename(self.root / "auth/original")
                path.write_bytes(b"replacement")
                path.chmod(0o600)
            return status, data
        self.ssh_transform = replace
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(len([args for args, _ in self.calls if args[0] == "/usr/bin/ssh"]), 1)

    def test_unbounded_ssh_output_is_refused_and_owned_children_reaped(self):
        self.ssh_transform = lambda status, data, kind: (status, b"x" * 4097) if kind == "positive" else (status, data)
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(self.guard.terminated, 1)

    def test_probe_is_fixed_read_only_os_code_without_author_payload_or_mutation(self):
        self.assertIn(b"/proc/1/comm", smoke.PROBE)
        self.assertIn(b"/proc/self/mountinfo", smoke.PROBE)
        self.assertIn(b"/sys/fs/cgroup/cgroup.controllers", smoke.PROBE)
        self.assertIn(b"/home/fixture/.ssh/authorized_keys", smoke.PROBE)
        self.assertIn(b"SSH_AUTH_SOCK", smoke.PROBE)
        self.assertNotIn(b"subprocess", smoke.PROBE)
        self.assertNotIn(b"sudo", smoke.PROBE)
        self.assertLess(len(smoke.PROBE), 4096)

    def test_executed_probe_rejects_share_mount_after_allowed_short_read_prefix(self):
        facts = self.execute_probe(mount_suffix=b"3 1 0:2 / /mnt/shared rw - 9p synthetic rw\n")
        self.assertIs(facts["mounts_allowed"], False)
        with self.assertRaises(Exception):
            smoke._facts(json.dumps(facts).encode(), self.facts["authorized_sha256"])

    def test_executed_probe_detects_second_authorized_key_after_short_read_prefix(self):
        facts = self.execute_probe(auth_suffix=(self.root / "context/controller.pub").read_bytes())
        self.assertEqual(facts["authorized_count"], 2)
        with self.assertRaises(Exception):
            smoke._facts(json.dumps(facts).encode(), self.facts["authorized_sha256"])

    def test_transient_guest_ssh_banner_reset_retries_without_relaunch(self):
        positives = 0
        def startup(status, data, kind):
            nonlocal positives
            if kind == "positive":
                positives += 1
                if positives == 1:
                    return 255, b"kex_exchange_identification: read: Connection reset by peer\n"
            return status, data
        self.ssh_transform = startup
        with patch("time.sleep"):
            self.assertEqual(self.run_mocked()[0], 0)
        self.assertEqual(len([args for args, _ in self.calls if args[0] == "/usr/bin/python3"]), 1)
        self.assertEqual(positives, 4)

    def test_guest_named_ancestor_does_not_drop_auth_revalidation(self):
        parent = self.root.parent / "guest"
        parent.mkdir(mode=0o700)
        relocated = parent / "fixture"
        self.root.rename(relocated)
        self.root = relocated
        self.config_path = self.root / "launch.json"
        self.known = self.root / "auth/known_hosts"
        self.config.update(guest_root=str(self.root / "guest"), auth_root=str(self.root / "auth"), runtime_root=str(self.root / "runtime"))
        self.save_config()
        changed = False
        def replace(status, data, kind):
            nonlocal changed
            if kind == "positive" and not changed:
                changed = True
                path = self.root / "auth/controller_ed25519"
                path.rename(self.root / "auth/original")
                path.write_bytes(b"replacement")
                path.chmod(0o600)
            return status, data
        self.ssh_transform = replace
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(len([args for args, _ in self.calls if args[0] == "/usr/bin/ssh"]), 1)

    def test_early_ssh_failure_records_safe_category_and_status_without_diagnostics(self):
        self.ssh_transform = lambda status, data, kind: (255, b"PRIVATE_PATH Permission denied (publickey).\n")
        self.assertEqual(self.run_mocked()[0], 2)
        receipt = self.failure_receipt("boot_wait")
        self.assertEqual(receipt["ssh_error"], "authentication")
        self.assertEqual(receipt["returncode"], 255)
        self.assertEqual(receipt["guard_status"], 2)

    def test_powerdown_timeout_records_failure_after_owned_guard_cleanup(self):
        def timeout(*_args):
            raise TimeoutError("PRIVATE_MONITOR_PATH")
        self.assertEqual(self.run_mocked(timeout)[0], 2)
        receipt = self.failure_receipt("powerdown")
        self.assertEqual(receipt["reason"], "timeout")
        self.assertEqual(self.guard.terminated, 1)
        self.assertEqual(self.guard.killed, 0)

    def test_receipt_write_failure_does_not_mask_original_probe_refusal(self):
        self.facts["mounts_allowed"] = False
        actual = smoke.preparation._write
        def write(directory, name, content):
            if name == "smoke-receipt.json":
                raise OSError("PRIVATE_RECEIPT_ERROR")
            return actual(directory, name, content)
        with patch.object(smoke.preparation, "_write", side_effect=write), \
                patch.object(subprocess, "Popen", side_effect=self.dispatch), patch.object(smoke, "_powerdown"):
            with self.assertRaises(smoke.Refused):
                smoke._smoke(str(self.root))
        self.assertEqual(self.guard.terminated, 1)
        self.assertFalse((self.root / "smoke-receipt.json").exists())

    def test_normal_shutdown_wait_timeout_records_guard_exit_failure(self):
        actual = self.dispatch
        def dispatch(args, **options):
            process = actual(args, **options)
            if process is self.guard:
                wait = process.wait
                calls = 0
                def timed_wait(timeout):
                    nonlocal calls
                    calls += 1
                    if calls == 1:
                        raise subprocess.TimeoutExpired("PRIVATE_WAIT", timeout)
                    return wait(timeout)
                process.wait = timed_wait
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch), patch.object(smoke, "_powerdown"), redirect_stdout(io.StringIO()):
            self.assertEqual(smoke.main(["--smoke", str(self.root)]), 2)
        receipt = self.failure_receipt("guard_exit")
        self.assertEqual(receipt["reason"], "timeout")
        self.assertEqual(self.guard.terminated, 1)
        self.assertEqual(self.guard.killed, 0)


if __name__ == "__main__":
    unittest.main()
