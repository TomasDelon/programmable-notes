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


CG_FIELDS = ("cpu_available", "memory_available", "pids_available", "cpu_enabled",
             "memory_enabled", "pids_enabled", "domain_nonroot", "observer_direct",
             "other_direct_visible", "root_coordinate_ambiguous", "device_policy_verified")
CG_UNKNOWN = dict.fromkeys(CG_FIELDS)


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
        self.cg = stack.enter_context(patch.object(probe, "job_cgroup_metadata",
                                                  return_value=CG_UNKNOWN, create=True))
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
            expected_lines.append("::notice::NATIVE_JOB_CGROUP_METADATA " + " ".join(
                f"{key}=unknown" for key in CG_FIELDS))
            fields = self.stock | (metadata or {})
            expected_lines.append("::notice::NATIVE_KVM_DEVICE_METADATA " + " ".join(
                f"{key}={value}" for key, value in fields.items()))
        else:
            self.cg.assert_not_called()
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

        for mode in ("--role-baseline", "--role-api"):
            with patch.object(probe.sys, "argv", ["probe", mode]), patch.object(probe, "role_main", return_value=2):
                self.assertEqual(probe.main(), 2)
                self.cg.assert_not_called()

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


class CgroupObservation(unittest.TestCase):
    mount = b"18 7 0:29 / /sys/fs/cgroup rw - cgroup2 cgroup rw\n"
    membership = b"0::/private-job.scope\n"

    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.files = {
            b"cgroup.type": b"domain\n", b"cgroup.controllers": b"cpu memory pids io\n",
            b"cgroup.subtree_control": b"\n", b"cgroup.procs": b"12345\n70000\n",
        }
        self.fds = {}
        self.next_fd = 30
        self.replaced = False
        self.fail_at = None
        self.stack.enter_context(patch.object(os, "getpid", return_value=12345))
        self.stat_ns = self.stack.enter_context(patch.object(os, "stat",
            return_value=Mock(st_dev=2, st_ino=8)))
        self.proc = self.stack.enter_context(patch.object(probe, "bounded_read", side_effect=self.proc_read))
        self.stack.enter_context(patch.object(os, "open", side_effect=self.open_at))
        self.stack.enter_context(patch.object(os, "close", side_effect=lambda n: self.fds.pop(n)))
        self.stack.enter_context(patch.object(os, "fstat", side_effect=self.inspect))
        self.stack.enter_context(patch.object(os, "fdopen", side_effect=self.fdopen))

    def proc_read(self, path, *_):
        return {"/proc/self/cgroup": self.membership, "/proc/self/mountinfo": self.mount}[path]

    def open_at(self, name, flags, *, dir_fd=None):
        name = os.fsencode(name)
        self.assertTrue(flags & os.O_NOFOLLOW)
        self.assertTrue(flags & os.O_CLOEXEC)
        self.assertEqual(flags & os.O_ACCMODE, os.O_RDONLY)
        if dir_fd is None:
            self.assertEqual(name, b"/")
        else:
            self.assertIn(dir_fd, self.fds)
            self.assertNotIn(b"/", name)
        if name == self.fail_at:
            raise OSError(errno.ELOOP, "private-symlink-target")
        if not flags & os.O_DIRECTORY and name not in self.files:
            raise FileNotFoundError()
        self.next_fd += 1
        self.fds[self.next_fd] = (name, bool(flags & os.O_DIRECTORY))
        return self.next_fd

    def inspect(self, fd):
        name, directory = self.fds[fd]
        return Mock(st_mode=stat.S_IFDIR if directory else stat.S_IFREG,
                    st_dev=os.makedev(0, 29), st_ino=fd if self.replaced else hash(name))

    def fdopen(self, fd, mode):
        self.assertEqual(mode, "rb")
        data = io.BytesIO(self.files[self.fds[fd][0]])
        close = data.close
        def finish():
            self.fds.pop(fd)
            close()
        data.close = finish
        return data

    def sample(self):
        result = probe.job_cgroup_metadata()
        self.assertEqual(self.fds, {})
        self.assertEqual(list(result), list(CG_FIELDS))
        self.assertTrue(all(v is None or isinstance(v, bool) for v in result.values()))
        return result

    def test_occupied_leaf_and_available_controllers(self):
        expected = dict.fromkeys(CG_FIELDS, False)
        expected.update(cpu_available=True, memory_available=True, pids_available=True,
                        domain_nonroot=True, observer_direct=True, other_direct_visible=True,
                        device_policy_verified=None)
        self.assertEqual(self.sample(), expected)
        output = io.StringIO()
        with (patch.object(probe, "hosted_runner", return_value=True),
              patch.object(os, "getuid", return_value=1001), patch.object(os, "geteuid", return_value=1001),
              patch.object(probe.sys, "argv", ["probe"]), patch.object(probe, "device_metadata", return_value={}),
              patch.object(probe, "observe_device", return_value=(2, "open-denied")), redirect_stdout(output)):
            self.assertEqual(probe.main(), 2)
        states = {None: "unknown", False: "no", True: "yes"}
        self.assertEqual(output.getvalue().splitlines(), [
            "::notice::NATIVE_JOB_CGROUP_METADATA " + " ".join(f"{k}={states[v]}" for k, v in expected.items()),
            "::notice::NATIVE_KVM_DEVICE_METADATA", "::notice::NATIVE_KVM_API_UNAVAILABLE open-denied"])
        self.files[b"cgroup.controllers"] = b"cpu pids\n"
        self.files[b"cgroup.subtree_control"] = b"pids\n"
        self.files[b"cgroup.procs"] = b"12345\n"
        self.assertEqual(self.sample(), expected | {"memory_available": False,
                         "pids_enabled": True, "other_direct_visible": False})
        self.files[b"cgroup.controllers"] = self.files[b"cgroup.subtree_control"] = b""
        self.assertFalse(self.sample()["cpu_available"])

    def test_namespace_root_and_threaded_or_missing_type(self):
        self.membership = b"0::/\n"
        self.assertEqual(self.sample(), CG_UNKNOWN | {"root_coordinate_ambiguous": True})
        self.membership = b"0::/private-job.scope\n"
        for value in (b"threaded\n", b"domain threaded\n", b"domain (invalid)\n", None):
            with self.subTest(kind=value):
                if value is None:
                    self.files.pop(b"cgroup.type")
                else:
                    self.files[b"cgroup.type"] = value
                self.assertEqual(self.sample(), CG_UNKNOWN)

    def test_malformed_or_unstable_inputs_close_all_descriptors(self):
        for key, value in ((b"cgroup.procs", b"1\n" * 32769),
                           (b"cgroup.procs", b"99999\n"), (b"cgroup.procs", b"12x\n"),
                           (b"cgroup.controllers", b"+cpu\n"), (b"cgroup.subtree_control", b"memory\n")):
            with self.subTest(key=key), patch.dict(self.files, {key: value}):
                self.assertEqual(self.sample(), CG_UNKNOWN)
        for failure in (b"sys", b"private-job.scope", b"cgroup.procs"):
            self.fail_at = failure
            self.assertEqual(self.sample(), CG_UNKNOWN)
        self.fail_at = None
        with patch.object(os, "fdopen", side_effect=PermissionError("private-error")):
            self.assertEqual(self.sample(), CG_UNKNOWN)
        self.replaced = True
        self.assertEqual(self.sample(), CG_UNKNOWN)

    def test_mount_namespace_or_membership_changes_refused(self):
        for mount in (self.mount * 2, self.mount.rstrip(), self.mount.replace(b"29 / ", b"29 /nested "),
                      self.mount + b"19 18 0:30 / /sys/fs/cgroup/secret rw - tmpfs tmpfs rw\n"):
            with self.subTest(mount=mount), patch.object(self, "mount", mount):
                self.assertEqual(self.sample(), CG_UNKNOWN)
        for coord in (b"0::/../other\n", b"1:cpu:/elsewhere\n", b"0::/a//b\n"):
            with self.subTest(coord=coord), patch.object(self, "membership", coord):
                self.assertEqual(self.sample(), CG_UNKNOWN)
        def migrate(path, *unused):
            before = self.proc_read(path)
            if path == "/proc/self/cgroup":
                self.membership = b"0::/migrated\n"
            return before
        self.proc.side_effect = migrate
        self.assertEqual(self.sample(), CG_UNKNOWN)
        self.stat_ns.side_effect = [Mock(st_dev=2, st_ino=9), Mock(st_dev=2, st_ino=10)]
        self.assertEqual(self.sample(), CG_UNKNOWN)


if __name__ == "__main__":
    unittest.main()
