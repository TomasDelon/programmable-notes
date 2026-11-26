"""Real filesystem/pipe witnesses, simulated Docker only; never a guest boot."""

from contextlib import contextmanager, redirect_stdout
import base64
import hashlib
import importlib.util
import io
import json
import os
from pathlib import Path
import signal
import struct
import subprocess
import sys
import tarfile
import tempfile
import time
import unittest
from unittest.mock import patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/native-vm-pack.py"
SPEC = importlib.util.spec_from_file_location("native_vm_pack", SCRIPT)
pack = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(pack)
PUBLIC = b"ssh-ed25519 " + base64.b64encode(struct.pack(">I", 11) + b"ssh-ed25519" + struct.pack(">I", 32) + b"x" * 32) + b" pn-native-guest\n"
SMALL = {**pack.ARTIFACTS, "root.ext4": 8192}


def archive(entries=None):
    return pack._tar(entries or {"vmlinuz": b"kernel", "initrd.img": b"initrd",
                                "root.ext4": b"\0" * 8192, "ssh_host_ed25519_key.pub": PUBLIC})


class FakeDocker:
    """Records only public arguments; never stores or displays inherited env."""
    image = "pn-native-pack:synthetic"
    label = "pn.native-pack=synthetic"
    image_requested = False

    def __init__(self, fail=None, output=None):
        self.calls, self.cleaned = [], False
        self.fail, self.output = fail, output
        self.env = {}

    def run(self, args, **kwargs):
        self.calls.append((args, kwargs))
        if self.fail == args[0]:
            raise pack.Refused()
        return b""

    def create(self, *args):
        self.calls.append((["create", *args], {}))
        return str(len(self.calls)) * 64

    def export_into(self, builder, packer):
        self.calls.append((["export_into", builder, packer], {}))
        if self.fail == "export":
            raise pack.Refused()

    @contextmanager
    def stream(self, args, **kwargs):
        self.calls.append((args, kwargs))
        yield io.BytesIO(archive() if self.output is None else self.output)

    def cleanup(self):
        self.cleaned = True
        if self.fail == "cleanup":
            raise pack.Refused()


