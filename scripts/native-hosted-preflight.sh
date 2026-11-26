#!/usr/bin/env bash
# Infrastructure preflight for an ephemeral standard GitHub-hosted runner. All public output is diagnostic.
set -euo pipefail
umask 077
# Callers supply literal reason codes only. Keep runner and journal data out of annotations.
annotate_failure() {
  if [ "${GITHUB_ACTIONS:-}" = true ]; then
    printf '::error::NATIVE_PREFLIGHT_BLOCKED %s\n' "$1"
  fi
}
block() {
  printf 'NATIVE_PREFLIGHT_BLOCKED %s\n' "$1" >&2
  annotate_failure "$1"
  exit 2
}
# This check is passed verbatim to the ordinary user's transient service.
read_limits() {
  local group=$1 status=$2
  [[ $(cat "$group/cpu.max" 2>/dev/null) == "25000 100000" ]] || return 81
  [[ $(cat "$group/pids.max" 2>/dev/null) == 128 ]] || return 82
  [[ $(cat "$group/memory.max" 2>/dev/null) == 536870912 ]] || return 83
  [[ $(cat "$group/memory.swap.max" 2>/dev/null) == 0 ]] || return 84
  grep -Eq '^NoNewPrivs:[[:space:]]+1$' "$status" || return 85
}

service_failure() {
  case $1 in
    80) block cgroup-path ;;
    81) block cpu-quota ;;
    82) block tasks-limit ;;
    83) block memory-maximum ;;
    84) block swap-maximum ;;
    85) block no-new-privileges ;;
    86) block service-namespace-observer ;;
    *) block service-startup ;;
  esac
}

owned_live_units() {
  # The columns are UNIT LOAD ACTIVE SUB DESCRIPTION. Include every live state.
  as_user systemctl --user list-units --all --type=service --plain --no-legend --no-pager \
    'pn-capability-probe.service' 'programmable-notes-preview-*.service' |
    awk '$3 != "inactive" && $3 != "failed" { print $1 }'
}

cleanup_owned_units() {
  local original=$1 failed=0 before after name count=0
  # Only the controller owns cleanup, even on an early exit in a pipeline subshell.
  [[ $BASHPID == "$pn_controller_pid" ]] || return "$original"
  trap - EXIT
  if before=$(owned_live_units); then
    while IFS= read -r name; do
      [[ -n $name ]] || continue
      if [[ $name == pn-capability-probe.service || $name =~ ^programmable-notes-preview-[0-9]+-[0-9]+\.service$ ]]; then
        count=$((count+1))
        as_user timeout -k 2s 8s systemctl --user stop "$name" >/dev/null 2>&1 || failed=1
      else
        failed=1
      fi
    done <<<"$before"
  else
    failed=1
  fi
  if ! after=$(owned_live_units) || [[ -n $after ]]; then failed=1; fi
  printf 'NATIVE_PREFLIGHT_CLEANUP owned_at_exit=%d failed=%d primary_exit=%d\n' "$count" "$failed" "$original" >&2
  if ((failed)); then annotate_failure cleanup-failed; fi
  if ((original != 0)); then exit "$original"; fi
  if ((failed)); then exit 3; fi
  exit 0
}

check_denial_exit() {
  printf 'NATIVE_PREFLIGHT_SUPERVISOR_EXIT code=%d\n' "$1" >&2
  case $1 in
    2) ;;
    124|137) block supervisor-timeout ;;
    *) block unexpected-supervisor-exit ;;
  esac
}

[[ ${GITHUB_ACTIONS:-} == true && ${RUNNER_ENVIRONMENT:-} == github-hosted ]] || block runner-type
[[ $(cat /proc/1/comm) == systemd ]] || block pid1
. /etc/os-release
[[ $ID == ubuntu && $VERSION_ID == 24.04 ]] || block os
[[ $(stat -fc %T /sys/fs/cgroup) == cgroup2fs ]] || block cgroup-version
[[ $(cat /sys/module/apparmor/parameters/enabled) == Y ]] || block apparmor-disabled
pn_userns=$(sysctl -n kernel.apparmor_restrict_unprivileged_userns)
printf 'NATIVE_PREFLIGHT_POLICY restricted_userns=%s\n' "$pn_userns"
[[ $pn_userns == 1 ]] || block stock-restricted-ubuntu-baseline
pn_packages=(dbus-user-session dbus-x11 xvfb xauth openbox x11-utils xdotool
  python3-pyatspi libwebkit2gtk-4.1-0 webkit2gtk-driver xdg-desktop-portal-gtk
  tesseract-ocr tesseract-ocr-eng acl jq)
sudo apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 update -qq
sudo apt-get -o Acquire::Retries=3 -o Acquire::http::Timeout=30 -o Acquire::https::Timeout=30 install -yqq "${pn_packages[@]}" >"$RUNNER_TEMP/pn-preflight-apt.log"
pn_user=pn-native-check
if getent passwd "$pn_user" >/dev/null; then block validation-user-collision; fi
sudo useradd --create-home --user-group --shell /bin/bash "$pn_user"
pn_uid=$(id -u "$pn_user")
pn_home=$(getent passwd "$pn_user" | cut -d: -f6)
[[ $pn_uid -gt 0 && $(id -Gn "$pn_user") == "$pn_user" ]] || block unexpected-user-groups
sudo loginctl enable-linger "$pn_user"
sudo systemctl start "user@${pn_uid}.service"
pn_runtime=/run/user/$pn_uid
as_user() {
  sudo -u "$pn_user" env -i HOME="$pn_home" USER="$pn_user" LOGNAME="$pn_user" LANG=C.UTF-8 \
    PATH=/usr/bin:/bin XDG_RUNTIME_DIR="$pn_runtime" DBUS_SESSION_BUS_ADDRESS="unix:path=$pn_runtime/bus" "$@"
}
# /run/user/<uid> is private to that UID. The runner cannot observe its socket.
if ! as_user test -S "$pn_runtime/bus"; then
  as_user timeout -k 1s 10s systemctl --user start dbus.socket >/dev/null 2>&1 || block user-bus-activation
  as_user test -S "$pn_runtime/bus" || block user-bus-socket
