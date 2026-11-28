#!/usr/bin/env bash
# Fixed host APT setup for disposable Ubuntu GitHub runners, including Playwright's sudo APT calls.
set -euo pipefail

print_config() {
  cat <<'CONFIG'
Dir::Etc::sourcelist "/etc/apt/sources.list.d/ubuntu.sources";
Dir::Etc::sourceparts "-";
CONFIG
}

case "$#:$*" in
  1:--print-config) print_config; exit 0 ;;
  0:) ;;
  *) printf 'Usage: bash scripts/ci-ubuntu-apt.sh [--print-config]\n' >&2; exit 2 ;;
esac

if [[ ${GITHUB_ACTIONS:-} != true || ${RUNNER_OS:-} != Linux ]] || ! grep -qx 'ID=ubuntu' /etc/os-release; then
  printf 'APT setup requires a disposable Ubuntu GitHub runner.\n' >&2
  exit 2
fi
pn_ubuntu_source=/etc/apt/sources.list.d/ubuntu.sources
if ! [[ -f $pn_ubuntu_source && -r $pn_ubuntu_source && -s $pn_ubuntu_source ]]; then
  printf 'Expected Ubuntu source configuration is absent; refusing APT setup.\n' >&2
  exit 2
fi
if ! grep -Eq '^Signed-By:[[:space:]]+/usr/share/keyrings/ubuntu-archive-keyring\.gpg[[:space:]]*$' "$pn_ubuntu_source"; then
  printf 'Expected Ubuntu archive signature configuration is absent; refusing APT setup.\n' >&2
  exit 2
fi
# Keep the runner's Ubuntu source and signer unchanged. Ignore unrelated source parts.
print_config | sudo install -m 0644 /dev/stdin /etc/apt/apt.conf.d/99programmable-notes-ubuntu-only
