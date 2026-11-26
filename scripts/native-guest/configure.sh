#!/bin/bash
# Execute only in a newly owned, mount-free disposable assembly container.
# This file is prepared but never executed by native-vm-provision.py.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
test "$(id -u)" = 0
test ! -e /etc/native-fixture-configured
test ! -e /etc/ssh/ssh_host_ed25519_key

# Refuse anything except the canonical public wire representation. No shell
# options, arbitrary authorized_keys directives, comments or private input.
python3 - <<'PY'
import base64
from pathlib import Path
import struct
raw = Path('/opt/native-fixture/controller.pub').read_bytes()
parts = raw.rstrip(b'\n').split(b' ')
assert len(raw) <= 256 and raw.endswith(b'\n') and raw.count(b'\n') == 1
assert len(parts) == 3 and parts[0] == b'ssh-ed25519' and parts[2] == b'pn-native-fixture'
blob = base64.b64decode(parts[1], validate=True)
assert blob == struct.pack('>I', 11) + b'ssh-ed25519' + struct.pack('>I', 32) + blob[-32:]
assert base64.b64encode(blob) == parts[1]
PY

useradd --create-home --uid 1001 --shell /bin/bash fixture
usermod --password '*' fixture
install -d -m 0700 -o fixture -g fixture /home/fixture/.ssh
install -m 0600 -o fixture -g fixture /opt/native-fixture/controller.pub /home/fixture/.ssh/authorized_keys
ssh-keygen -q -t ed25519 -N '' -C pn-native-guest -f /etc/ssh/ssh_host_ed25519_key
install -d -m 0755 /etc/ssh/sshd_config.d /etc/systemd/network /etc/systemd/system/user@.service.d
cat > /etc/ssh/sshd_config.d/00-native-fixture.conf <<'CONF'
HostKey /etc/ssh/ssh_host_ed25519_key
PermitRootLogin no
PasswordAuthentication no
KbdInteractiveAuthentication no
PubkeyAuthentication yes
UsePAM yes
AllowUsers fixture
AllowAgentForwarding no
AllowTcpForwarding no
X11Forwarding no
PermitTunnel no
PermitUserEnvironment no
CONF
cat > /etc/systemd/network/10-native-fixture.network <<'CONF'
[Match]
Name=en* eth*
[Network]
DHCP=yes
CONF
cat > /etc/systemd/system/user@.service.d/50-native-fixture.conf <<'CONF'
[Service]
Delegate=cpu cpuset io memory pids
CONF
install -d -m 0755 /var/lib/systemd/linger
touch /var/lib/systemd/linger/fixture
chmod 0644 /var/lib/systemd/linger/fixture
systemd-machine-id-setup
systemctl enable ssh.service systemd-networkd.service
printf 'fresh-container-configured\n' > /etc/native-fixture-configured
