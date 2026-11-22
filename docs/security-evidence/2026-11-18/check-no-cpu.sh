#!/bin/bash
set -euo pipefail
if getent passwd 1001 >/dev/null; then echo 'Unexpected existing UID1001; no mutation'; exit 1; fi
useradd -m -u 1001 -s /bin/bash pn-denied
mkdir -p /run/systemd/system/user-1001.slice.d
printf '[Slice]\nDisableControllers=cpu\n' > /run/systemd/system/user-1001.slice.d/no-cpu.conf
systemctl daemon-reload
loginctl enable-linger pn-denied
systemctl start user@1001.service
cat /sys/fs/cgroup/user.slice/user-1001.slice/user@1001.service/cgroup.controllers
if runuser -u pn-denied -- env XDG_RUNTIME_DIR=/run/user/1001 DBUS_SESSION_BUS_ADDRESS=unix:path=/run/user/1001/bus /opt/pn/resource-gates-current > /tmp/pn-no-cpu-result.log 2>&1; then
  pn_denial_status=0
else
  pn_denial_status=$?
fi
cat /tmp/pn-no-cpu-result.log
printf 'HELPER_EXIT=%s\n' "$pn_denial_status"
test "$pn_denial_status" = 2
grep -q 'Cannot verify cpu.max' /tmp/pn-no-cpu-result.log
pn_payloads=$(find /run/user/1001 -maxdepth 1 -name 'pn-preview-payload-*' -print)
test -z "$pn_payloads"
echo 'PASS: missing CPU controller refused before payload delivery'
loginctl disable-linger pn-denied
systemctl stop user@1001.service
