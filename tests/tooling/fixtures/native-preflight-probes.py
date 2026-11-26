"""Exercise the tracked shell controller with a private cgroup tree and service manager."""

import socket
import subprocess
import sys
import tempfile
from pathlib import Path

SCRIPT = Path(__file__).resolve().parents[3] / "scripts/native-hosted-preflight.sh"
source = SCRIPT.read_text()
definitions = source[: source.index("[[ ${GITHUB_ACTIONS")]
# Skip privileged runner setup and the separate desktop test. Keep the actual
# EXIT trap, resource arguments, generated service shell, and denial/timeout path.
controller = source[
    source.index("pn_controller_pid=$BASHPID") :
    source.index("as_user timeout -k 3s 35s xvfb-run")
]
controller = controller.replace(
    "pn_helper=/usr/local/bin/pn-native-preflight-resource-gates",
    'pn_helper="$RUNNER_TEMP/resource-gates"',
)

MOCKS = r"""
pn_uid=1234
pn_runtime=$RUNNER_TEMP
VERSION_ID=24.04
pn_apt_options=()
sudo() {
  case $1 in
    journalctl|install) ;;
    apt-get)
      [[ $PN_CASE == success || $PN_CASE == cleanup-fails ]] || exit 90
      echo gui >> "$RUNNER_TEMP/gui-log" ;;
    *) exit 90 ;;
  esac
}
cargo() { [[ $1 == build ]] || exit 91; }
jq() { cat >/dev/null; }
as_user() {
  case $1 in
    readlink) echo 'net:[123]' ;;
    systemd-run) (
      [[ $PN_CASE != service-startup ]] || exit 1
      # Supply procfs/cgroup reads to the exact inner bash program.
      sed() {
        [[ $3 == /proc/self/cgroup ]] || exit 97
        if [[ $PN_CASE == cgroup-path ]]; then echo /unexpected; else echo /user.slice/mock/pn-capability-probe.service; fi
      }
      cat() {
        [[ $1 == /sys/fs/cgroup/user.slice/mock/pn-capability-probe.service/* ]] || exit 97
        command cat "$RUNNER_TEMP/group/${1##*/}"
      }
      grep() {
        [[ $3 == /proc/self/status ]] || exit 97
        command grep "$1" "$2" "$RUNNER_TEMP/status"
      }
      readlink() {
        [[ $1 == /proc/self/ns/net ]] || exit 97
        command cat "$RUNNER_TEMP/namespace"
      }
      /bin/bash -ceu "$(declare -f sed cat grep readlink)
      ${!#}"
    ) ;;
    journalctl) echo '{}' ;;
    find) return 0 ;;
    systemctl)
      [[ $2 == --user && $3 == list-units ]] || exit 92
      [[ ${*: -2:1} == pn-capability-probe.service && ${!#} == 'programmable-notes-preview-*.service' ]] || exit 92
      echo LIST >> "$RUNNER_TEMP/calls"
      while read -r name; do printf '%s loaded active running fixture\n' "$name"; done < "$RUNNER_TEMP/units"
      ;;
    timeout)
      if [[ $5 == systemctl ]]; then
        [[ $6 == --user && $7 == stop ]] || exit 93
        echo "STOP $8" >> "$RUNNER_TEMP/calls"
        [[ $PN_CASE != cleanup-fails && $PN_CASE != timeout-cleanup-fails ]] || return 1
        # Each fixture has just one independently managed unit.
        [[ $(cat "$RUNNER_TEMP/units") == "$8" ]] || exit 93
        : > "$RUNNER_TEMP/units"
      else
        [[ $5 == "$RUNNER_TEMP/resource-gates" ]] || exit 94
        echo 'programmable-notes-preview-100-200.service' > "$RUNNER_TEMP/units"
        case $PN_CASE in
          unexpected-exit) return 23 ;;
          timeout|timeout-cleanup-fails) return 124 ;;
          *) exit 95 ;;
        esac
      fi ;;
    *) exit 96 ;;
  esac
}
"""

LIMITS = {
    "cpu.max": "25000 100000",
    "pids.max": "128",
    "memory.max": "536870912",
    "memory.swap.max": "0",
}
WRONG_LIMITS = {
    "cpu-quota": ("cpu.max", "100000 100000"),
    "tasks-limit": ("pids.max", "32"),
    "memory-maximum": ("memory.max", "max"),
    "swap-maximum": ("memory.swap.max", None),
}
HELPER_EXITS = {"unexpected-exit": 23, "timeout": 124, "timeout-cleanup-fails": 124}


