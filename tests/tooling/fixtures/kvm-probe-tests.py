"""Check the hosted KVM observer without accessing a host device."""

import errno
import grp
import importlib.util
import io
import os
import stat
import unittest
from contextlib import ExitStack, redirect_stdout
from pathlib import Path
from unittest.mock import Mock, call, mock_open, patch

script = Path(__file__).resolve().parents[3] / "scripts/native-kvm-probe.py"
spec = importlib.util.spec_from_file_location("native_kvm_probe", script)
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)


class KvmProbe(unittest.TestCase):
    stock = {
        "character": "yes", "symlink": "no", "root_owned": "yes", "group_exists": "yes",
        "group_matches": "yes", "mode_0660": "yes", "sysfs_matches": "yes",
        "acl_absent": "yes", "caller_member": "no",
    }

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
        self.node = Mock(st_mode=stat.S_IFCHR | 0o660, st_uid=0, st_gid=555, st_rdev=os.makedev(10, 232))
        self.lstat = stack.enter_context(patch.object(os, "lstat", return_value=self.node))
        self.group = stack.enter_context(patch.object(grp, "getgrnam", return_value=Mock(gr_gid=555)))
        self.egid = stack.enter_context(patch.object(os, "getegid", return_value=1001))
        self.groups = stack.enter_context(patch.object(os, "getgroups", return_value=[2002]))
        self.sysfs = stack.enter_context(patch("builtins.open", mock_open(read_data="10:232\n")))
        self.acl = stack.enter_context(patch.object(
            os, "getxattr", side_effect=OSError(errno.ENODATA, "private ACL diagnostic")))
        self.ops = Mock()
        self.open = stack.enter_context(patch.object(os, "open", return_value=23))
        self.inspect = stack.enter_context(patch.object(os, "fstat", return_value=Mock(st_mode=stat.S_IFCHR)))
        self.ioctl = stack.enter_context(patch.object(fcntl, "ioctl", return_value=12))
        self.close = stack.enter_context(patch.object(os, "close"))
        for name in ("open", "inspect", "ioctl", "close"):
            self.ops.attach_mock(getattr(self, name), name)

    def check(self, code, line, steps, metadata=None):
        output = io.StringIO()
        with redirect_stdout(output):
            self.assertEqual(probe.main(), code)
        expected_lines = []
        if steps:
            fields = self.stock | (metadata or {})
            expected_lines.append("::notice::NATIVE_KVM_DEVICE_METADATA " + " ".join(
                f"{key}={value}" for key, value in fields.items()))
        else:
            self.lstat.assert_not_called()
            self.group.assert_not_called()
        self.assertEqual(output.getvalue().splitlines(), expected_lines + [line])
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
        for cause, label in ((errno.ENOENT, "device-missing"), (errno.EACCES, "open-denied"),
                             (errno.EPERM, "open-denied"), (errno.ELOOP, "device-link")):
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

    def test_ioctl_denied_after_open(self):
        self.ioctl.side_effect = OSError(errno.EPERM, "private details")
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE ioctl-denied", "open inspect ioctl close")

    def test_nonstock_device_metadata(self):
        self.node.st_uid = 1111
        self.node.st_gid = 2222
        self.node.st_mode = stat.S_IFCHR | 0o666
        self.sysfs.return_value.read.return_value = "10:231\n"
        self.groups.return_value = [555]
        self.acl.side_effect = None
        self.acl.return_value = b"private ACL bytes"
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close",
                   {"root_owned": "no", "group_matches": "no", "mode_0660": "no", "sysfs_matches": "no",
                    "acl_absent": "no", "caller_member": "yes"})

    def test_missing_group_and_unknown_metadata(self):
        self.group.side_effect = KeyError("private group details")
        self.sysfs.side_effect = PermissionError("private sysfs details")
        self.acl.side_effect = OSError(errno.EOPNOTSUPP, "private ACL details")
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close",
                   {"group_exists": "no", "group_matches": "unknown", "caller_member": "unknown",
                    "sysfs_matches": "unknown", "acl_absent": "unknown"})

    def test_unreadable_node_and_group(self):
        self.lstat.side_effect = PermissionError("private node details")
        self.group.side_effect = OSError("NSS diagnostic")
        self.open.side_effect = OSError(errno.EACCES, "private open details")
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE open-denied", "open",
                   {key: "unknown" for key in self.stock})
        self.sysfs.assert_not_called()
        self.acl.assert_not_called()

    def test_symlink_metadata_never_follows_target(self):
        self.node.st_mode = stat.S_IFLNK | 0o777
        self.open.side_effect = OSError(errno.ELOOP, "private link details")
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE device-link", "open",
                   {"character": "no", "symlink": "yes", "root_owned": "unknown", "group_matches": "unknown",
                    "mode_0660": "unknown", "sysfs_matches": "unknown", "acl_absent": "unknown"})
        self.acl.assert_not_called()
        self.sysfs.assert_not_called()

    def test_invalid_sysfs_and_missing_group_list(self):
        self.sysfs.return_value.read.return_value = "private invalid sysfs text"
        self.groups.side_effect = OSError("private membership details")
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close",
                   {"sysfs_matches": "unknown", "caller_member": "unknown"})

    def test_metadata_changed_during_sample(self):
        self.lstat.side_effect = [self.node, Mock()]
        self.open.side_effect = OSError(errno.EACCES, "private details")
        unknown = {key: "unknown" for key in self.stock if key not in ("group_exists", "caller_member")}
        self.check(2, "::notice::NATIVE_KVM_API_UNAVAILABLE open-denied", "open", unknown)

    def test_primary_group_membership(self):
        self.egid.return_value = 555
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close",
                   {"caller_member": "yes"})
        self.group.assert_called_once_with("kvm")
        self.acl.assert_called_once_with("/dev/kvm", "system.posix_acl_access", follow_symlinks=False)
        self.sysfs.assert_called_once_with("/sys/class/misc/kvm/dev", encoding="ascii")

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

    def test_role_baseline_never_queries_an_opened_device(self):
        self.assertEqual(probe.observe_device(version=False), (2, "baseline-opened"))
        self.ioctl.assert_not_called()
        self.close.assert_called_once_with(23)

    def test_role_refuses_replaced_descriptor_before_ioctl(self):
        self.assertEqual(probe.observe_device(expected_node=self.node), (2, "device-changed"))
        self.ioctl.assert_not_called()
        self.close.assert_called_once_with(23)
        self.inspect.return_value = self.node
        self.assertEqual(probe.observe_device(expected_node=self.node), (0, "version=12"))
        self.ioctl.assert_called_once_with(23, 0xAE00, 0)
        self.assertEqual(self.close.call_count, 2)

    def test_version_probe_only(self):
        self.check(0, "::notice::NATIVE_KVM_API_ACCESSIBLE version=12", "open inspect ioctl close")


if __name__ == "__main__":
    unittest.main()
