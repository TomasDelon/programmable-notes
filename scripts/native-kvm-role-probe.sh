#!/usr/bin/env bash
# Opt-in standard hosted job only. The privileged steps never open /dev/kvm.
set -uo pipefail
umask 077
readonly role=pn-kvm-api stage=/run/pn-kvm-api
readonly observer="${BASH_SOURCE[0]%/*}/native-kvm-probe.py"

fail() {
  echo "::error::NATIVE_KVM_ROLE_API_FAILED $1" >&2
  exit 3
}

[[ $# == 1 && $1 == --api-only ]] || fail arguments
# Baseline validates the ordinary hosted caller. Its successful stdout is a
# private digest, not an identifier to log. Do not provision on any other result.
reference=$(python3 -I -B "$observer" --role-baseline | head -c 66) || exit $?
[[ $reference =~ ^[0-9a-f]{64}$ ]] || fail baseline-reference

admin() { sudo -n -- "$@" 2>/dev/null; }
absent() {
  getent "$1" "${2:-$role}" >/dev/null 2>&1
  [[ $? == 2 ]]
}

# Bind both NSS name and numeric reverse lookups. Never print account records.
numeric_id() {
  local record name password number primary rest
  record=$(getent "$1" "$2" 2>/dev/null) || return 1
  [[ $record != *$'\n'* ]] || return 1
  IFS=: read -r name password number primary rest <<<"$record"
  [[ $name == "$role" && $number =~ ^[1-9][0-9]*$ ]] || return 1
  [[ $1 == group || ( -n $role_gid && $primary == "$role_gid" ) ]] || return 1
  printf '%s' "$number"
}

same_id() {
  [[ -n $2 && $(numeric_id "$1" "$role") == "$2" && $(numeric_id "$1" "$2") == "$2" ]]
}

role_uid= role_gid=
own_stage=0 own_group=0 own_user=0 uncertain=0 cancelled=0
check_signal() { (( cancelled == 0 )) || fail interrupted; }
cleanup() {
  local primary=$? failed=$uncertain
  trap - EXIT
  trap '' INT TERM HUP
  if (( own_user )); then
    # The foreground timeout owns and reaps the only permitted child. Refuse to
    # recycle its UID or private group if the process is unexpectedly still live.
    if same_id passwd "$role_uid" && same_id group "$role_gid"; then
      admin /usr/bin/pgrep -U "$role_uid" >/dev/null
      if [[ $? == 1 ]]; then
        # userdel may remove the matching private group as well.
        same_id passwd "$role_uid" && same_id group "$role_gid" &&
          admin /usr/sbin/userdel "$role" || failed=1
        absent passwd && absent passwd "$role_uid" || failed=1
      else
        failed=1
      fi
    else
      failed=1
    fi
  fi
  if (( own_group )); then
    if ! absent group; then
      if absent passwd && same_id group "$role_gid"; then
        admin /usr/sbin/groupdel "$role" || failed=1
      else
        failed=1
      fi
    fi
    [[ -n $role_gid ]] && absent group && absent group "$role_gid" || failed=1
  fi
  if (( own_stage )); then
    admin /usr/bin/rm -f -- "$stage/observer.py" "$stage/reference" || failed=1
    admin /usr/bin/rmdir -- "$stage" || failed=1
    [[ ! -e $stage && ! -L $stage ]] || failed=1
  fi
  if (( failed )); then
    echo "::error::NATIVE_KVM_ROLE_API_FAILED cleanup-failed" >&2
    (( primary != 0 )) || primary=3
  fi
  exit "$primary"
}
trap cleanup EXIT
# Defer signal handling to acquisition boundaries so a successful operation is
# recorded for cleanup even when a signal arrives as the command returns.
trap 'cancelled=1' INT TERM HUP

absent passwd && absent group || fail account-collision
admin /usr/bin/mkdir -m 0700 -- "$stage" || fail stage-create
own_stage=1
check_signal
admin /usr/bin/tee -- "$stage/observer.py" <"$observer" >/dev/null || fail stage-copy
check_signal
if ! admin /usr/sbin/groupadd --system "$role"; then
  # A failed creation cannot establish ownership of a newly visible NSS name.
  absent group || uncertain=1
  fail group-create
fi
own_group=1
role_gid=$(numeric_id group "$role") && same_id group "$role_gid" || fail group-identity
check_signal
if ! admin /usr/sbin/useradd --system --no-user-group --gid "$role" --no-create-home \
  --home-dir /nonexistent --no-log-init --shell /usr/sbin/nologin --password '!' "$role"; then
  absent passwd || uncertain=1
  fail account-create
fi
own_user=1
role_uid=$(numeric_id passwd "$role") && same_id passwd "$role_uid" || fail account-identity
check_signal

# Both the numeric credentials selected for setpriv and the original context
# are bound by this root-owned, read-only reference before the child runs.
printf '%s\n' "$reference" "$role_uid" "$role_gid" |
  admin /usr/bin/tee -- "$stage/reference" >/dev/null || fail stage-copy
admin /usr/bin/chmod 0444 -- "$stage/observer.py" "$stage/reference" || fail stage-mode
admin /usr/bin/chmod 0711 -- "$stage" || fail stage-mode
check_signal

# sudo closes inherited descriptors above stderr. The private role also
# closes any unexpected inherited descriptors before checking its credentials.
role_line=$(
  cd / || exit 3
  admin /usr/bin/timeout --kill-after=2s 10s /usr/bin/env -i /usr/bin/setpriv \
    --reuid="$role_uid" --regid="$role_gid" --groups=kvm --no-new-privs \
    --inh-caps=-all --ambient-caps=-all --bounding-set=-all \
    /usr/bin/python3 -I -B "$stage/observer.py" --role-api </dev/null | head -c 256
)
result=$?
check_signal
case $result in
  0) [[ $role_line == "::notice::NATIVE_KVM_ROLE_API_ACCESSIBLE version=12" ]] || fail role-output ;;
  2)
    case $role_line in
      "::notice::NATIVE_KVM_ROLE_API_UNAVAILABLE "*) reason=${role_line#"::notice::NATIVE_KVM_ROLE_API_UNAVAILABLE "} ;;
      *) fail role-execution ;;
    esac
    case $reason in
      reference|credentials|context-unavailable|context-changed|device-metadata|device-changed|device-missing|open-denied|device-link|device-type|ioctl-unsupported|ioctl-denied|api-version|runner-user) ;;
      *) fail role-output ;;
    esac
    ;;
  3) fail observer-runtime ;;
  124|137) fail timeout ;;
  *) fail role-execution ;;
esac
echo "$role_line"
exit "$result"
