"""Mock the hosted role experiment. No host credentials or device access."""

import errno
import importlib.util
import io
import grp
import pwd
import subprocess
import tempfile
import os
import stat
import unittest
from contextlib import ExitStack
from pathlib import Path
from unittest.mock import Mock, mock_open, patch

ROOT = Path(__file__).resolve().parents[3]
spec = importlib.util.spec_from_file_location("probe", ROOT / "scripts/native-kvm-probe.py")
probe = importlib.util.module_from_spec(spec)
spec.loader.exec_module(probe)

STOCK = {
    "character": True, "symlink": False, "root_owned": True, "group_exists": True,
    "group_matches": True, "mode_0660": True, "sysfs_matches": True,
    "acl_absent": True, "caller_member": False,
}


class RoleProbe(unittest.TestCase):
    def setUp(self):
        self.stack = ExitStack()
        self.addCleanup(self.stack.close)
        self.meta = self.mock(probe, "device_metadata", STOCK.copy())
        self.node = Mock(st_mode=stat.S_IFCHR | 0o660, st_dev=1, st_ino=5, st_ctime_ns=7)
        self.mock(os, "lstat", self.node)
        self.access = self.mock(probe, "observe_device", (2, "open-denied"))
        self.context = self.mock(probe, "context_digest", "a" * 64)

    def mock(self, obj, attr, result):
        return self.stack.enter_context(patch.object(obj, attr, return_value=result))

    def test_baseline_exact_metadata_and_open_denial(self):
        self.assertEqual(probe.role_baseline(), (0, "a" * 64))
        self.access.assert_called_once_with(version=False)
        for key in STOCK:
            with self.subTest(key=key):
                self.access.reset_mock()
                self.meta.return_value = STOCK | {key: None}
                self.assertEqual(probe.role_baseline()[0], 2)
                self.access.assert_not_called()
        self.meta.return_value = STOCK
        for result in ((2, "baseline-opened"), (2, "ioctl-denied")):
            self.access.return_value = result
            self.assertEqual(probe.role_baseline()[0], 2)

    def test_role_checks_before_api(self):
        verified = self.mock(probe, "role_credentials", False)
        self.meta.return_value = STOCK | {"caller_member": True}
        self.stack.enter_context(patch("builtins.open", mock_open(read_data="a" * 64 + "\n321\n123\n")))
        self.assertEqual(probe.role_api(), (2, "credentials"))
        verified.assert_called_once_with(321, 123)
        verified.return_value = True
        self.context.side_effect = PermissionError()
        self.assertEqual(probe.role_api(), (2, "context-unavailable"))
        self.context.side_effect = None
        self.context.return_value = "b" * 64
        self.assertEqual(probe.role_api(), (2, "context-changed"))
        self.context.return_value = "a" * 64
        self.meta.return_value["acl_absent"] = None
        self.assertEqual(probe.role_api(), (2, "device-metadata"))
        self.access.assert_not_called()
        self.meta.return_value["acl_absent"] = True
        for result in ((2, "open-denied"), (2, "ioctl-denied"), (0, "version=12")):
            self.access.return_value = result
            self.assertEqual(probe.role_api(), result)
            self.access.assert_called_with(expected_node=self.node)


