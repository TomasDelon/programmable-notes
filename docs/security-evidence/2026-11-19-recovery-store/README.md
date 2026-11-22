# Versioned recovery store: backend evidence

This is native library validation, not packaged application or IPC acceptance.
The module is not yet connected to the editor at this checkpoint.

Locked native-documents tests passed: 14 snapshot tests, two legacy recovery
tests and 18 source-store tests. One additional test is explicitly ignored in the
ordinary suite because it requires a dedicated small filesystem. It was then
executed successfully as an ordinary user in the disposable Ubuntu 24.04.5 VM:

```sh
# Disposable full-system VM only, as administrator:
mkdir -p /mnt/pn-recovery-small
mount -t tmpfs -o size=2M,uid=1000,gid=1000,mode=0700 tmpfs /mnt/pn-recovery-small
# Build the Rust integration-test executable, then as the desktop test user:
PN_RECOVERY_SMALL_FS=/mnt/pn-recovery-small ./snapshot-tests \
  --ignored --exact real_enospc_preserves_previous_snapshot --nocapture
# As administrator, after the test:
umount /mnt/pn-recovery-small
rmdir /mnt/pn-recovery-small
```

The test filled that 2 MiB tmpfs until the kernel returned ENOSPC, attempted a
new snapshot and observed ENOSPC again, removed its synthetic filler, and read
the original durable snapshot unchanged. This differs from the separate
subprocess RLIMIT_FSIZE test, which proves a write-failure path using EFBIG.
All fixtures are synthetic. Source and test-executable hashes are in `raw/`.

Other tests cover successive versions/reopening, stale writers, checksum
corruption with older-version restoration, five-version retention, global
quota refusal, cooperating-writer locking, concurrent first writers, traversal,
symlinks/hardlinks, private permissions, incomplete new and legacy temporary
files, idempotent non-destructive migration, repeated interrupted retention and
real byte accounting near the crash-headroom bound.

Review found and fixed three issues before this checkpoint: estimated rather
than actual inventory byte lengths; repeated publication consuming unretired
crash headroom; and unrecognized legacy temporary files. The regression tests
retain these cases. No forced process death or power-loss test is claimed by the
synthetic interrupted-retention fixtures. Packaged restart and untrusted-preview
recovery-command tests remain required after IPC integration.
