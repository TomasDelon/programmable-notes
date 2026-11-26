"""Exercise the tracked shell controller with a private cgroup tree and service manager."""

import subprocess
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
sudo() { [[ $1 == journalctl || $1 == install ]] || exit 90; }
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
