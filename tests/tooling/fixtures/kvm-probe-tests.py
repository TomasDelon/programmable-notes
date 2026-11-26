"""Check the hosted KVM observer without accessing a host device."""

import errno
import importlib.util
import io
import os
import stat
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, call, patch

script = Path(__file__).resolve().parents[3] / "scripts/native-kvm-probe.py"
spec = importlib.util.spec_from_file_location("native_kvm_probe", script)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class KvmProbe(unittest.TestCase):
    def setUp(self):
        import fcntl

        stack = ExitStack()
        self.addCleanup(stack.close)
        stack.enter_context(patch.dict(os.environ, {
            "GITHUB_ACTIONS": "true", "RUNNER_ENVIRONMENT": "github-hosted",
            "RUNNER_OS": "Linux", "RUNNER_ARCH": "X64",
        }, clear=True))
        stack.enter_context(patch.object(probe.sys, "platform", "linux"))
        stack.enter_context(patch.object(probe.sys, "argv", ["native-kvm-probe.py"]))
        self.ruid = stack.enter_context(patch.object(os, "getuid", return_value=1001))
        self.euid = stack.enter_context(patch.object(os, "geteuid", return_value=1001))
        self.ops = Mock()
        self.open = stack.enter_context(patch.object(os, "open", return_value=23))
        self.inspect = stack.enter_context(patch.object(os, "fstat", return_value=Mock(st_mode=stat.S_IFCHR)))
        self.ioctl = stack.enter_context(patch.object(fcntl, "ioctl", return_value=12))
        self.close = stack.enter_context(patch.object(os, "close"))
        for name in ("open", "inspect", "ioctl", "close"):
            self.ops.attach_mock(getattr(self, name), name)

    def check(self, code, line, steps):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(probe.main(), code)
        self.assertEqual(output.getvalue(), line + "\n")
        expected = {
            "open": call.open("/dev/kvm", os.O_RDWR | os.O_CLOEXEC | os.O_NOFOLLOW),
            "inspect": call.inspect(23),
            "ioctl": call.ioctl(23, 0xAE00, 0),
            "close": call.close(23),
        }
        self.assertEqual(self.ops.mock_calls, [expected[step] for step in steps.split()])

    def test_unsupported_runner(self):
        for variable, value in (("RUNNER_ENVIRONMENT", "self-hosted"), ("RUNNER_OS", "Windows"),
                                ("RUNNER_ARCH", "ARM64"), ("GITHUB_ACTIONS", "false")):
            with self.subTest(variable=variable), patch.dict(os.environ, {variable: value}):
                self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE runner-type", "")

    def test_privileged_or_changed_uid(self):
        for ruid, euid in ((0, 0), (1001, 0), (1001, 1111)):
            with self.subTest(ruid=ruid, euid=euid):
                self.ruid.return_value = ruid
                self.euid.return_value = euid
                self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE runner-user", "")

    def test_arguments_rejected(self):
        with patch.object(probe.sys, "argv", ["probe", "/untrusted/path"]):
            self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE arguments", "")

    def test_missing_or_denied(self):
        for cause, label in ((errno.ENOENT, "device-missing"), (errno.EACCES, "device-denied"),
                             (errno.EPERM, "device-denied"), (errno.ELOOP, "device-link")):
            with self.subTest(cause=cause):
                self.ops.reset_mock()
                self.open.side_effect = OSError(cause, "private failure details")
                self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE " + label, "open")

    def test_non_character_device(self):
        self.inspect.return_value = Mock(st_mode=stat.S_IFREG)
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE device-type", "open inspect close")

    def test_wrong_api(self):
        self.ioctl.return_value = 11
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE api-version", "open inspect ioctl close")

    def test_unsupported_ioctl(self):
        self.ioctl.side_effect = OSError(errno.ENOTTY, "private details")
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE ioctl-unsupported", "open inspect ioctl close")

    def test_unexpected_io_failure(self):
        for operation, calls in ((self.open, "open"), (self.inspect, "open inspect close"),
                                 (self.ioctl, "open inspect ioctl close"), (self.close, "open inspect ioctl close")):
            with self.subTest(calls=calls):
                self.ops.reset_mock()
                operation.side_effect = OSError(errno.EIO, "private details")
                self.check(3, "::error::NATIVE_KVM_API_OBSERVER_FAILED device-io", calls)
                operation.side_effect = None
        self.ops.reset_mock()
        self.ioctl.side_effect = RuntimeError("private exception details")
        self.check(3, "::error::NATIVE_KVM_API_OBSERVER_FAILED observer-runtime", "open inspect ioctl close")

    def test_version_probe_only(self):
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close")


if __name__ == "__main__":
    unittest.main()