class RoleGuards(unittest.TestCase):
    def test_cgroup_namespace_and_membership_are_independent(self):
        node = Mock(st_dev=2, st_ino=13, st_ctime_ns=99)
        ns = Mock(st_dev=3, st_ino=40)
        with (patch.object(os, "stat", return_value=ns),
              patch.object(probe, "security_context", return_value=()),
              patch("builtins.open", mock_open()) as source):
            source.return_value.read.return_value = b"0::/ordinary\n"
            original = probe.context_digest(node)
            ns.st_ino += 1
            self.assertNotEqual(probe.context_digest(node), original)
            ns.st_ino -= 1
            source.return_value.read.return_value = b"0::/changed\n"
            self.assertNotEqual(probe.context_digest(node), original)
            source.return_value.read.return_value = b"0::/ordinary\n1:cpu:/other\n"
            with self.assertRaises(ValueError):
                probe.context_digest(node)

    def test_security_context_must_be_known_and_identical(self):
        node = Mock(st_dev=2, st_ino=13, st_ctime_ns=99)
        files = {
            "/sys/kernel/security/lsm": b"capability,landlock,apparmor,bpf\n",
            "/proc/self/attr/current": b"initial-label (enforce)\n",
            "/proc/self/attr/apparmor/current": b"initial-label (enforce)\n",
            "/proc/self/status": b"Seccomp:\t2\nSeccomp_filters:\t2\n",
            "/proc/self/cgroup": b"0::/ordinary\n",
        }
        namespaces = {f"/proc/self/ns/{name}": Mock(st_dev=3, st_ino=i) for i, name in
                      enumerate(("cgroup", "ipc", "mnt", "net", "pid", "time", "user", "uts"))}
        def opened(path, mode):
            self.assertEqual(mode, "rb")
            return io.BytesIO(files[path])
        with patch.object(os, "stat", side_effect=namespaces.__getitem__), patch("builtins.open", side_effect=opened):
            original = probe.context_digest(node)
            for path, namespace in namespaces.items():
                with self.subTest(namespace=path), patch.object(namespace, "st_ino", 731):
                    self.assertNotEqual(probe.context_digest(node), original)
            for path, content in (
                ("/proc/self/attr/apparmor/current", b"different profile"),
                ("/proc/self/attr/current", b"different legacy label"),
                ("/proc/self/status", b"Seccomp: 2\nSeccomp_filters: 3\n"),
                ("/proc/self/status", b"Seccomp: 0\nSeccomp_filters: 0\n"),
            ):
                with self.subTest(path=path), patch.dict(files, {path: content}):
                    self.assertNotEqual(probe.context_digest(node), original)
            for path, content in (
                ("/proc/self/attr/apparmor/current", b""),
                ("/proc/self/attr/current", b"z" * 4097),
                ("/sys/kernel/security/lsm", b"capability,apparmor,unknown-lsm"),
                ("/proc/self/status", b"Seccomp: 2\n"),
                ("/proc/self/status", b"Seccomp: 2\nSeccomp_filters: 0\n"),
            ):
                with self.subTest(reject=path), patch.dict(files, {path: content}):
                    with self.assertRaises(ValueError):
                        probe.context_digest(node)

    def test_private_credentials_and_capabilities(self):
        status = {
            "Uid": "321 321 321 321", "Gid": "123 123 123 123", "NoNewPrivs": "1",
            "CapInh": "0", "CapPrm": "0", "CapEff": "0", "CapBnd": "0", "CapAmb": "0",
        }
        def matches(changes, uid=321, gid=123):
            data = "".join(f"{key}:\t{val}\n" for key, val in (status | changes).items())
            with patch("builtins.open", mock_open(read_data=data)):
                return probe.role_credentials(uid, gid)
        with (patch.object(pwd, "getpwnam", return_value=Mock(pw_uid=321, pw_gid=123)),
              patch.object(grp, "getgrnam", side_effect=lambda n: Mock(gr_gid=234 if n == "kvm" else 123)),
              patch.object(os, "getgroups", return_value=[234]) as groups):
            self.assertTrue(matches({}))
            self.assertFalse(matches({}, uid=322))
            self.assertFalse(matches({}, gid=124))
            for key in status:
                with self.subTest(key=key):
                    value = "321 321 321 111" if key == "Uid" else "123 123 123 111" if key == "Gid" else "ff"
                    self.assertFalse(matches({key: value}))
            groups.return_value = [234, 999]
            self.assertFalse(matches({}))

    def test_fd_closure(self):
        with (patch.object(os, "listdir", return_value=["0", "1", "2", "3", "6"]),
              patch.object(os, "close", side_effect=[None, OSError(errno.EBADF, "")]) as close):
            probe.close_inherited_fds()
            self.assertEqual([c.args[0] for c in close.call_args_list], [3, 6])


# The real wrapper runs with PATH containing only these inert executables.
# sudo never delegates. Even a misspelled command cannot reach a host tool.
MOCK = r"""#!/bin/bash
cmd=${0##*/}
if [[ $cmd == head ]]; then exec /usr/bin/head "$@"; fi
if [[ $cmd == python3 ]]; then
  [[ $* == *--role-baseline ]] || exit 66
  [[ $SCENARIO != ineligible ]] || exit 2
  printf '%064d\n' 0
  exit 0
fi
if [[ $cmd == getent ]]; then
  [[ $1 == passwd && $SCENARIO == collision ]] && exit 0
  [[ -e $MOCK_DIR/$1 ]] || exit 2
  uid=321 gid=123
  if [[ -e $MOCK_DIR/ran ]]; then
    [[ $SCENARIO != replaced-uid ]] || uid=654
    [[ $SCENARIO != replaced-gid ]] || gid=456
    [[ $SCENARIO != unknown-user || $1 != passwd ]] || exit 1
  fi
  case $1 in
    passwd) [[ $2 == pn-kvm-api || $2 == "$uid" ]] || exit 2
            echo "pn-kvm-api:x:$uid:$gid::/nonexistent:/usr/sbin/nologin" ;;
    group) [[ $2 == pn-kvm-api || $2 == "$gid" ]] || exit 2
           echo "pn-kvm-api:x:$gid:" ;;
    *) exit 66 ;;
  esac
  exit 0
fi
[[ $cmd == sudo && $1 == -n && $2 == -- ]] || exit 66
shift 2
cmd=${1##*/}
shift
printf '%s %s\n' "$cmd" "$*" >>"$MOCK_DIR/trace"
case $cmd in
  mkdir) [[ $SCENARIO != stage-collision ]] ;;
  tee) if [[ $2 == /run/pn-kvm-api/reference ]]; then
         mapfile -t reference
         [[ ${#reference[@]} == 3 && ${reference[0]} =~ ^0{64}$ &&
            ${reference[1]} == 321 && ${reference[2]} == 123 ]] || exit 66
       else
         while IFS= read -r _; do :; done
       fi
       [[ $SCENARIO != copy-failure ]] ;;
  chmod|rm|rmdir) exit 0 ;;
  groupadd) [[ $SCENARIO != group-failure ]] || exit 1
            : >"$MOCK_DIR/group"
            [[ $SCENARIO != partial-group ]] ;;
  useradd) [[ $SCENARIO != user-failure ]] || exit 1
           : >"$MOCK_DIR/passwd"
           [[ $SCENARIO != partial-user ]] ;;
  timeout)
    : >"$MOCK_DIR/ran"
    case $SCENARIO in
      timeout|timeout-cleanup) exit 124 ;;
      denial|denial-cleanup) echo "::notice::NATIVE_KVM_ROLE_API_UNAVAILABLE ioctl-denied"; exit 2 ;;
      tool-error) echo private-diagnostic; exit 2 ;;
      *) echo "::notice::NATIVE_KVM_ROLE_API_ACCESSIBLE version=12" ;;
    esac ;;
  pgrep) exit 1 ;;
  userdel) [[ $SCENARIO != *cleanup ]] && /usr/bin/unlink "$MOCK_DIR/passwd" ;;
  groupdel) /usr/bin/unlink "$MOCK_DIR/group" ;;
  *) exit 66 ;;
esac
"""


