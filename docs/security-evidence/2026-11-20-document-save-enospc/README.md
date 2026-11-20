# Original Save with a genuinely full filesystem

The resumed disposable Ubuntu24.04 full-system VM executed the standalone
`native-documents` acceptance binary as unprivileged user ubuntu against a fresh
private 2MB tmpfs. The test filled that filesystem until a real kernel ENOSPC,
released64KB, then attempted actual authorized Store Save with a larger document.
Save returned actual `Error::Io(ENOSPC)` without syscall injection.

Verified: exact original BOM/UTF8/mixed-ending bytes, mode0640, unchanged sibling,
no failed-Save temporary, then removal of only the synthetic filler and successful
retry with the **same grant/revision**. Fresh Store reopening matched every new
byte, mode and sibling; no temporary remained. No production code changed.
This does not establish the precise partial-write offset, power-loss behavior or
packaged GUI error presentation. Earlier native recovery ENOSPC remains separate.

The guard requires an explicit canonical, private, owned, empty 1–4MB tmpfs
mountpoint. Mountinfo must identify exactly one whole-filesystem tmpfs root;
subtree bind mounts and stacked ambiguities are refused before creating files.
Ordinary regression fixtures cover mount parsing including escaped paths. An
actual subtree bind mount of another small tmpfs was refused with exit101 and
its external synthetic sentinel stayed unchanged. A nonmount was refused without
creating files. Shared `/dev/shm` is not accepted. Fixtures are removed only after
this test successfully creates them.

CI reuses its dedicated2MB mount after the recovery ENOSPC test cleans up. Both
tests remain mandatory explicit ignored-test invocations with positive pass
markers; ordinary Cargo tests alone do not prove this acceptance. Hosted results
for the new step must be observed independently.

Reproduce in a disposable Linux test machine (mount requires administrative
authority; execute Cargo as the ordinary test user):

```sh
pn_small_fs=$(mktemp -d)
sudo mount -t tmpfs -o "size=2M,uid=$(id -u),gid=$(id -g),mode=0700" tmpfs "$pn_small_fs"
trap 'sudo umount "$pn_small_fs"; rmdir "$pn_small_fs"' EXIT
PN_DOCUMENT_SMALL_FS="$pn_small_fs" timeout -k 5s 30s cargo test \
  --manifest-path native-documents/Cargo.toml --locked --test save_enospc \
  -- --ignored --exact real_enospc_preserves_original_save_and_grant --nocapture
```

The actual executable hash and pass result are in `actual-enospc.log`. No GUI or
full resource/security matrix is claimed by this standalone filesystem gate.
