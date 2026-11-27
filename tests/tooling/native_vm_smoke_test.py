"""Simulated SSH/guard only; fresh local keygen and AF_UNIX fixtures, never a VM."""

import base64
import builtins
from contextlib import contextmanager, redirect_stdout
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
from unittest.mock import MagicMock, patch

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
    def set_debian_profile(self):
        context = self.root / "context"
        (context / "Dockerfile").write_bytes(prep._sources("debian13")["Dockerfile"])
        manifest_file = self.root / "preparation.json"
        manifest = json.loads(manifest_file.read_text())
        manifest.update(source_profile="debian13", base_image=prep.DEBIAN_BASE)
        manifest["sha256"] = {name: hashlib.sha256((context / name).read_bytes()).hexdigest() for name in prep.CONTEXT}
        manifest_file.write_text(json.dumps(manifest))

    def test_closed_debian_profile_is_bound_to_actual_environment_before_admission(self):
        self.set_debian_profile()
        self.facts["environment"] = {"id": "debian", "version": "13", "kernel_release": "6.12.1+deb13-amd64",
                                     "packages": {name: "1.0" for name in (*prep.PACKAGES, "linux-image-amd64")}}
        self.assertEqual(self.run_mocked()[0], 0)
        receipt = json.loads((self.root / "smoke-receipt.json").read_text())
        self.assertEqual(receipt["source_profile"], "debian13")
        self.assertEqual(receipt["environment"], self.facts["environment"])

    def test_debian_context_cannot_admit_ubuntu_or_malformed_environment(self):
        self.set_debian_profile()
        self.assertEqual(self.run_mocked()[0], 2)
        self.assertEqual(self.failure_receipt("probe")["probe_check"], "environment")

    def test_environment_identity_has_only_fixed_ascii_bounded_public_values(self):
        original = self.facts["environment"]
        variants = [{**original, "id": "other"}, {**original, "version": "13"}, {**original, "hostname": "PRIVATE"},
                    {**original, "kernel_release": "PRIVATE\n::error::"}, {**original, "kernel_release": "6.12.1-amd64"},
                    {**original, "packages": {**original["packages"], "arbitrary": "1"}},
                    {**original, "packages": {**original["packages"], "systemd": "1%0APRIVATE"}},
                    {**original, "packages": {**original["packages"], "systemd": "1" * 129}}]
        for value in variants:
            with self.assertRaises(smoke.ProbeRefused) as failure:
                smoke._facts(json.dumps({**self.facts, "environment": value}).encode(), self.facts["authorized_sha256"])
            self.assertEqual(failure.exception.probe_check, "environment")
        self.assertLessEqual(len(smoke.PROBE), 4096)  # Initial fixed pipe write remains bounded.

    def test_actual_fixed_probe_package_stream_rejects_overflow_duplicates_and_unlisted_names(self):
        for raw in (b"x" * 2049, b"systemd=1\nsystemd=2\n", b"arbitrary=1\n", b"\xff\n"):
            with self.subTest(size=len(raw)), self.assertRaises((ValueError, UnicodeError)):
                self.execute_probe(package_output=raw)

    def execute_probe(self, *, mount_suffix=b"", auth_suffix=b"", command_results=None, package_output=None):
        authorized = (self.root / "context/controller.pub").read_bytes()
        reads = {
            "/usr/lib/os-release": [b'ID=ubuntu\nVERSION_ID="24.04"\n', b""],
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
                               major=os.major, minor=os.minor, getuid=lambda: 1001, environ={},
                               uname=lambda: SimpleNamespace(release="6.8.0-1-generic"))
        original_import = builtins.__import__
        results = iter(command_results or [1, 0])
        def run(args, **options):
            expected = (["/usr/bin/systemd-detect-virt", "--container", "--quiet"],
                        ["/usr/bin/systemctl", "is-active", "--quiet", "systemd-logind.service"])
            self.assertIn(args, expected)
            self.assertEqual(options, {"stdin": subprocess.DEVNULL, "stdout": subprocess.DEVNULL,
                                       "stderr": subprocess.DEVNULL, "timeout": 2})
            result = next(results)
            if isinstance(result, Exception):
                raise result
            return SimpleNamespace(returncode=result)
        def import_module(name, *args, **options):
            if name == "os":
                return fake
            if name == "subprocess":
                def popen(argv, **kwargs):
                    self.assertEqual(argv[:5], ['/usr/bin/dpkg-query', '--show', '--showformat=${Package}=${Version}\n', '--', 'systemd'])
                    self.assertEqual(argv[5:], ['libc6', 'libgtk-3-0t64', 'libwebkit2gtk-4.1-0', 'linux-image-generic'])
                    self.assertEqual(kwargs, {"stdin":subprocess.DEVNULL,"stdout":subprocess.PIPE,"stderr":subprocess.DEVNULL})
                    raw = ''.join(name + '=1.0\n' for name in argv[4:]).encode() if package_output is None else package_output
                    read_fd, write_fd = os.pipe()
                    os.write(write_fd, raw); os.close(write_fd)
                    stream = os.fdopen(read_fd, 'rb')
                    return SimpleNamespace(stdout=stream, wait=lambda timeout: 0, poll=lambda: 0)
                return SimpleNamespace(run=run, Popen=popen, PIPE=subprocess.PIPE, DEVNULL=subprocess.DEVNULL,
                                       TimeoutExpired=subprocess.TimeoutExpired)
            return original_import(name, *args, **options)
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
                      "authorized_sha256": hashlib.sha256(authorization).hexdigest(), "agent_absent": True,
                      "container_absent": True, "logind_active": True,
                      "environment": {"id": "ubuntu", "version": "24.04", "kernel_release": "6.8.0-1-generic",
                                      "packages": {name: "1.0" for name in (*prep.PACKAGES, "linux-image-generic")}}}
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

    def test_default_os_smoke_never_imports_or_prepares_inline_payload(self):
        with patch.object(smoke, "_module") as module:
            self.assertEqual(self.run_mocked()[0], 0)
            module.assert_not_called()

    def test_inline_payload_freezes_before_launch_runs_after_brackets_and_failed_case_stays_failed(self):
        events = []
        @contextmanager
        def prepare():
            events.append("prepare")
            try:
                yield "frozen"
            finally:
                events.append("release")
        def admitted(root, witnesses, process, prepared):
            self.assertEqual(prepared, "frozen")
            self.assertIs(process, self.guard)
            self.assertNotIn(str(self.root / "guest/root.ext4"), witnesses)
            self.assertEqual(len([args for args, _ in self.calls if args[0] == "/usr/bin/ssh"]), 5)
            events.append("fixture")
            return {"status": "failed", "native_app_tested": False}
        profile = SimpleNamespace(_prepare=prepare, _run_admitted=admitted, CleanupFailed=RuntimeError)
        actual = self.dispatch
        def dispatch(args, **options):
            if args[0] == "/usr/bin/python3":
                self.assertEqual(events, ["prepare"])
                events.append("launch")
            return actual(args, **options)
        with patch.object(smoke, "_module", return_value=profile), \
                patch.object(subprocess, "Popen", side_effect=dispatch), \
                patch.object(smoke, "_powerdown", side_effect=lambda *_: events.append("qmp")):
            result = smoke._smoke(str(self.root), inline_react=True)
        self.assertEqual(events, ["prepare", "launch", "fixture", "qmp", "release"])
        self.assertEqual(result["status"], "failed")
        self.assertIs(result["guard_normal_exit"], True)
        self.assertEqual(json.loads((self.root / "smoke-receipt.json").read_bytes())["status"], "passed")
        self.assertEqual(json.loads((self.root / "inline-react-receipt.json").read_bytes())["status"], "failed")

    def test_inline_transport_cleanup_failure_remains_lifecycle_failure(self):
        @contextmanager
        def prepare():
            yield "frozen"
        class ProfileCleanup(Exception):
            pass
        profile = SimpleNamespace(_prepare=prepare, CleanupFailed=ProfileCleanup,
                                  _run_admitted=MagicMock(side_effect=ProfileCleanup()))
        with patch.object(smoke, "_module", return_value=profile), \
                patch.object(subprocess, "Popen", side_effect=self.dispatch), patch.object(smoke, "_powerdown") as powerdown:
            with self.assertRaises(smoke.CleanupFailed):
                smoke._smoke(str(self.root), inline_react=True)
            powerdown.assert_not_called()
        self.assertEqual(self.guard.terminated, 1)
        receipt = self.failure_receipt("cleanup")
        self.assertEqual(receipt["origin_stage"], "fixture")
        self.assertFalse((self.root / "inline-react-receipt.json").exists())

    def test_inline_freeze_failure_and_nonboolean_modes_cannot_launch_guest(self):
        for mode in ("inline", None, lambda: None, 1):
            with patch.object(subprocess, "Popen") as spawn:
                with self.assertRaises(smoke.Refused):
                    smoke._smoke(str(self.root), inline_react=mode)
                spawn.assert_not_called()
        profile = SimpleNamespace(_prepare=MagicMock(side_effect=smoke.Refused()))
        with patch.object(smoke, "_module", return_value=profile), \
                patch.object(subprocess, "Popen", side_effect=self.dispatch):
            with self.assertRaises(smoke.Refused):
                smoke._smoke(str(self.root), inline_react=True)
        self.assertIsNone(self.guard)

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
                             ("root_ext4_vda", False), ("agent_absent", False),
                             ("container_absent", 1), ("logind_active", False),
                             ("authorized_sha256", "PRIVATE_HASH")):
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

    def qmp_fixture(self, replies):
        path = self.root / "runtime/monitor.sock"
        server = socket.socket(socket.AF_UNIX, socket.SOCK_STREAM)
        self.addCleanup(server.close)
        server.bind(str(path))
        server.listen(1)
        observed = []
        def receive():
            connection, _ = server.accept()
            with connection:
                connection.settimeout(1)
                try:
                    for reply in replies:
                        if reply is None:
                            observed.append(connection.recv(256))
                        else:
                            for chunk in reply:
                                connection.sendall(chunk)
                except (BrokenPipeError, ConnectionResetError):
                    pass
        worker = threading.Thread(target=receive, daemon=True)
        worker.start()
        return worker, observed

    def test_qmp_fragmented_greeting_and_acknowledgements_send_only_fixed_commands(self):
        worker, observed = self.qmp_fixture([
            [b'{"QMP":{"version":{},', b'"capabilities":[]}}\r\n'], None,
            [b'{"event":"READY","data":{},"timestamp":{}}\r\n',
             b'{"return":{},"id":"capabilities"}\r', b'\n'], None,
            [b'{"return":{},"id":"powerdown"}\r\n']])
        smoke._powerdown(str(self.root))
        worker.join(timeout=2)
        self.assertFalse(worker.is_alive())
        self.assertEqual([json.loads(raw) for raw in observed], [
            {"execute": "qmp_capabilities", "id": "capabilities"},
            {"execute": "system_powerdown", "id": "powerdown"}])

    def test_qmp_refuses_wrong_ids_errors_duplicates_oversize_and_invalid_greetings(self):
        for greeting, reply in [
            (b'{}\r\n', b''),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"return":{},"id":"wrong"}\r\n'),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"error":{"class":"GenericError"},"id":"capabilities"}\r\n'),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"return":{},"id":"capabilities","id":"capabilities"}\r\n'),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'x' * 4097),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"return":{},"id":"capabilities"}\r\n' * 2),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"event":"READY"}\r\n' * 17),
            (b'{"QMP":{"version":{},"capabilities":[]}}\r\n', b'{"event":1}\r\n'),
        ]:
            with self.subTest(reply=reply[:32]):
                path = self.root / "runtime/monitor.sock"
                if path.exists():
                    path.unlink()
                worker, _ = self.qmp_fixture([[greeting], None, [reply]])
                with self.assertRaises(Exception):
                    smoke._powerdown(str(self.root))
                worker.join(timeout=2)

    def test_qmp_uses_one_deadline_including_fragmented_greeting(self):
        worker, _ = self.qmp_fixture([[b'{"QMP":{"version":{},"capabilities":[]}}\r\n']])
        with patch.object(smoke.time, "monotonic", side_effect=[0, 0, 0, 5]):
            with self.assertRaises(smoke.TimedOut):
                smoke._powerdown(str(self.root))
        worker.join(timeout=2)

    def test_qmp_stalled_peer_times_out_without_fallback_command(self):
        path = self.root / "runtime/monitor.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
            server.bind(str(path))
            server.listen(1)
            # Real connected socket, with a shortened synthetic remaining deadline.
            with patch.object(smoke.time, "monotonic", side_effect=[0, 4.99, 4.99]):
                with self.assertRaises(TimeoutError):
                    smoke._powerdown(str(self.root))
            connection, _ = server.accept()
            with connection:
                self.assertEqual(connection.recv(1024), b"")

    def test_qmp_rejects_duplicate_final_ack_already_buffered_with_accepted_ack(self):
        path = self.root / "runtime/monitor.sock"
        with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as server:
            server.bind(str(path))
            # Script recv boundaries: later frames after completion are outside
            # this check; only an already-buffered trailing reply is rejected.
            monitor = MagicMock()
            monitor.__enter__.return_value = monitor
            monitor.recv.side_effect = [
                b'{"QMP":{"version":{},"capabilities":[]}}\r\n',
                b'{"return":{},"id":"capabilities"}\r\n',
                b'{"return":{},"id":"powerdown"}\r\n' * 2]
            with patch.object(smoke.socket, "socket", return_value=monitor):
                with self.assertRaises(smoke.Refused):
                    smoke._powerdown(str(self.root))
            self.assertEqual(monitor.recv.call_count, 3)

    def test_full_os_probe_accepts_only_exact_command_exit_codes(self):
        for results, field in [([0, 0], "container_absent"), ([2, 0], "container_absent"),
                               ([FileNotFoundError(), 0], "container_absent"),
                               ([subprocess.TimeoutExpired("fixed", 2), 0], "container_absent"),
                               ([1, 1], "logind_active"), ([1, FileNotFoundError()], "logind_active"),
                               ([1, subprocess.TimeoutExpired("fixed", 2)], "logind_active")]:
            facts = self.execute_probe(command_results=results)
            self.assertIs(facts[field], False)
            with self.assertRaises(smoke.ProbeRefused) as failure:
                smoke._facts(json.dumps(facts).encode(), self.facts["authorized_sha256"])
            self.assertEqual(failure.exception.probe_check, field)
        facts = self.execute_probe()
        self.assertIs(facts["container_absent"], True)
        self.assertIs(facts["logind_active"], True)

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
        self.assertIn(b"/usr/bin/systemd-detect-virt", smoke.PROBE)
        self.assertIn(b"/usr/bin/systemctl", smoke.PROBE)
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

    def test_boot_failure_retains_only_fixed_advisory_serial_markers_after_cleanup(self):
        raw = b"PRIVATE_SERIAL_PATH\x1b[31m Linux version synthetic\nsystemd[1]: starting\nStarted ssh.service\nLinux version repeated\n::error::PRIVATE_INJECTION\n"
        actual = self.dispatch
        def dispatch(args, **options):
            if args[0] == "/usr/bin/python3":
                path = self.root / "runtime/serial.log"
                path.write_bytes(raw)
                path.chmod(0o600)
            return actual(args, **options)
        self.ssh_transform = lambda *_args: (255, b"Permission denied (publickey).")
        with patch.object(self, "dispatch", side_effect=dispatch):
            self.assertEqual(self.run_mocked()[0], 2)
        receipt = self.failure_receipt("boot_wait")
        self.assertEqual(receipt.get("boot_markers"), ["linux_kernel_started", "sshd_started", "systemd_started"])
        self.assertEqual(receipt.get("serial_bytes"), len(raw))
        self.assertEqual(self.guard.terminated, 1)

    def test_serial_observations_handle_short_reads_and_never_emit_untrusted_bytes(self):
        path = self.root / "runtime/serial.log"
        raw = (b"PRIVATE\x1b[31m::error::INJECTION\nLinux version synthetic\nsystemd[1]: starting\n"
               b"Reached target multi-user.target\nStarted ssh.service\nKernel panic - not syncing\n"
               b"You are in emergency mode.\nsystemd-networkd-wait-online.service\nrandom: crng init done\n"
               b"Gave up waiting for root file system device\n(initramfs)\n")
        path.write_bytes(raw)
        path.chmod(0o600)
        runtime = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        actual = os.read
        with patch.object(os, "read", side_effect=lambda fd, size: actual(fd, min(size, 3))):
            result = smoke._serial_observations(runtime)
        self.assertEqual(result, {"boot_markers": ["crng_ready", "emergency", "initramfs_shell", "kernel_panic", "linux_kernel_started", "multiuser", "network_wait", "root_device_timeout", "sshd_started", "systemd_started"], "serial_bytes": len(raw)})
        self.assertNotIn("PRIVATE", json.dumps(result))
        self.assertNotIn("\x1b", json.dumps(result))

    def test_serial_missing_unsafe_and_oversized_files_are_omitted_before_any_read(self):
        runtime = os.open(self.root / "runtime", os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        path = self.root / "runtime/serial.log"
        self.assertIsNone(smoke._serial_observations(runtime))
        path.symlink_to(self.root / "auth/controller_ed25519")
        with patch.object(os, "read", side_effect=AssertionError("must not read private target")) as reader:
            self.assertIsNone(smoke._serial_observations(runtime))
            reader.assert_not_called()
        path.unlink()
        path.write_bytes(b"private")
        path.chmod(0o644)
        with patch.object(os, "read", side_effect=AssertionError("must not read unsafe evidence")) as reader:
            self.assertIsNone(smoke._serial_observations(runtime))
            reader.assert_not_called()
        path.chmod(0o600)
        os.link(path, self.root / "runtime/alias")
        with patch.object(os, "read", side_effect=AssertionError("must not read hardlink evidence")) as reader:
            self.assertIsNone(smoke._serial_observations(runtime))
            reader.assert_not_called()
        (self.root / "runtime/alias").unlink()
        with path.open("wb") as stream:
            stream.truncate(smoke.guard.SERIAL_LIMIT + 1)
        with patch.object(os, "read", side_effect=AssertionError("must not read oversized evidence")) as reader:
            self.assertIsNone(smoke._serial_observations(runtime))
            reader.assert_not_called()

    def test_serial_empty_file_has_distinct_valid_zero_byte_observation(self):
        path = self.root / "runtime/serial.log"
        path.write_bytes(b"")
        path.chmod(0o600)
        runtime = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        self.assertEqual(smoke._serial_observations(runtime), {"boot_markers": [], "serial_bytes": 0})

    def test_serial_exact_size_limit_remains_a_bounded_valid_observation(self):
        path = self.root / "runtime/serial.log"
        with path.open("wb") as stream:
            stream.truncate(smoke.guard.SERIAL_LIMIT)
        path.chmod(0o600)
        runtime = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        self.assertEqual(smoke._serial_observations(runtime), {"boot_markers": [], "serial_bytes": smoke.guard.SERIAL_LIMIT})

    def test_serial_replacement_or_metadata_change_during_read_is_omitted(self):
        path = self.root / "runtime/serial.log"
        runtime = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        actual = os.read
        for replace in (True, False):
            path.write_bytes(b"Linux version synthetic\n")
            path.chmod(0o600)
            changed = False
            def mutate(fd, size):
                nonlocal changed
                raw = actual(fd, size)
                if raw and not changed:
                    changed = True
                    if replace:
                        replacement = path.parent / "replacement"
                        replacement.write_bytes(b"Linux version synthetic\n")
                        replacement.chmod(0o600)
                        replacement.replace(path)
                    else:
                        path.chmod(0o400)
                return raw
            with patch.object(os, "read", side_effect=mutate):
                self.assertIsNone(smoke._serial_observations(runtime))

    def test_serial_eof_metadata_time_jump_omits_observation(self):
        path = self.root / "runtime/serial.log"
        path.write_bytes(b"Linux version synthetic\n")
        path.chmod(0o600)
        runtime = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        self.addCleanup(os.close, runtime)
        clock = [0.0]
        actual = os.stat
        def delayed_metadata(*args, **kwargs):
            result = actual(*args, **kwargs)
            clock[0] = 3.0
            return result
        with patch.object(smoke.time, "monotonic", side_effect=lambda: clock[0]), \
                patch.object(os, "stat", side_effect=delayed_metadata):
            self.assertIsNone(smoke._serial_observations(runtime))

    def test_boot_cleanup_failure_keeps_origin_and_advisory_serial_fields(self):
        actual = self.dispatch
        def dispatch(args, **options):
            process = actual(args, **options)
            if process is self.guard:
                path = self.root / "runtime/serial.log"
                path.write_bytes(b"Linux version synthetic\n")
                path.chmod(0o600)
                process.wait = lambda timeout: (_ for _ in ()).throw(subprocess.TimeoutExpired("PRIVATE", timeout))
            return process
        self.ssh_transform = lambda *_args: (255, b"Permission denied (publickey).")
        with patch.object(self, "dispatch", side_effect=dispatch):
            self.assertEqual(self.run_mocked()[0], 2)
        receipt = self.failure_receipt("cleanup")
        self.assertEqual(receipt["origin_stage"], "boot_wait")
        self.assertEqual(receipt.get("boot_markers"), ["linux_kernel_started"])

    def test_bad_serial_reader_never_masks_original_failure(self):
        self.ssh_transform = lambda *_args: (255, b"Permission denied (publickey).")
        with patch.object(smoke, "_serial_observations", side_effect=OSError("PRIVATE")):
            self.assertEqual(self.run_mocked()[0], 2)
        receipt = self.failure_receipt("boot_wait")
        self.assertEqual(receipt["ssh_error"], "authentication")
        self.assertNotIn("boot_markers", receipt)
        self.assertNotIn("serial_bytes", receipt)

    def test_nonboot_failure_never_reads_or_emits_serial_observations(self):
        self.facts["mounts_allowed"] = False
        with patch.object(smoke, "_serial_observations", side_effect=AssertionError("not boot evidence")) as reader:
            self.assertEqual(self.run_mocked()[0], 2)
            reader.assert_not_called()
        receipt = self.failure_receipt("probe")
        self.assertNotIn("boot_markers", receipt)
        self.assertNotIn("serial_bytes", receipt)

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