def check(case, root):
    # Commands absent from this list cannot execute through PATH. Every native,
    # administrative, display and service operation above is a shell function.
    bin_dir = root / "bin"
    bin_dir.mkdir()
    for command in ("awk", "cat", "grep"):
        (bin_dir / command).symlink_to(Path("/usr/bin") / command)
    group = root / "group"
    group.mkdir()
    limits = LIMITS.copy()
    if case in WRONG_LIMITS:
        field, value = WRONG_LIMITS[case]
        limits[field] = value
    for field, value in limits.items():
        if value is not None:
            (group / field).write_text(value + "\n")
    no_new_privs = 0 if case == "no-new-privileges" else 1
    (root / "status").write_text(f"NoNewPrivs:\t{no_new_privs}\n")
    distinct = case in ("success", "cleanup-fails")
    if case != "service-namespace-observer":
        (root / "namespace").write_text("net:[456]" if distinct else "net:[123]")
    (root / "units").write_text("pn-capability-probe.service\n")

    result = subprocess.run(
        ["/bin/bash", "-c", definitions + MOCKS + controller],
        env={"PATH": str(bin_dir), "PN_CASE": case, "RUNNER_TEMP": str(root)},
        cwd=root,
        capture_output=True,
        text=True,
        timeout=5,
    )
    primary = 0 if distinct else 2
    cleanup_failed = case in ("cleanup-fails", "timeout-cleanup-fails")
    assert result.returncode == (primary or (3 if cleanup_failed else 0)), result.stderr
    if case in HELPER_EXITS:
        status = HELPER_EXITS[case]
        assert f"NATIVE_PREFLIGHT_SUPERVISOR_EXIT code={status}\n" in result.stderr
        reason = "supervisor-timeout" if status == 124 else "unexpected-supervisor-exit"
        unit = "programmable-notes-preview-100-200.service"
    else:
        reason = case
        unit = "pn-capability-probe.service"
    if primary:
        assert f"NATIVE_PREFLIGHT_BLOCKED {reason}\n" in result.stderr, result.stderr
    assert "NATIVE_PREFLIGHT_BLOCKED" not in result.stdout
    assert (
        f"NATIVE_PREFLIGHT_CLEANUP owned_at_exit=1 failed={int(cleanup_failed)} primary_exit={primary}\n"
        in result.stderr
    ), result.stderr
    assert (root / "calls").read_text().splitlines() == ["LIST", f"STOP {unit}", "LIST"]
    assert bool((root / "units").read_text()) == cleanup_failed
    assert (root / "gui-log").exists() == distinct


# The runner cannot traverse another user's 0700 runtime directory. The test
# maps that user's view to a real local Unix socket only inside the sudo mock.
SESSION_MOCK = r"""
pn_user=pn-test
pn_home=$RUNNER_TEMP
pn_uid=1234
pn_runtime=$RUNNER_TEMP/runner-view
sudo() {
  [[ $1 == -u && $2 == "$pn_user" && $3 == env && $4 == -i ]] || exit 90
  shift 4
  while [[ $1 == *=* ]]; do shift; done
  case $1 in
    test)
      [[ $2 == -S && $3 == "$pn_runtime/bus" ]] || exit 91
      echo lookup >> "$RUNNER_TEMP/calls"
      [[ -f $RUNNER_TEMP/listening && -S $RUNNER_TEMP/owner-bus ]]
      ;;
    timeout)
      [[ $2 == -k && $3 == 1s && $4 =~ ^[0-9]+s$ ]] || exit 92
      shift 4
      case $1 in
        systemctl)
          if [[ ${*:2} == '--user start dbus.socket' ]]; then
            echo activate >> "$RUNNER_TEMP/calls"
            [[ $PN_CASE != activation-fails ]] || return 1
            if [[ $PN_CASE != still-missing ]]; then : > "$RUNNER_TEMP/listening"; fi
          elif [[ ${*:2} == '--user --wait is-system-running' ]]; then
            echo manager >> "$RUNNER_TEMP/calls"
            if [[ $PN_CASE == manager-timeout ]]; then return 124; fi
            if [[ $PN_CASE == manager-failed ]]; then echo failed; return 1; fi
            if [[ $PN_CASE == degraded ]]; then echo degraded; return 1; fi
            echo running
          else exit 93; fi
          ;;
        busctl)
          [[ $2 == "--address=unix:path=$pn_runtime/bus" && $3 == --timeout=5s &&
             ${*:4} == 'call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus GetId' ]] || exit 94
          echo roundtrip >> "$RUNNER_TEMP/calls"
          if [[ $PN_CASE == transport-timeout ]]; then return 124; fi
          [[ $PN_CASE != transport-fails ]] || return 1
          echo 'fixture-private-bus-id'
          ;;
        *) exit 95 ;;
      esac ;;
    *) exit 96 ;;
  esac
}
"""


