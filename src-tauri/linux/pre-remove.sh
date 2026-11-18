#!/bin/sh
set -eu
if [ "${1:-}" = remove ] && [ -f /etc/apparmor.d/programmable-notes ] && command -v apparmor_parser >/dev/null 2>&1; then
  apparmor_parser -R /etc/apparmor.d/programmable-notes
fi