class Lifecycle(unittest.TestCase):
    def run_wrapper(self, scenario):
        with tempfile.TemporaryDirectory() as tmp:
            for name in ("sudo", "getent", "python3", "head"):
                path = Path(tmp, name)
                path.write_text(MOCK)
                path.chmod(0o700)
            result = subprocess.run(
                ["/bin/bash", ROOT / "scripts/native-kvm-role-probe.sh", "--api-only"],
                env={"PATH": tmp, "MOCK_DIR": tmp, "SCENARIO": scenario},
                capture_output=True, text=True, timeout=3,
            )
            trace = Path(tmp, "trace")
            commands = trace.read_text().splitlines() if trace.exists() else []
            self.assertNotIn("private-diagnostic", result.stdout + result.stderr)
            return result, commands

    def test_no_mutation_until_eligible(self):
        for scenario, code in (("ineligible", 2), ("collision", 3)):
            with self.subTest(scenario=scenario):
                result, trace = self.run_wrapper(scenario)
                self.assertEqual(result.returncode, code)
                self.assertEqual(trace, [])

    def test_only_acquired_resources_are_removed(self):
        for scenario, expected in (
            ("stage-collision", []), ("copy-failure", ["rm", "rmdir"]),
            ("group-failure", ["rm", "rmdir"]), ("user-failure", ["groupdel", "rm", "rmdir"]),
            ("partial-group", ["rm", "rmdir"]), ("partial-user", ["rm", "rmdir"]),
        ):
            with self.subTest(scenario=scenario):
                result, trace = self.run_wrapper(scenario)
                self.assertEqual(result.returncode, 3)
                self.assertEqual([cmd.split()[0] for cmd in trace if cmd.split()[0] in
                                  ("rm", "rmdir", "userdel", "groupdel")], expected)
                self.assertFalse(any(line.startswith("timeout ") for line in trace))
                if scenario.startswith("partial-"):
                    self.assertIn("FAILED cleanup-failed", result.stderr)

    def test_fixed_role_execution_and_cleanup(self):
        for scenario, code in (("success", 0), ("denial", 2), ("timeout", 3), ("tool-error", 3)):
            with self.subTest(scenario=scenario):
                result, trace = self.run_wrapper(scenario)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertIn("timeout --kill-after=2s 10s /usr/bin/env -i /usr/bin/setpriv "
                              "--reuid=321 --regid=123 --groups=kvm --no-new-privs "
                              "--inh-caps=-all --ambient-caps=-all --bounding-set=-all "
                              "/usr/bin/python3 -I -B /run/pn-kvm-api/observer.py --role-api", trace)
                self.assertEqual([c.split()[0] for c in trace[-5:]],
                                 ["pgrep", "userdel", "groupdel", "rm", "rmdir"])
                if scenario == "timeout":
                    self.assertIn("FAILED timeout", result.stderr)
                if scenario == "tool-error":
                    self.assertIn("FAILED role-execution", result.stderr)

    def test_cleanup_declines_replaced_or_unreadable_identities(self):
        for scenario in ("replaced-uid", "replaced-gid", "unknown-user"):
            with self.subTest(scenario=scenario):
                result, trace = self.run_wrapper(scenario)
                self.assertEqual(result.returncode, 3)
                self.assertIn("FAILED cleanup-failed", result.stderr)
                self.assertFalse(any(cmd.startswith(("userdel ", "groupdel ")) for cmd in trace))

    def test_primary_status_survives_cleanup_failure(self):
        for scenario, code in (("denial-cleanup", 2), ("timeout-cleanup", 3), ("cleanup", 3)):
            with self.subTest(scenario=scenario):
                result, trace = self.run_wrapper(scenario)
                self.assertEqual(result.returncode, code, result.stderr)
                self.assertIn("FAILED cleanup-failed", result.stderr)
                self.assertFalse(any(line.startswith("groupdel ") for line in trace))
                self.assertTrue(trace[-1].startswith("rmdir "))


if __name__ == "__main__":
    unittest.main()