class Packing(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-pack-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name) / "prepared"
        with redirect_stdout(io.StringIO()):
            result = pack.preparation.main(["--prepare", str(self.root)])
        self.assertEqual(result, 0)
        self.addCleanup(patch.stopall)
        patch.object(pack, "DISK_SIZE", 8192).start()
        patch.object(pack, "ARTIFACTS", SMALL).start()

    def execute(self, docker):
        pack.pack(str(self.root), docker)

    def test_complete_mocked_pipeline_curates_context_pins_identity_and_guard_config(self):
        docker = FakeDocker()
        self.execute(docker)
        self.assertTrue(docker.cleaned)
        args, options = docker.calls[0]
        self.assertEqual(args, ["build", "--force-rm", "--label", docker.label, "--tag", docker.image, "-"])
        with tarfile.open(fileobj=io.BytesIO(options["data"])) as context:
            self.assertEqual(set(context.getnames()), {"Dockerfile", "configure.sh", "controller.pub"})
            for entry in context:
                self.assertEqual(context.extractfile(entry).read(), (self.root / "context" / entry.name).read_bytes())
        self.assertNotIn(b"PRIVATE KEY", options["data"])
        self.assertNotIn(b"client-state", options["data"])
        self.assertEqual(docker.env, {"BUILDX_CONFIG": str(self.root / "client-state")})
        self.assertEqual((self.root / "client-state").stat().st_mode & 0o777, 0o700)
        self.assertEqual(set(p.name for p in (self.root / "guest").iterdir()), set(SMALL))
        config = json.loads((self.root / "launch.json").read_text())
        self.assertEqual(config["ssh_key"], "controller_ed25519")
        self.assertEqual(config["ssh_port"], 2227)
        self.assertEqual(list((self.root / "runtime").iterdir()), [])
        self.assertEqual((self.root / "auth/known_hosts").read_bytes(), pack._public(PUBLIC))
        with redirect_stdout(io.StringIO()):
            self.assertEqual(pack.guard.main(["--check", str(self.root / "launch.json")]), 0)
        for path in (self.root / "launch.json", self.root / "auth/known_hosts", *(self.root / "guest").iterdir()):
            self.assertEqual(path.stat().st_mode & 0o777, 0o600)

    def test_preparation_contamination_refused_before_docker(self):
        (self.root / "context/extra").write_bytes(b"no")
        docker = FakeDocker()
        with self.assertRaises(Exception):
            self.execute(docker)
        self.assertEqual(docker.calls, [])
        self.assertFalse(docker.cleaned)

    def test_preexisting_client_state_refused_without_mutation_or_docker(self):
        state = self.root / "client-state"
        state.mkdir(mode=0o700)
        sentinel = state / "keep"
        sentinel.write_bytes(b"keep")
        docker = FakeDocker()
        with self.assertRaises(Exception):
            self.execute(docker)
        self.assertEqual(sentinel.read_bytes(), b"keep")
        self.assertEqual(docker.calls, [])
        self.assertEqual(docker.env, {})

    def test_dirty_guest_or_runtime_refused_without_docker(self):
        for directory in ("guest", "runtime"):
            extra = self.root / directory / "old"
            extra.write_bytes(b"keep")
            docker = FakeDocker()
            with self.assertRaises(Exception):
                self.execute(docker)
            self.assertEqual(docker.calls, [])
            self.assertEqual(extra.read_bytes(), b"keep")
            extra.unlink()

    def test_context_symlink_and_private_key_alias_refused(self):
        target = self.root / "context/controller.pub"
        target.unlink()
        target.symlink_to(self.root / "auth/controller_ed25519")
        with self.assertRaises(Exception):
            self.execute(FakeDocker())

    def test_pack_source_symlink_oversize_or_writable_refused_before_docker(self):
        source = Path(self.temp.name) / "native-guest"
        source.mkdir()
        script = source / "pack.sh"
        for variant in ("symlink", "large", "writable"):
            if variant == "symlink":
                script.symlink_to(self.root / "auth/controller_ed25519")
            else:
                script.write_bytes(b"x" * (16385 if variant == "large" else 8))
                script.chmod(0o666 if variant == "writable" else 0o600)
            docker = FakeDocker()
            with patch.object(pack, "__file__", str(Path(self.temp.name) / "native-vm-pack.py")):
                with self.assertRaises(Exception):
                    self.execute(docker)
            self.assertEqual(docker.calls, [])
            script.unlink()

    def test_bounded_pax_timestamp_accepted_but_size_bomb_refused_before_body_read(self):
        buffer = io.BytesIO()
        with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as tar:
            for name, raw in {"vmlinuz": b"kernel", "initrd.img": b"initrd",
                              "root.ext4": b"\0" * 8192, "ssh_host_ed25519_key.pub": PUBLIC}.items():
                entry = tarfile.TarInfo(name)
                entry.size = len(raw)
                entry.pax_headers = {"mtime": "1234.123"}
                tar.addfile(entry, io.BytesIO(raw))
        self.execute(FakeDocker(output=buffer.getvalue()))
        for kind in (tarfile.XHDTYPE, tarfile.GNUTYPE_LONGNAME, tarfile.GNUTYPE_LONGLINK):
            header = tarfile.TarInfo("metadata")
            header.type, header.size = kind, 2 ** 30
            raw = header.tobuf(format=tarfile.USTAR_FORMAT)
            source = io.BytesIO(raw)
            fd = os.open(self.root / "guest", os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaises(pack.Refused):
                    pack._extract(source, fd)
                self.assertEqual(source.tell(), 512)
            finally:
                os.close(fd)

    def test_all_lifecycle_failures_cleanup_and_never_publish_launch(self):
        for failure in ("build", "start", "cp", "export", "cleanup"):
            with self.subTest(failure=failure):
                docker = FakeDocker(failure)
                with self.assertRaises(pack.Refused):
                    self.execute(docker)
                self.assertTrue(docker.cleaned)
                self.assertFalse((self.root / "launch.json").exists())
                self.assertFalse((self.root / "auth/known_hosts").exists())
                for path in (self.root / "guest").iterdir():
                    path.unlink()
                self.assertTrue((self.root / "client-state").is_dir())
                (self.root / "client-state").rmdir()

    def test_unexpected_artifact_refused_without_launch(self):
        docker = FakeDocker(output=archive({"unexpected": b"no"}))
        with self.assertRaises(pack.Refused):
            self.execute(docker)
        self.assertTrue(docker.cleaned)
        self.assertFalse((self.root / "launch.json").exists())

    def test_sparse_disk_preserves_leading_middle_trailing_zeros_hash_and_logical_size(self):
        # TAR carries dense zero bytes; extraction reconstructs holes ONLY for
        # root.ext4. Real host files/stat allocation, not a mocked seek witness.
        zero = b"\0" * 65536
        disk = zero * 4 + b"A" * 65536 + zero * 16 + b"B" * 65536 + zero * 4 + b"\0" * 17
        dense = zero * 4
        entries = {"vmlinuz": dense, "initrd.img": b"initrd", "root.ext4": disk,
                   "ssh_host_ed25519_key.pub": PUBLIC}
        limits = {**SMALL, "root.ext4": len(disk)}
        with patch.object(pack, "DISK_SIZE", len(disk)), patch.object(pack, "ARTIFACTS", limits):
            self.execute(FakeDocker(output=archive(entries)))
        result = self.root / "guest/root.ext4"
        self.assertEqual(result.stat().st_size, len(disk))
        self.assertEqual(result.read_bytes(), disk)
        self.assertEqual(hashlib.sha256(result.read_bytes()).digest(), hashlib.sha256(disk).digest())
        self.assertLess(result.stat().st_blocks * 512, len(disk) // 2)
        ordinary = self.root / "guest/vmlinuz"
        self.assertEqual(ordinary.read_bytes(), dense)
        self.assertGreaterEqual(ordinary.stat().st_blocks * 512, len(dense))

    def test_public_server_key_is_strict_wire_form(self):
        for raw in (b"PRIVATE KEY", PUBLIC + b"extra", PUBLIC.replace(b"pn-native-guest", b"other"),
                    PUBLIC.replace(b"ssh-ed25519 ", b"ssh-rsa "), b"ssh-ed25519 !!! pn-native-guest\n"):
            with self.subTest(raw_type=len(raw)):
                with self.assertRaises(Exception):
                    pack._public(raw)

    def test_artifact_traversal_duplicate_link_directory_and_size_are_refused(self):
        for variant in ("../outside", "/outside", "duplicate", "symlink", "hardlink", "directory", "large", "pax"):
            buffer = io.BytesIO()
            with tarfile.open(fileobj=buffer, mode="w", format=tarfile.PAX_FORMAT) as tar:
                entry = tarfile.TarInfo("vmlinuz")
                entry.size = 1
                if variant in ("../outside", "/outside"):
                    entry.name = variant
                if variant == "symlink":
                    entry.type, entry.linkname, entry.size = tarfile.SYMTYPE, "../outside", 0
                if variant == "hardlink":
                    entry.type, entry.linkname, entry.size = tarfile.LNKTYPE, "../outside", 0
                if variant == "directory":
                    entry.type, entry.size = tarfile.DIRTYPE, 0
                if variant == "large":
                    entry.name, entry.size = "ssh_host_ed25519_key.pub", 257
                if variant == "pax":
                    entry.pax_headers = {"path": "../outside"}
                tar.addfile(entry, io.BytesIO(b"x" * entry.size))
                if variant == "duplicate":
                    tar.addfile(entry, io.BytesIO(b"x"))
            guest = self.root / "guest"
            fd = os.open(guest, os.O_RDONLY | os.O_DIRECTORY)
            try:
                with self.assertRaises(pack.Refused):
                    pack._extract(io.BytesIO(buffer.getvalue()), fd)
            finally:
                os.close(fd)
                for path in guest.iterdir():
                    path.unlink()
            self.assertFalse((self.root / "outside").exists())

    def test_cli_refuses_arbitrary_options_and_sanitizes_errors(self):
        for args in ([], ["--pack", "relative"], ["--pack", str(self.root), "--mount"], ["--launch", str(self.root)]):
            output = io.StringIO()
            with redirect_stdout(output):
                self.assertEqual(pack.main(args), 2)
            self.assertEqual(output.getvalue(), "NATIVE_VM_PACK_REFUSED\n")


class DockerControl(unittest.TestCase):
    def setUp(self):
        with patch.dict(os.environ, {"PATH": "/usr/bin:/bin", "DOCKER_HOST": "remote",
                                    "DOCKER_CONTEXT": "other", "DOCKER_CONFIG": "/synthetic/config",
                                    "HOME": "/synthetic/home", "HTTPS_PROXY": "https://synthetic.invalid",
                                    "SSL_CERT_FILE": "/synthetic/ca.pem", "BUILDX_CONFIG": "/untrusted/inherited"}, clear=True), \
                patch.object(pack, "_docker_client", return_value="/usr/bin/docker"):
            self.docker = pack.Docker()

    def test_fixed_socket_clean_selectors_preserved_client_config_no_container_env(self):
        with patch.object(pack.subprocess, "Popen", return_value=object()) as start:
            self.docker.spawn(["info"])
        args, options = start.call_args
        self.assertEqual(args[0], [self.docker.client, "--host=unix:///var/run/docker.sock", "info"])
        self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C",
                                          "DOCKER_CONFIG": "/synthetic/config", "HOME": "/synthetic/home",
                                          "HTTPS_PROXY": "https://synthetic.invalid", "SSL_CERT_FILE": "/synthetic/ca.pem"})
        self.assertTrue(options["close_fds"])
        self.assertEqual(options["cwd"], "/")

    def test_create_records_exact_unique_name_before_ack_and_no_mounts_or_network(self):
        with patch.object(self.docker, "run", return_value=b"a" * 64 + b"\n") as run:
            self.assertEqual(self.docker.create("/native-pack.sh"), "a" * 64)
        command = run.call_args.args[0]
        self.assertEqual(command[0], "create")
        self.assertIn(self.docker.containers[0], command)
        self.assertEqual(command[command.index("--network") + 1], "none")
        self.assertNotIn("--mount", command)
        self.assertNotIn("--privileged", command)
        self.assertIn("--interactive", command)
        for key in pack.PROXIES:
            self.assertIn(key + "=", command)

    def test_lost_create_ack_keeps_name_for_cleanup(self):
        with patch.object(self.docker, "run", side_effect=pack.Refused):
            with self.assertRaises(pack.Refused):
                self.docker.create("/native-pack.sh")
        self.assertEqual(len(self.docker.containers), 1)

    def test_cleanup_label_mismatch_never_deletes_foreign_resources(self):
        self.docker.containers = ["owned-name"]
        self.docker.image_requested = True
        calls = []
        def run(args, **_kwargs):
            calls.append(args)
            return b"foreign\n"
        with patch.object(self.docker, "run", side_effect=run):
            with self.assertRaises(pack.Refused):
                self.docker.cleanup()
        self.assertTrue(all("inspect" in command for command in calls))

    def test_cleanup_continues_after_one_failure_and_removes_only_recorded_names(self):
        self.docker.containers = ["first", "second"]
        self.docker.image_requested = True
        calls = []
        def run(args, **_kwargs):
            calls.append(args)
            if args[:2] == ["rm", "--force"] and args[-1] == "b" * 64:
                raise pack.Refused()
            identifier = "b" * 64 if args[-1] == "second" else "a" * 64
            if args[0] == "image":
                identifier = "sha256:" + "c" * 64
            return (identifier + " " + self.docker.token + "\n").encode()
        with patch.object(self.docker, "run", side_effect=run):
            with self.assertRaises(pack.Refused):
                self.docker.cleanup()
        self.assertIn(["rm", "--force", "a" * 64], calls)
        self.assertIn(["image", "rm", "sha256:" + "c" * 64], calls)
        self.assertTrue(all("prune" not in command for command in calls))

    def process(self, source, **kwargs):
        return subprocess.Popen([sys.executable, "-I", "-c", source], start_new_session=True, **kwargs)

    def test_real_pipe_command_output_and_stderr_are_bounded(self):
        with patch.object(self.docker, "spawn", side_effect=lambda _args, **kwargs: self.process(
                "import sys;sys.stdout.buffer.write(b'fixed');sys.stderr.write('bounded')", **kwargs)):
            self.assertEqual(self.docker.run(["synthetic"]), b"fixed")
        with patch.object(self.docker, "spawn", side_effect=lambda _args, **kwargs: self.process(
                "import sys;sys.stdout.buffer.write(b'x'*65536)", **kwargs)):
            with self.assertRaises(pack.Refused):
                self.docker.run(["synthetic"], limit=10)

    def test_real_pipe_stderr_overflow_nonzero_and_deadline_refuse(self):
        for source, timeout in (("import sys;sys.stderr.write('x'*65536)", 2),
                                ("raise SystemExit(3)", 2), ("import time;time.sleep(5)", 0.05)):
            with self.subTest(source_type=len(source)), patch.object(pack, "LOG_LIMIT", 32):
                with patch.object(self.docker, "spawn", side_effect=lambda _args, **kwargs: self.process(source, **kwargs)):
                    with self.assertRaises(pack.Refused):
                        self.docker.run(["synthetic"], timeout=timeout)

    def test_real_pipe_input_tar_not_directory_or_private_data(self):
        data = pack._tar({"controller.pub": b"public"})
        with patch.object(self.docker, "spawn", side_effect=lambda _args, **kwargs: self.process(
                "import sys;sys.stdout.buffer.write(sys.stdin.buffer.read())", **kwargs)):
            self.assertEqual(self.docker.run(["synthetic"], data=data), data)

    def test_real_export_relay_backpressure_and_stream_bound(self):
        def spawn(args, **kwargs):
            if args[0] == "export":
                source = "import sys;sys.stdout.buffer.write(b'x'*262144)"
            else:
                source = "import sys;assert len(sys.stdin.buffer.read())==262144"
            return self.process(source, **kwargs)
        with patch.object(self.docker, "spawn", side_effect=spawn):
            self.docker.export_into("builder", "packer")
        with patch.object(self.docker, "spawn", side_effect=spawn), patch.object(pack, "EXPORT_LIMIT", 32):
            with self.assertRaises(pack.Refused):
                self.docker.export_into("builder", "packer")

    def test_real_relay_consumer_failure_stops_producer(self):
        processes = []
        def spawn(args, **kwargs):
            source = "import time;time.sleep(5)" if args[0] == "export" else "raise SystemExit(7)"
            process = self.process(source, **kwargs)
            processes.append(process)
            return process
        # Failure must be detected without waiting for an unproductive producer.
        with patch.object(self.docker, "spawn", side_effect=spawn):
            started = time.monotonic()
            with self.assertRaises(pack.Refused):
                self.docker.export_into("builder", "packer")
            self.assertLess(time.monotonic() - started, 3)
        # A second-spawn failure is another important owned-process race.
        def fail_second(args, **kwargs):
            if args[0] != "export":
                raise OSError("synthetic")
            process = self.process("import time;time.sleep(5)", **kwargs)
            processes.append(process)
            return process
        with patch.object(self.docker, "spawn", side_effect=fail_second):
            with self.assertRaises(OSError):
                self.docker.export_into("builder", "packer")
        self.assertTrue(all(process.poll() is not None for process in processes))

    def test_signal_during_spawn_is_deferred_until_owned_process_can_be_reaped(self):
        processes = []
        original = signal.getsignal(signal.SIGTERM)
        def spawn(_args, **kwargs):
            process = self.process("import time;time.sleep(5)", **kwargs)
            processes.append(process)
            os.kill(os.getpid(), signal.SIGTERM)
            return process
        with patch.object(self.docker, "spawn", side_effect=spawn):
            with self.assertRaises(pack.Refused):
                self.docker.run(["synthetic"])
        self.assertEqual(signal.getsignal(signal.SIGTERM), original)
        self.assertTrue(all(process.poll() is not None for process in processes))

    def test_spawn_elapsed_time_consumes_command_deadline(self):
        processes = []
        def spawn(_args, **kwargs):
            process = self.process("import time;time.sleep(5)", **kwargs)
            processes.append(process)
            time.sleep(0.02)
            return process
        with patch.object(self.docker, "spawn", side_effect=spawn):
            with self.assertRaises(pack.Refused):
                self.docker.run(["synthetic"], timeout=0.005)
        self.assertTrue(all(process.poll() is not None for process in processes))

    def test_repeated_signal_during_cleanup_spawn_does_not_interrupt_owned_removal(self):
        processes, calls = [], []
        self.docker.containers = ["task"]
        token = ("a" * 64 + " " + self.docker.token + "\n").encode()
        def spawn(args, **kwargs):
            calls.append(args)
            raw = token if "inspect" in args else b""
            process = self.process("import sys;sys.stdout.buffer.write(" + repr(raw) + ")", **kwargs)
            processes.append(process)
            os.kill(os.getpid(), signal.SIGTERM)
            os.kill(os.getpid(), signal.SIGINT)
            return process
        with patch.object(self.docker, "spawn", side_effect=spawn):
            self.docker.cleanup()
        self.assertIn(["rm", "--force", "a" * 64], calls)
        self.assertTrue(all(process.poll() is not None for process in processes))


