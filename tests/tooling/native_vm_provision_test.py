"""Fresh synthetic keys; no Docker, full configure-script execution or VM.

The public network-file fragment alone executes inside an owned temporary path.
"""

import base64
import hashlib
import importlib.util
import io
import json
import os
import shlex
import signal
from pathlib import Path
import stat
import struct
import subprocess
import tempfile
import unittest
from contextlib import redirect_stdout
from unittest.mock import Mock, patch

SCRIPT = Path(__file__).resolve().parents[2] / "scripts/native-vm-provision.py"
SPEC = importlib.util.spec_from_file_location("native_vm_provision", SCRIPT)
prepare = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(prepare)
DIGEST = "ubuntu@sha256:73b999393d07f2bf65a40373778a44dc9a6d54ad7718d29247d8ff9413c4d6a8"


def public(kind=b"ssh-ed25519", key=b"x" * 32):
    blob = struct.pack(">I", len(kind)) + kind + struct.pack(">I", len(key)) + key
    return b"ssh-ed25519 " + base64.b64encode(blob) + b" pn-native-fixture\n"


class Preparation(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory(prefix="pn-prepare-")
        self.addCleanup(self.temp.cleanup)
        self.parent = Path(self.temp.name)
        self.root = self.parent / "fresh"

    def cli(self, *args):
        return subprocess.run(["python3", "-I", "-B", str(SCRIPT), *args],
                              capture_output=True, text=True, timeout=10)

    def run_prepare(self):
        return self.cli("--prepare", str(self.root))

    def test_real_preparation_creates_only_curated_public_context_and_matching_key(self):
        result = self.run_prepare()
        self.assertEqual((result.returncode, result.stdout, result.stderr),
                         (0, "NATIVE_VM_CONTEXT_PREPARED_NOT_LAUNCHABLE\n", ""))
        self.assertEqual(sorted(p.name for p in self.root.iterdir()),
                         ["auth", "context", "guest", "preparation.json", "runtime"])
        context = self.root / "context"
        self.assertEqual(sorted(p.name for p in context.iterdir()),
                         ["Dockerfile", "configure.sh", "controller.pub"])
        manifest = json.loads((self.root / "preparation.json").read_text())
        self.assertEqual(manifest["status"], "context-prepared-not-launchable")
        self.assertEqual(manifest["base_image"], DIGEST)
        self.assertEqual(manifest["docker_executed"], False)
        for name in ("Dockerfile", "configure.sh", "controller.pub"):
            self.assertEqual(manifest["sha256"][name], hashlib.sha256((context / name).read_bytes()).hexdigest())
        private = self.root / "auth/controller_ed25519"
        actual = subprocess.run(["/usr/bin/ssh-keygen", "-y", "-P", "", "-f", str(private)],
                                capture_output=True, check=True, timeout=5)
        self.assertEqual(prepare.public_key(actual.stdout), (context / "controller.pub").read_bytes())
        for name in ("guest", "runtime"):
            self.assertEqual(list((self.root / name).iterdir()), [])
        self.assertFalse((self.root / "launch.json").exists())
        self.assertEqual(manifest["version"], 2)
        self.assertEqual(manifest["source_profile"], "ubuntu24")

    def test_debian_has_only_a_dedicated_closed_entry_and_three_public_inputs(self):
        result = self.cli("--prepare-debian13", str(self.root))
        self.assertEqual(result.returncode, 0, result.stderr)
        profile, context = prepare.prepared_profile_context(str(self.root))
        self.assertEqual(profile, "debian13")
        self.assertEqual(set(context), set(prepare.CONTEXT))
        self.assertTrue(context["Dockerfile"].startswith(("FROM " + prepare.DEBIAN_BASE + "\n").encode()))
        self.assertIn(b"linux-image-amd64", context["Dockerfile"])
        self.assertNotIn(b"linux-image-generic", context["Dockerfile"])
        self.assertNotIn(b"controller_ed25519", context["Dockerfile"])
        self.assertEqual(prepare.prepared_context(str(self.root)), context)
        manifest = json.loads((self.root / "preparation.json").read_text())
        for changes in ({"source_profile": "foreign"}, {"source_profile": "ubuntu24"}, {"base_image": prepare.BASE}, {"version": 1}, {"source_profile": None}):
            with self.subTest(changes=changes):
                broken = {**manifest, **changes}
                with self.assertRaises(prepare.Refused): prepare.validate_context(broken, context)
        (self.root / "context/Dockerfile").write_bytes(prepare._sources()["Dockerfile"])
        manifest["sha256"]["Dockerfile"] = hashlib.sha256(prepare._sources()["Dockerfile"]).hexdigest()
        (self.root / "preparation.json").write_text(json.dumps(manifest))
        with self.assertRaises(prepare.Refused): prepare.prepared_profile_context(str(self.root))

    def test_arbitrary_profile_image_path_and_context_override_options_refuse(self):
        for args in (("--prepare-profile", "debian13"), ("--prepare-debian13", "--image"), ("--prepare", str(self.root), "debian13")):
            self.assertEqual(self.cli(*args).returncode, 2)
        for value in ("../Dockerfile", "/etc", "ubuntu", "debian:13-slim", None):
            with self.assertRaises(prepare.Refused): prepare._sources(value)

    def test_fresh_runs_generate_distinct_controller_identities(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        first = (self.root / "context/controller.pub").read_bytes()
        self.root = self.parent / "second"
        self.assertEqual(self.run_prepare().returncode, 0)
        self.assertNotEqual(first, (self.root / "context/controller.pub").read_bytes())

    def test_existing_root_is_untouched_and_rerun_does_not_overwrite(self):
        self.root.mkdir(mode=0o700)
        sentinel = self.root / "sentinel"
        sentinel.write_bytes(b"keep")
        result = self.run_prepare()
        self.assertEqual(result.returncode, 2)
        self.assertEqual(result.stdout, "NATIVE_VM_PREPARE_REFUSED\n")
        self.assertEqual(list(self.root.iterdir()), [sentinel])
        self.assertEqual(sentinel.read_bytes(), b"keep")

    def test_symlink_target_and_ancestor_are_refused_without_mutation(self):
        real = self.parent / "existing"
        real.mkdir(mode=0o700)
        self.root.symlink_to(real, target_is_directory=True)
        self.assertEqual(self.run_prepare().returncode, 2)
        self.assertEqual(list(real.iterdir()), [])
        alias = self.parent / "alias"
        alias.symlink_to(real, target_is_directory=True)
        self.root = alias / "fresh"
        self.assertEqual(self.run_prepare().returncode, 2)
        self.assertEqual(list(real.iterdir()), [])

    def test_nonprivate_parent_is_refused_before_key_generation(self):
        self.parent.chmod(0o755)
        self.assertEqual(self.run_prepare().returncode, 2)
        self.assertFalse(self.root.exists())
        self.parent.chmod(0o700)

    def test_unknown_options_and_injected_paths_are_refused(self):
        for args in (("--prepare", str(self.root), "--docker-args=--privileged"),
                     ("--launch", str(self.root)), ("--prepare", "-v"),
                     ("--prepare", str(self.root) + "/../fresh"),
                     ("--prepare", str(self.root) + "/")):
            with self.subTest(args=args):
                result = self.cli(*args)
                self.assertEqual((result.returncode, result.stdout, result.stderr),
                                 (2, "NATIVE_VM_PREPARE_REFUSED\n", ""))
                self.assertFalse(self.root.exists())

    def test_all_generated_files_and_directories_are_private_single_link(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        for directory in (self.root, *(self.root / name for name in ("auth", "context", "guest", "runtime"))):
            self.assertEqual(stat.S_IMODE(directory.stat().st_mode), 0o700)
            self.assertEqual(directory.stat().st_uid, os.getuid())
        files = [self.root / "preparation.json", *(self.root / "auth").iterdir(), *(self.root / "context").iterdir()]
        for file in files:
            self.assertEqual(stat.S_IMODE(file.stat().st_mode), 0o600)
            self.assertEqual(file.stat().st_nlink, 1)

    def test_exact_ed25519_wire_parser_canonicalizes_public_material(self):
        self.assertEqual(prepare.public_key(public().rstrip(b"\n")), public())

    def test_parser_refuses_private_pem_and_openssh_input(self):
        for value in (b"-----BEGIN OPENSSH PRIVATE KEY-----\nPRIVATE\n", b"-----BEGIN RSA PRIVATE KEY-----\n"):
            with self.subTest(value=value[:20]):
                with self.assertRaises(Exception):
                    prepare.public_key(value)

    def test_parser_refuses_wrong_wire_type_length_and_trailing_binary(self):
        for value in (public(b"ssh-rsa"), public(key=b"short"),
                      b"ssh-ed25519 " + base64.b64encode(base64.b64decode(public().split()[1]) + b"extra") + b"\n"):
            with self.assertRaises(Exception):
                prepare.public_key(value)

    def test_parser_refuses_options_comments_multiline_and_unbounded_input(self):
        for value in (b'command="echo" ' + public(), public().rstrip() + b" comment\n",
                      public() + public(), b"ssh-ed25519 ?\n", b"x" * 257,
                      b" " + public(), public() + b"\n"):
            with self.assertRaises(Exception):
                prepare.public_key(value)

    def test_private_key_bytes_never_enter_curated_context(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        private = (self.root / "auth/controller_ed25519").read_bytes()
        for file in (self.root / "context").iterdir():
            self.assertFalse(private in file.read_bytes())
            self.assertFalse(b"-----BEGIN OPENSSH PRIVATE KEY-----" in file.read_bytes())

    def test_keygen_error_retains_incomplete_root_and_sanitizes_diagnostics(self):
        with patch.object(subprocess, "Popen", side_effect=OSError("SECRET_DIAGNOSTIC")), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(prepare.main(["--prepare", str(self.root)]), 2)
        self.assertEqual(output.getvalue(), "NATIVE_VM_PREPARE_FAILED_INCOMPLETE\n")
        self.assertTrue(self.root.is_dir())
        self.assertFalse((self.root / "preparation.json").exists())
        self.assertEqual(list((self.root / "context").iterdir()), [])

    def test_public_private_mismatch_refuses_context_publication(self):
        # A controlled tool receipt avoids printing/reading actual private bytes.
        with patch.object(prepare, "_derive", return_value=public()), redirect_stdout(io.StringIO()) as output:
            self.assertEqual(prepare.main(["--prepare", str(self.root)]), 2)
        self.assertEqual(output.getvalue(), "NATIVE_VM_PREPARE_FAILED_INCOMPLETE\n")
        self.assertEqual(list((self.root / "context").iterdir()), [])

    def test_only_fixed_keygen_dispatch_is_reachable_no_docker_or_mounts(self):
        actual = subprocess.Popen
        calls = []
        def dispatch(argv, **options):
            calls.append((argv, options))
            self.assertEqual(argv[0], "/usr/bin/ssh-keygen")
            self.assertEqual(options["env"], {"PATH": "/usr/bin:/bin", "LANG": "C", "LC_ALL": "C"})
            self.assertEqual(options["stdin"], subprocess.DEVNULL)
            self.assertTrue(options["close_fds"])
            return actual(argv, **options)
        with patch.object(subprocess, "Popen", side_effect=dispatch), redirect_stdout(io.StringIO()):
            self.assertEqual(prepare.main(["--prepare", str(self.root)]), 0)
        self.assertEqual(len(calls), 2)
        self.assertIn("-t", calls[0][0])
        self.assertIn("-y", calls[1][0])
        self.assertFalse(any("docker" in value or "--mount" in value for argv, _ in calls for value in argv))

    def test_recipe_pins_base_and_installs_only_fixed_public_distro_packages(self):
        recipe = (SCRIPT.parent / "native-guest/Dockerfile").read_text()
        self.assertIn("FROM " + DIGEST, recipe)
        for package in ("systemd", "openssh-server", "linux-image-generic", "initramfs-tools", "libwebkit2gtk-4.1-0", "xvfb", "openbox", "python3-pyatspi", "bubblewrap", "xdg-dbus-proxy"):
            self.assertIn(package, recipe)
        self.assertNotIn("COPY .", recipe)
        self.assertNotIn("ADD ", recipe)
        self.assertNotIn("RUN /opt/native-fixture/configure.sh", recipe)

    def test_server_keys_only_generated_in_uncached_configuration(self):
        recipe = (SCRIPT.parent / "native-guest/Dockerfile").read_text()
        configure = (SCRIPT.parent / "native-guest/configure.sh").read_text()
        self.assertNotIn("ssh-keygen", recipe)
        self.assertIn("ssh-keygen -q -t ed25519", configure)
        self.assertIn("PermitRootLogin no", configure)
        self.assertIn("PasswordAuthentication no", configure)
        self.assertIn("AllowAgentForwarding no", configure)
        self.assertIn("controller.pub", configure)
        self.assertNotIn("controller_ed25519", configure)

    def test_configure_has_valid_shell_syntax_without_execution(self):
        result = subprocess.run(["/bin/bash", "-n", str(SCRIPT.parent / "native-guest/configure.sh")],
                                capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)

    def test_public_network_fragment_is_readable_under_private_umask_without_exposing_auth(self):
        configure = (SCRIPT.parent / "native-guest/configure.sh").read_text()
        guest_path = "/etc/systemd/network/10-native-fixture.network"
        start = configure.index("cat > " + guest_path + " <<'CONF'\n")
        end = configure.index("cat > /etc/systemd/system/user@.service.d/", start)
        fragment = configure[start:end]
        directory = self.parent / "network-fragment"
        directory.mkdir(mode=0o700)
        network = directory / "10-native-fixture.network"
        public_key_file = directory / "controller.pub"
        public_key_file.write_bytes(public())
        authorization = directory / "authorized_keys"
        auth_line = next(line for line in configure.splitlines()
                         if line.startswith("install -m ") and line.endswith("/home/fixture/.ssh/authorized_keys"))
        auth_args = shlex.split(auth_line)
        # Exercise the versioned auth mode too, without guest-only user/group changes.
        subprocess.run(["/usr/bin/install", "-m", auth_args[auth_args.index("-m") + 1],
                        str(public_key_file), str(authorization)], check=True, timeout=5)
        self.assertEqual(stat.S_IMODE(authorization.stat().st_mode), 0o600)
        result = subprocess.run(["/bin/bash", "-eu", "-c",
                                 "umask 077\n" + fragment.replace(guest_path, shlex.quote(str(network)))],
                                cwd=directory, capture_output=True, timeout=5)
        self.assertEqual(result.returncode, 0)
        self.assertEqual(network.read_bytes(), b"[Match]\nName=en* eth*\n[Network]\nDHCP=yes\n")
        self.assertEqual(stat.S_IMODE(network.stat().st_mode), 0o644)
        self.assertEqual(stat.S_IMODE(authorization.stat().st_mode), 0o600)
        self.assertEqual(authorization.read_bytes(), public_key_file.read_bytes())

    def test_prepared_context_returns_only_immutable_public_snapshots(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        context = prepare.prepared_context(str(self.root))
        self.assertEqual(set(context), {"Dockerfile", "configure.sh", "controller.pub"})
        with self.assertRaises(TypeError):
            context["extra"] = b"no"
        old = context["controller.pub"]
        (self.root / "context/controller.pub").write_bytes(public())
        self.assertEqual(context["controller.pub"], old)

    def test_prepared_context_refuses_changed_recipe_even_with_matching_new_hash(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        path = self.root / "context/configure.sh"
        changed = path.read_bytes() + b"\n# changed\n"
        path.write_bytes(changed)
        manifest = self.root / "preparation.json"
        content = json.loads(manifest.read_text())
        content["sha256"]["configure.sh"] = hashlib.sha256(changed).hexdigest()
        manifest.write_text(json.dumps(content))
        with self.assertRaises(Exception):
            prepare.prepared_context(str(self.root))

    def test_prepared_context_refuses_extra_files_and_populated_output_roots(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        for directory in ("context", "guest", "runtime"):
            extra = self.root / directory / "extra"
            extra.write_bytes(b"not-admitted")
            with self.assertRaises(Exception):
                prepare.prepared_context(str(self.root))
            extra.unlink()
        (self.root / "context/controller.pub").write_bytes(public())
        with self.assertRaises(Exception):
            prepare.prepared_context(str(self.root))

    def test_prepared_context_revalidates_root_permissions_and_symlinks(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        (self.root / "auth").chmod(0o755)
        with self.assertRaises(Exception):
            prepare.prepared_context(str(self.root))
        (self.root / "auth").chmod(0o700)
        path = self.root / "context/controller.pub"
        path.unlink()
        path.symlink_to(self.root / "auth/controller_ed25519.pub")
        with self.assertRaises(Exception):
            prepare.prepared_context(str(self.root))

    def test_private_material_is_never_read_by_python_context_reader(self):
        self.assertEqual(self.run_prepare().returncode, 0)
        private = (self.root / "auth/controller_ed25519").stat()
        actual = os.read
        def read(fd, amount):
            node = os.fstat(fd)
            self.assertFalse((node.st_dev, node.st_ino) == (private.st_dev, private.st_ino))
            return actual(fd, amount)
        with patch.object(os, "read", side_effect=read):
            self.assertEqual(set(prepare.prepared_context(str(self.root))), {"Dockerfile", "configure.sh", "controller.pub"})

    def test_keygen_spawn_signal_waits_for_owned_handle_then_reaps(self):
        process = Mock(stdout=None)
        process.wait.return_value = 0
        original = signal.getsignal(signal.SIGTERM)
        def dispatch(*_args, **_options):
            handler = signal.getsignal(signal.SIGTERM)
            self.assertTrue(callable(handler))
            handler(signal.SIGTERM, None)
            return process
        with patch.object(subprocess, "Popen", side_effect=dispatch):
            with self.assertRaises(KeyboardInterrupt):
                prepare._tool(["-q"], ())
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)
        self.assertIs(signal.getsignal(signal.SIGTERM), original)

    def test_keygen_deadline_starts_before_process_creation(self):
        process = Mock(stdout=None)
        process.wait.return_value = 0
        with patch("time.monotonic", return_value=0) as clock:
            def dispatch(*_args, **_options):
                clock.assert_called_once()
                return process
            with patch.object(subprocess, "Popen", side_effect=dispatch):
                self.assertEqual(prepare._tool(["-q"], ()), b"")

    def test_keygen_deadline_failure_kills_and_reaps_owned_child(self):
        process = Mock(stdout=None)
        process.wait.return_value = 0
        with patch.object(subprocess, "Popen", return_value=process), patch("time.monotonic", side_effect=[0, 11]):
            with self.assertRaises(Exception):
                prepare._tool(["-q"], ())
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)

    def test_keygen_derived_output_is_bounded_and_cleanup_closes_pipe(self):
        read_fd, write_fd = os.pipe()
        reader = os.fdopen(read_fd, "rb", buffering=0)
        self.addCleanup(reader.close)
        os.write(write_fd, b"x" * 257)
        os.close(write_fd)
        process = Mock(stdout=reader)
        process.wait.return_value = 0
        with patch.object(subprocess, "Popen", return_value=process):
            with self.assertRaises(Exception):
                prepare._tool(["-y"], (), 256)
        self.assertTrue(reader.closed)
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)

    def test_keygen_interrupted_wait_reaps_and_restores_handlers(self):
        process = Mock(stdout=None)
        process.wait.side_effect = [KeyboardInterrupt(), 0]
        original = signal.getsignal(signal.SIGINT)
        with patch.object(subprocess, "Popen", return_value=process):
            with self.assertRaises(KeyboardInterrupt):
                prepare._tool(["-q"], ())
        process.kill.assert_called_once()
        self.assertEqual(process.wait.call_count, 2)
        self.assertIs(signal.getsignal(signal.SIGINT), original)

    def test_keygen_interrupted_pipe_registration_closes_and_reaps(self):
        reader = Mock()
        def interrupt():
            signal.getsignal(signal.SIGINT)(signal.SIGINT, None)
        reader.fileno.side_effect = interrupt
        process = Mock(stdout=reader)
        process.wait.return_value = 0
        with patch.object(subprocess, "Popen", return_value=process):
            with self.assertRaises(KeyboardInterrupt):
                prepare._tool(["-y"], (), 256)
        reader.close.assert_called_once()
        process.kill.assert_called_once()
        process.wait.assert_called_once_with(timeout=5)


if __name__ == "__main__":
    unittest.main()
