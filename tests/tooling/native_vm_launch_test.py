"""Real CLI/filesystem controls; QEMU itself is never launched."""

import importlib.util
import ctypes
import io
import json
import os
from pathlib import Path
import stat
import signal
import subprocess
import sys
import tempfile
import threading
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/native-vm-launch.py"
SPEC = importlib.util.spec_from_file_location("native_vm_launch", SCRIPT)
gate = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(gate)


class LaunchGate(unittest.TestCase):
    def process(self, chunks=()):
        read_fd, write_fd = os.pipe()
        reader = os.fdopen(read_fd, "rb", buffering=0)
        def write():
            try:
                for chunk in chunks:
                    view = memoryview(chunk)
                    while view:
                        view = view[os.write(write_fd, view):]
            except BrokenPipeError:
                pass
            finally:
                os.close(write_fd)
        writer = threading.Thread(target=write, daemon=True)
        writer.start()
        self.addCleanup(lambda: writer.join(timeout=2))
        self.addCleanup(reader.close)
        process = Mock(pid=12345, stdout=reader)
        process.wait.return_value = 0
        return process

    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-vm-launch-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        for name in ("guest", "auth", "runtime"):
            (self.root / name).mkdir(mode=0o700)
        self.config = {
            "version": 1,
            "guest_root": str(self.root / "guest"),
            "auth_root": str(self.root / "auth"),
            "runtime_root": str(self.root / "runtime"),
            "kernel": "vmlinuz", "initrd": "initrd.img", "disk": "guest.ext4",
            "ssh_key": "id_ed25519", "ssh_port": 2227,
        }
        for name in ("vmlinuz", "initrd.img", "guest.ext4"):
            (self.root / "guest" / name).write_bytes(b"synthetic-only")
        self.key = self.root / "auth/id_ed25519"
        self.key.write_bytes(b"SYNTHETIC_PRIVATE_CANARY")
        self.key.chmod(0o600)
        self.config_file = self.root / "config.json"
        self.save()

    def save(self):
        self.config_file.write_text(json.dumps(self.config), encoding="utf8")
        self.config_file.chmod(0o600)

    def cli(self, *args):
        return subprocess.run(["python3", "-I", "-B", str(SCRIPT), *args],
                              text=True, capture_output=True, timeout=5)

    def denied(self, args=None):
        self.save()
        result = self.cli(*(args or ["--check", str(self.config_file)]))
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "NATIVE_VM_PREFLIGHT_REFUSED\n")
        self.assertEqual(result.stderr, "")
        self.assertNotIn(self.temp.name, result.stdout)
        self.assertNotIn("SYNTHETIC_PRIVATE_CANARY", result.stdout)

    def test_valid_real_cli_preflight_does_not_launch_or_create_runtime_outputs(self):
        result = self.cli("--check", str(self.config_file))
        self.assertEqual(result.returncode, 0)
        self.assertEqual(result.stdout, "NATIVE_VM_PREFLIGHT_CHECKED\n")
        self.assertEqual(result.stderr, "")
        self.assertEqual(list((self.root / "runtime").iterdir()), [])

    def test_rejects_extra_cli_share_and_raw_qemu_arguments(self):
        for extra in ("-virtfs", "-fsdev", "--qemu-args", "-device", "--", "secret-path"):
            with self.subTest(extra=extra):
                self.denied(["--launch", str(self.config_file), extra])

    def test_rejects_unknown_and_share_schema_fields(self):
        for key in ("qemu_args", "virtfs", "fsdev", "monitor", "environment"):
            with self.subTest(key=key):
                self.config[key] = "PRIVATE_CANARY"
                self.denied()
                del self.config[key]

    def test_rejects_duplicate_and_unbounded_json_without_echoing_values(self):
        for content in ('{"version":1,"version":1}', 'x' * 8193):
            self.config_file.write_text(content)
            result = self.cli("--check", str(self.config_file))
            self.assertEqual((result.returncode, result.stdout, result.stderr),
                             (2, "NATIVE_VM_PREFLIGHT_REFUSED\n", ""))

    def test_rejects_missing_fields_and_wrong_scalar_types(self):
        for field, value in (("version", True), ("ssh_port", True), ("ssh_port", "2227"),
                             ("ssh_port", 1023), ("ssh_port", 65536), ("kernel", []),
                             ("version", 2), ("guest_root", None)):
            with self.subTest(field=field, value=value):
                old = self.config[field]
                self.config[field] = value
                self.denied()
                self.config[field] = old
        del self.config["initrd"]
        self.denied()

    def test_rejects_symlink_config_and_config_with_unsafe_mode(self):
        alias = self.root / "alias.json"
        alias.symlink_to(self.config_file)
        result = self.cli("--check", str(alias))
        self.assertEqual(result.returncode, 2)
        self.config_file.chmod(0o644)
        self.assertEqual(self.cli("--check", str(self.config_file)).returncode, 2)

    def test_rejects_root_overlap_in_both_directions(self):
        original = dict(self.config)
        for first, second in (("auth_root", "guest_root"), ("guest_root", "auth_root"),
                              ("auth_root", "runtime_root"), ("runtime_root", "guest_root")):
            with self.subTest(first=first, second=second):
                self.config = dict(original)
                self.config[first] = self.config[second]
                self.denied()
                nested = Path(self.config[second]) / "nested"
                nested.mkdir(mode=0o700, exist_ok=True)
                self.config[first] = str(nested)
                self.denied()

    def test_rejects_noncanonical_symlinked_and_option_like_roots(self):
        real = self.root / "guest"
        alias = self.root / "alias"
        alias.symlink_to(real, target_is_directory=True)
        for value in (str(alias), str(real) + "/../guest", str(real) + "/", "-virtfs", "/tmp//guest"):
            with self.subTest(value=value):
                self.config["guest_root"] = value
                self.denied()

    def test_rejects_root_permissions_and_symlinked_ancestor(self):
        for field in ("guest_root", "auth_root", "runtime_root"):
            root = Path(self.config[field])
            root.chmod(0o755)
            self.denied()
            root.chmod(0o700)
        ancestor = self.root / "ancestor"
        ancestor.symlink_to(self.root, target_is_directory=True)
        self.config["guest_root"] = str(ancestor / "guest")
        self.denied()

    def test_rejects_boot_and_key_path_escape_or_option_injection(self):
        for field in ("kernel", "initrd", "disk", "ssh_key"):
            old = self.config[field]
            for value in ("../id_ed25519", "/etc/passwd", "-fsdev", "a,b", "a\nsecret", "a/b", "x" * 129):
                with self.subTest(field=field, value=value):
                    self.config[field] = value
                    self.denied()
            self.config[field] = old

    def test_rejects_symlink_and_hardlinked_boot_inputs(self):
        kernel = self.root / "guest/vmlinuz"
        other = self.root / "guest/other"
        kernel.rename(other)
        kernel.symlink_to(other)
        self.denied()
        kernel.unlink()
        os.link(other, kernel)
        self.denied()

    def test_rejects_nonregular_and_empty_boot_inputs_without_blocking(self):
        kernel = self.root / "guest/vmlinuz"
        kernel.unlink()
        os.mkfifo(kernel)
        self.denied()
        kernel.unlink()
        kernel.mkdir()
        self.denied()
        kernel.rmdir()
        kernel.touch()
        self.denied()

    def test_rejects_private_key_outside_auth_root_and_shared_layout(self):
        self.config["ssh_key"] = str(self.key)
        self.denied()
        self.config["ssh_key"] = "id_ed25519"
        self.config["auth_root"] = self.config["guest_root"]
        self.denied()

    def test_rejects_symlink_hardlink_and_unsafe_private_key_modes(self):
        for mode in (0o644, 0o640, 0o400, 0o660):
            self.key.chmod(mode)
            self.denied()
        self.key.chmod(0o600)
        other = self.root / "auth/other"
        os.link(self.key, other)
        self.denied()
        other.unlink()
        self.key.rename(other)
        self.key.symlink_to(other)
        self.denied()

    def test_rejects_preexisting_monitor_pid_or_serial_outputs(self):
        for name in ("monitor.sock", "qemu.pid", "serial.log"):
            item = self.root / "runtime" / name
            item.symlink_to(self.key)
            self.denied()
            item.unlink()

    def test_launch_dispatch_uses_pinned_boot_inputs_fixed_resources_and_no_credentials(self):
        process = self.process()
        captured = {}

        def dispatch(argv, **options):
            captured.update(argv=argv, options=options)
            inherited = options["pass_fds"]
            contents = []
            for fd in inherited:
                node = os.fstat(fd)
                if stat.S_ISREG(node.st_mode):
                    contents.append(os.pread(fd, 100, 0))
            self.assertEqual(contents.count(b"synthetic-only"), 3)
            self.assertNotIn(b"SYNTHETIC_PRIVATE_CANARY", contents)
            self.assertTrue(options["close_fds"])
            self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"})
            self.assertEqual(options["cwd"], "/")
            self.assertEqual(options["stdout"], subprocess.PIPE)
            self.assertEqual(options["stderr"], subprocess.STDOUT)
            return process

        output = io.StringIO()
        with patch.object(subprocess, "Popen", side_effect=dispatch) as popen, redirect_stdout(output):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 0)
        popen.assert_called_once()
        argv = captured["argv"]
        self.assertEqual(argv[0], "/usr/bin/qemu-system-x86_64")
        self.assertEqual(argv[argv.index("-machine") + 1], "accel=tcg")
        self.assertEqual(argv[argv.index("-smp") + 1], "4")
        self.assertEqual(argv[argv.index("-m") + 1], "8192")
        self.assertIn("format=raw,if=virtio,cache=writeback", argv[argv.index("-drive") + 1])
        self.assertEqual(argv[argv.index("-netdev") + 1], "user,id=net0,restrict=on,hostfwd=tcp:127.0.0.1:2227-:22")
        self.assertEqual(argv[argv.index("-device") + 1], "virtio-net-pci,netdev=net0")
        self.assertEqual(argv.count("-device"), 1)
        self.assertEqual(argv[argv.index("-serial") + 1], "stdio")
        for forbidden in ("-virtfs", "-fsdev", "-chardev", "-enable-kvm"):
            self.assertNotIn(forbidden, argv)
        self.assertNotIn(str(self.key), " ".join(argv))
        self.assertNotIn(str(self.root / "guest"), " ".join(argv))
        process.wait.assert_called_once()
        self.assertGreater(process.wait.call_args.kwargs["timeout"], 1790)
        self.assertLessEqual(process.wait.call_args.kwargs["timeout"], 1800)
        self.assertEqual(output.getvalue(), "NATIVE_VM_LAUNCH_EXITED\n")
        for fd in captured["options"]["pass_fds"]:
            with self.assertRaises(OSError):
                os.fstat(fd)

    def test_timeout_terminates_kills_and_reaps_without_raw_output(self):
        process = self.process()
        process.wait.side_effect = [subprocess.TimeoutExpired("PRIVATE", 1800),
                                    subprocess.TimeoutExpired("PRIVATE", 5), 0]
        output = io.StringIO()
        with patch.object(subprocess, "Popen", return_value=process), redirect_stdout(output):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        process.terminate.assert_called_once()
        process.kill.assert_called_once()
        timeouts = [call.kwargs["timeout"] for call in process.wait.call_args_list]
        self.assertGreater(timeouts[0], 1790)
        self.assertLessEqual(timeouts[0], 1800)
        self.assertEqual(timeouts[1:], [5, 5])
        self.assertEqual(output.getvalue(), "NATIVE_VM_LAUNCH_FAILED\n")

    def test_dispatch_failure_is_sanitized_and_does_not_leak_descriptors(self):
        before = set(os.listdir("/proc/self/fd"))
        output = io.StringIO()
        with patch.object(subprocess, "Popen", side_effect=OSError("PRIVATE_PATH_AND_KEY")), redirect_stdout(output):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        self.assertEqual(output.getvalue(), "NATIVE_VM_LAUNCH_FAILED\n")
        self.assertEqual(set(os.listdir("/proc/self/fd")), before)

    def test_rejected_launch_never_reaches_dispatch(self):
        self.config["qemu_args"] = ["-virtfs", "PRIVATE"]
        self.save()
        with patch.object(subprocess, "Popen") as popen, redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        popen.assert_not_called()

    def test_interrupted_launch_reaps_owned_process(self):
        process = self.process()
        process.wait.side_effect = [KeyboardInterrupt(), 0]
        with patch.object(subprocess, "Popen", return_value=process), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        process.terminate.assert_called_once()
        process.kill.assert_not_called()
        self.assertEqual(process.wait.call_count, 2)

    def test_key_file_is_opened_but_never_read_with_positive_access_control(self):
        libc = ctypes.CDLL(None, use_errno=True)
        fd = libc.inotify_init1(os.O_NONBLOCK | os.O_CLOEXEC)
        self.assertGreaterEqual(fd, 0)
        try:
            self.assertGreaterEqual(libc.inotify_add_watch(fd, os.fsencode(self.key), 0x21), 0)
            result = self.cli("--check", str(self.config_file))
            self.assertEqual(result.returncode, 0)
            events = os.read(fd, 4096)
            masks = []
            while events:
                masks.append(int.from_bytes(events[4:8], sys.byteorder))
                size = 16 + int.from_bytes(events[12:16], sys.byteorder)
                events = events[size:]
            self.assertTrue(any(mask & 0x20 for mask in masks))  # IN_OPEN
            self.assertFalse(any(mask & 1 for mask in masks))  # IN_ACCESS
            self.key.read_bytes()  # Positive control: ordinary content read is observed.
            events = os.read(fd, 4096)
            accessed = False
            while events:
                accessed |= bool(int.from_bytes(events[4:8], sys.byteorder) & 1)
                size = 16 + int.from_bytes(events[12:16], sys.byteorder)
                events = events[size:]
            self.assertTrue(accessed)
        finally:
            os.close(fd)

    def test_refuses_key_inode_aliased_as_boot_without_mounting_anything(self):
        actual = os.fstat
        disk = os.stat(self.root / "guest/guest.ext4")
        key = os.stat(self.key)
        def alias(fd):
            node = actual(fd)
            return key if (node.st_dev, node.st_ino) == (disk.st_dev, disk.st_ino) else node
        with patch.object(os, "fstat", side_effect=alias), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--check", str(self.config_file)]), 2)

    def test_refuses_mutually_aliased_boot_inodes_without_mounting_anything(self):
        actual = os.fstat
        kernel = os.stat(self.root / "guest/vmlinuz")
        initrd = os.stat(self.root / "guest/initrd.img")
        def alias(fd):
            node = actual(fd)
            return kernel if (node.st_dev, node.st_ino) == (initrd.st_dev, initrd.st_ino) else node
        with patch.object(os, "fstat", side_effect=alias), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--check", str(self.config_file)]), 2)

    def test_signal_during_spawn_is_retained_until_child_is_owned_and_reaped(self):
        process = self.process()
        original = signal.getsignal(signal.SIGTERM)
        def dispatch(*_args, **_kwargs):
            signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        self.assertIs(signal.getsignal(signal.SIGTERM), original)

    def test_path_replacement_at_dispatch_cannot_redirect_pinned_boot_inputs(self):
        process = self.process()
        def dispatch(_argv, **options):
            kernel = self.root / "guest/vmlinuz"
            kernel.rename(self.root / "guest/old-kernel")
            kernel.symlink_to(self.key)
            boot = options["pass_fds"][:3]
            self.assertEqual([os.pread(fd, 100, 0) for fd in boot], [b"synthetic-only"] * 3)
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 0)

    def test_serial_exact_fixed_cap_is_retained_without_unbounded_buffering(self):
        process = self.process((b"x" * 65536,) * 256)
        with patch.object(subprocess, "Popen", return_value=process), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 0)
        serial = self.root / "runtime/serial.log"
        self.assertEqual(serial.stat().st_size, 16 * 1024 * 1024)
        self.assertEqual(stat.S_IMODE(serial.stat().st_mode), 0o600)
        process.terminate.assert_not_called()

    def test_serial_overflow_stops_and_reaps_without_exceeding_fixed_cap(self):
        process = self.process((b"x" * 65536,) * 256 + (b"overflow",))
        output = io.StringIO()
        with patch.object(subprocess, "Popen", return_value=process), redirect_stdout(output):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        self.assertEqual((self.root / "runtime/serial.log").stat().st_size, 16 * 1024 * 1024)
        self.assertEqual(output.getvalue(), "NATIVE_VM_LAUNCH_FAILED\n")
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        self.assertTrue(process.stdout.closed)

    def test_serial_pump_deadline_is_absolute_and_cleans_up(self):
        process = self.process((b"bounded",))
        output = io.StringIO()
        with patch.object(subprocess, "Popen", return_value=process), \
                patch("time.monotonic", side_effect=[0, 1801]), redirect_stdout(output):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        self.assertTrue(process.stdout.closed)
        self.assertEqual(output.getvalue(), "NATIVE_VM_LAUNCH_FAILED\n")

    def test_interrupted_serial_registration_closes_pipe_and_reaps_child(self):
        process = self.process()
        reader = process.stdout
        class InterruptedPipe:
            def fileno(self):
                signal.getsignal(signal.SIGTERM)(signal.SIGTERM, None)
            def close(self):
                reader.close()
        process.stdout = InterruptedPipe()
        with patch.object(subprocess, "Popen", return_value=process), redirect_stdout(io.StringIO()):
            self.assertEqual(gate.main(["--launch", str(self.config_file)]), 2)
        process.terminate.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        self.assertTrue(reader.closed)


if __name__ == "__main__":
    unittest.main()