def check_session(case, root):
    session = source[source.index("as_user() {"):source.index("# One non-networking command")]
    present = case not in ("activate", "activation-fails", "still-missing")
    if present:
        (root / "listening").touch()
    reason = {
        "activation-fails": "user-bus-activation",
        "still-missing": "user-bus-socket",
        "transport-fails": "user-bus-transport",
        "transport-timeout": "user-bus-command-timeout",
        "manager-timeout": "user-manager-timeout",
        "manager-failed": "user-manager",
    }.get(case)
    with socket.socket(socket.AF_UNIX, socket.SOCK_STREAM) as bus:
        bus.bind(str(root / "owner-bus"))
        result = subprocess.run(
            ["/bin/bash", "-c", definitions + SESSION_MOCK + session],
            env={"PATH": "/nonexistent", "GITHUB_ACTIONS": "true", "PN_CASE": case, "RUNNER_TEMP": str(root)},
            capture_output=True, text=True, timeout=5,
        )
    assert result.returncode == (2 if reason else 0), (case, result.stderr)
    assert result.stdout == (f"::error::NATIVE_PREFLIGHT_BLOCKED {reason}\n" if reason else ""), (case, result.stdout)
    expected = ["lookup"]
    if not present:
        expected.append("activate")
        if case != "activation-fails":
            expected.append("lookup")
    if case not in ("activation-fails", "still-missing"):
        expected.append("roundtrip")
        if case not in ("transport-fails", "transport-timeout"):
            expected.append("manager")
    assert (root / "calls").read_text().splitlines() == expected, case


PACKAGE_MOCK = r"""
sudo() {
  [[ $1 == apt-get ]] || exit 90
  for action in "$@"; do
    case $action in
      update)
        [[ $* == *'APT::Update::Error-Mode=any'* ]] || exit 93
        echo update >> "$RUNNER_TEMP/calls"
        [[ $PN_CASE != index-failure ]] || return 100
        return 0 ;;
      install)
        printf '%s\n' "$*" >> "$RUNNER_TEMP/calls"
        if [[ $* == *'openbox'* ]]; then
          [[ $PN_CASE != gui-failure && $PN_CASE != missing-driver ]] || return 100
        elif [[ $PN_CASE == base-failure ]]; then return 100; fi
        return 0 ;;
    esac
  done
  exit 91
}
apt-cache() {
  [[ $1 == policy && $# == 2 ]] || exit 92
  if [[ $2 == webkitgtk-webdriver && $PN_CASE == missing-driver ]]; then
    echo '  Candidate: (none)'
  else
    echo '  Candidate: 1.0'
  fi
}
"""


def check_packages(case, version):
    # Execute actual package operation call sites around a synthetic successful
    # namespace gate. A separate check above exercises the real gate controller.
    base = source[source.index("pn_apt_options="):source.index("pn_user=pn-native-check")]
    gui = source[source.index("pn_driver_package="):source.index("as_user timeout -k 3s 35s xvfb-run")]
    with tempfile.TemporaryDirectory() as tmp:
        run = subprocess.run(
            ["/bin/bash", "-c", definitions + PACKAGE_MOCK + base + "\n" + gui],
            env={"PATH": "/nonexistent", "RUNNER_TEMP": tmp, "PN_CASE": case,
                 "GITHUB_ACTIONS": "true", "VERSION_ID": version},
            capture_output=True, text=True, timeout=5,
        )
        expected = {
            "index-failure": ["apt-index"],
            "base-failure": ["apt-base-install"],
            "gui-failure": ["apt-gui-install"],
            "missing-driver": ["apt-no-candidate-webkitgtk-webdriver", "apt-gui-install"],
        }.get(case, [])
        assert run.returncode == (2 if expected else 0), (case, run.stderr)
        assert run.stdout.splitlines() == ["::error::NATIVE_PREFLIGHT_BLOCKED " + code for code in expected], (case, run.stdout)
        calls = (Path(tmp) / "calls").read_text().splitlines()
        assert calls[0] == "update"
        if case == "index-failure":
            assert len(calls) == 1
            return
        assert "dbus-user-session" in calls[1] and "jq" in calls[1] and "webkit" not in calls[1]
        if case == "base-failure":
            assert len(calls) == 2
            return
        expected_driver = "webkitgtk-webdriver" if version == "26.04" else "webkit2gtk-driver"
        assert len(calls) == 3 and expected_driver in calls[2].split()
        assert "libwebkit2gtk-4.1-0" in calls[2].split() and "tesseract-ocr-eng" in calls[2].split()


if sys.argv[1:] == ["--packages"]:
    for scenario, version in [
        ("ubuntu24", "24.04"), ("ubuntu26", "26.04"), ("index-failure", "26.04"),
        ("base-failure", "26.04"), ("gui-failure", "26.04"), ("missing-driver", "26.04")
    ]:
        check_packages(scenario, version)
        print(scenario)
    sys.exit(0)


if sys.argv[1:] == ["--session"]:
    for scenario in (
        "owner-visible",
        "activate",
        "activation-fails",
        "still-missing",
        "transport-fails",
        "transport-timeout",
        "manager-timeout",
        "manager-failed",
        "degraded",
    ):
        with tempfile.TemporaryDirectory() as directory:
            check_session(scenario, Path(directory))
        print(scenario)
    sys.exit(0)


for scenario in [
    *WRONG_LIMITS,
    "cgroup-path",
    "no-new-privileges",
    "service-namespace-observer",
    "service-startup",
    *HELPER_EXITS,
    "cleanup-fails",
    "success",
]:
    with tempfile.TemporaryDirectory() as directory:
        check(scenario, Path(directory))
    print(scenario)
