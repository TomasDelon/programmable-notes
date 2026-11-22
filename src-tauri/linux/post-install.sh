#!/bin/sh
set -eu
# Load only this application's namespace opt-in; never alter systemd or global
# AppArmor/sysctl policy. Distribution setup for user services is separate.
if [ -r /sys/module/apparmor/parameters/enabled ] && grep -q '^Y' /sys/module/apparmor/parameters/enabled; then
  apparmor_parser -r /etc/apparmor.d/programmable-notes
fi
