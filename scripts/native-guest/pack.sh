#!/bin/bash
# Fresh network-none container only; rootfs arrives on stdin, never a host mount.
set -euo pipefail
export PATH=/usr/sbin:/usr/bin:/sbin:/bin
umask 077
test "$#" = 1
case "$1" in
  ubuntu24|debian13) profile="$1" ;;
  *) exit 2 ;;
esac
test "$(id -u)" = 0
test ! -e /native-root
test ! -e /native-output
mkdir -m 0700 /native-root /native-output
# Docker export is trusted container assembly, NOT an author supplied archive.
tar --extract --file=- --directory=/native-root --numeric-owner
test -f /native-root/etc/native-fixture-configured
test -f /native-root/etc/ssh/ssh_host_ed25519_key
test -f /native-root/etc/ssh/ssh_host_ed25519_key.pub
rm -f /native-root/.dockerenv /native-root/.dockerinit
truncate -s 0 /native-root/etc/machine-id
rm -f /native-root/var/lib/dbus/machine-id
printf 'pn-native-fixture\n' > /native-root/etc/hostname
printf '127.0.0.1 localhost\n127.0.1.1 pn-native-fixture\n' > /native-root/etc/hosts
rm -f /native-root/etc/resolv.conf
ln -s /run/systemd/resolve/stub-resolv.conf /native-root/etc/resolv.conf
shopt -s nullglob
case "$profile" in
  ubuntu24) kernels=(/native-root/boot/vmlinuz-*-generic) ;;
  debian13) kernels=(/native-root/boot/vmlinuz-*-amd64) ;;
esac
test "${#kernels[@]}" = 1
kernel="${kernels[0]}"
initrd="/native-root/boot/initrd.img-${kernel##*/vmlinuz-}"
test -f "$kernel" && test ! -L "$kernel"
test -f "$initrd" && test ! -L "$initrd"
cp -- "$kernel" /native-output/vmlinuz
cp -- "$initrd" /native-output/initrd.img
cp -- /native-root/etc/ssh/ssh_host_ed25519_key.pub /native-output/ssh_host_ed25519_key.pub
truncate -s 6G /native-output/root.ext4
mkfs.ext4 -q -F -d /native-root /native-output/root.ext4
chmod 0600 /native-output/*