fi
pn_bus_status=0
as_user timeout -k 1s 8s busctl --address="unix:path=$pn_runtime/bus" --timeout=5s \
  call org.freedesktop.DBus /org/freedesktop/DBus org.freedesktop.DBus GetId >/dev/null 2>&1 || pn_bus_status=$?
case $pn_bus_status in
  0) ;;
  124|137) block user-bus-command-timeout ;;
  *) block user-bus-transport ;;
esac
pn_manager_status=0
pn_manager=$(as_user timeout -k 1s 15s systemctl --user --wait is-system-running 2>/dev/null) || pn_manager_status=$?
case "$pn_manager_status:$pn_manager" in
  0:running|1:degraded) ;;
  124:*|137:*) block user-manager-timeout ;;
  *) block user-manager ;;
esac
# One non-networking command under the intended limits, reporting from inside its own unit.
pn_controller_pid=$BASHPID
trap 'cleanup_owned_units $?' EXIT
trap 'exit 130' INT
trap 'exit 143' TERM
pn_unit=pn-capability-probe.service
pn_hostns=$(as_user readlink /proc/self/ns/net) || block editor-namespace-observer
pn_unitns=$(as_user systemd-run --user --quiet --pipe --wait --collect --unit="$pn_unit" \
  -p CPUQuota=25% -p MemoryMax=512M -p MemorySwapMax=0 -p TasksMax=128 \
  -p RuntimeMaxSec=60 -p NoNewPrivileges=yes -p PrivateNetwork=yes /bin/bash -ceu "$(declare -f read_limits)"'
  cg="/sys/fs/cgroup$(sed -n "s/^0:://p" /proc/self/cgroup)"
  [[ "$cg" == /sys/fs/cgroup/user.slice/*/pn-capability-probe.service ]] || exit 80
  read_limits "$cg" /proc/self/status || exit $?
  readlink /proc/self/ns/net || exit 86
') || service_failure "$?"
[[ $pn_hostns =~ ^net:\[[0-9]+\]$ && $pn_unitns =~ ^net:\[[0-9]+\]$ ]] || block namespace-observer
sudo journalctl --sync
as_user journalctl --user -u "$pn_unit" --no-pager -o json |
  jq -se --arg unit "$pn_unit" --arg uid "$pn_uid" 'any(.[]; .USER_UNIT==$unit and ._UID==$uid and ._COMM=="systemd" and (._EXE=="/usr/lib/systemd/systemd" or ._EXE=="/lib/systemd/systemd") and ._TRANSPORT=="journal")' >/dev/null || block trusted-user-journal
printf '%s\n' 'NATIVE_PREFLIGHT_LIMITS_AND_JOURNAL_PASS'
if [[ $pn_unitns == "$pn_hostns" ]]; then
  # Exact negative oracle on the same supervisor implementation as the app. No author document is run.
  pn_target="$RUNNER_TEMP/pn-native-preflight-target"
  cargo build --manifest-path native-policy/Cargo.toml --offline --locked --release --target-dir "$pn_target" --example resource_gates
  pn_helper=/usr/local/bin/pn-native-preflight-resource-gates
  [[ ! -e $pn_helper ]] || block helper-collision
  sudo install -m 0755 "$pn_target/release/examples/resource_gates" "$pn_helper"
  no_marker() {
    local match
    match=$(as_user find "$pn_runtime" -maxdepth 1 -name 'pn-preview-payload-*' -print -quit) || return 1
    [[ -z $match ]]
  }
  no_marker || block existing-marker
  pn_exit=0
  as_user timeout -k 2s 12s "$pn_helper" >"$RUNNER_TEMP/pn-preflight-denial.log" 2>&1 || pn_exit=$?
  check_denial_exit "$pn_exit"
  grep -Fq 'Preview network namespace is not isolated' "$RUNNER_TEMP/pn-preflight-denial.log" || block incorrect-refusal-cause
  no_marker || block unexpected-payload-delivery
  pn_survivors=$(owned_live_units) || block cleanup-observer
  [[ -z $pn_survivors ]] || block surviving-preview
  echo NATIVE_PREFLIGHT_EXPECTED_SUPERVISOR_DENIAL
  block private-network-unavailable
fi
as_user timeout -k 3s 35s xvfb-run --auto-servernum -s '-screen 0 1280x900x24 -nolisten tcp' bash -ceu '
  test -s "$XAUTHORITY"
  openbox >/dev/null 2>&1 &
  wm=$!
  trap "kill $wm 2>/dev/null || true" EXIT
  for i in {1..50}; do
    xprop -root _NET_SUPPORTING_WM_CHECK | grep -Eq "window id # 0x[1-9a-f][0-9a-f]*" && break
    sleep .1
  done
  xprop -root _NET_SUPPORTING_WM_CHECK | grep -Eq "window id # 0x[1-9a-f][0-9a-f]*"
  /usr/bin/python3 -c "import pyatspi; assert pyatspi.Registry.getDesktop(0) is not None"
  command -v WebKitWebDriver >/dev/null
  tesseract --list-langs | grep -Fxq eng
' || block graphical-session
printf '%s\n' 'NATIVE_PREFLIGHT_DISTINCT_NAMESPACE_AND_DESKTOP_PASS'