class DockerClientSelection(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-client-test-")
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        self.first, self.second = self.root / "managed", self.root / "system"
        self.second.write_bytes(b"synthetic-executable-never-run")
        self.second.chmod(0o755)
        self.candidates = patch.object(pack, "DOCKER_CLIENTS", (str(self.first), str(self.second)))
        self.candidates.start()
        self.addCleanup(self.candidates.stop)

    def test_fixed_order_falls_back_only_for_absence(self):
        self.assertEqual(pack._docker_client(), str(self.second))
        self.first.write_bytes(b"managed-never-run")
        self.first.chmod(0o700)
        self.assertEqual(pack._docker_client(), str(self.first))

    def test_unsafe_first_candidate_never_falls_through_to_safe_second(self):
        for variant in ("symlink", "writable", "nonexecutable", "empty", "hardlink", "fifo", "directory"):
            with self.subTest(variant=variant):
                if variant == "symlink":
                    self.first.symlink_to(self.second)
                elif variant == "hardlink":
                    os.link(self.second, self.first)
                elif variant == "fifo":
                    os.mkfifo(self.first, 0o700)
                elif variant == "directory":
                    self.first.mkdir(mode=0o700)
                else:
                    self.first.write_bytes(b"" if variant == "empty" else b"never-run")
                    self.first.chmod(0o777 if variant == "writable" else 0o600 if variant == "nonexecutable" else 0o700)
                with self.assertRaises(Exception):
                    pack._docker_client()
                if self.first.is_dir():
                    self.first.rmdir()
                else:
                    self.first.unlink()

    def test_symlink_ancestor_and_missing_clients_refuse(self):
        directory = self.root / "actual"
        directory.mkdir()
        candidate = directory / "docker"
        candidate.write_bytes(b"never-run")
        candidate.chmod(0o700)
        alias = self.root / "alias"
        alias.symlink_to(directory, target_is_directory=True)
        with patch.object(pack, "DOCKER_CLIENTS", (str(alias / "docker"), str(self.second))):
            with self.assertRaises(Exception):
                pack._docker_client()
        self.second.unlink()
        with self.assertRaises(pack.Refused):
            pack._docker_client()

    def test_environment_cannot_select_client_and_selection_never_executes(self):
        with patch.dict(os.environ, {"PATH": str(self.root), "DOCKER_HOST": "malicious",
                                    "DOCKER_EXECUTABLE": str(self.first)}, clear=True), \
                patch.object(pack.subprocess, "Popen", side_effect=AssertionError("selection must not execute")):
            self.assertEqual(pack._docker_client(), str(self.second))

    def test_current_host_fixed_candidate_selection_without_running_docker(self):
        self.candidates.stop()
        if not any(Path(path).exists() for path in pack.DOCKER_CLIENTS):
            self.skipTest("no fixed Docker client installed on this host")
        with patch.object(pack.subprocess, "Popen", side_effect=AssertionError("selection must not execute")):
            selected = pack._docker_client()
        self.assertIn(selected, pack.DOCKER_CLIENTS)
        self.assertTrue(Path(selected).is_file())


if __name__ == "__main__":
    unittest.main()
