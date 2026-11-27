# Sealed Debian 13 native-validation variant

27 November 2026. SECURITY-01 / REACT-01. Separate environment validation;
Ubuntu's observed `network_not_isolated` refusal remains unchanged. Neither the
image pin nor this plan establishes Debian namespace or application acceptance.

Status: source implementation and independent review complete. Actual OS-only
admission passed on fd6f7f2 in run45939785719. Separate native run45940249067
passed effective isolation and the native bridge, then failed React readiness
and session cleanup. This narrows ABI/namespace uncertainty for that fixed helper
and environment; it does not verify the product application or Ubuntu support.
See [dated evidence](../security-evidence/2026-11-27-native-inline-fixture/README.md).

## Fixed source profile

Keep Ubuntu as the default. Add only one sealed Debian 13 amd64 recipe, using:

```dockerfile
FROM debian@sha256:ab3b3c8c5159eebfca4376430132d53c4d425f869c765ecbe47177a030da575d
```

The official image metadata is pinned at
[docker-library/repo-info commit ff8caa7](https://github.com/docker-library/repo-info/blob/ff8caa7efa314cc7052d813cee786eed9c623fa2/repos/debian/remote/13-slim.md).
Official-images identifies `trixie/slim/oci` in debuerreotype's amd64 artifacts at
commit `865e49bb5782df1fa4b4c4d8d474e3583b67bfda`. Use the amd64 image digest above,
not a mutable tag or another architecture's manifest.

Use `linux-image-amd64` with `initramfs-tools`. The Debian packer selection must
find exactly one regular `vmlinuz-*-amd64` and its regular
`initrd.img-<identical-version>`; reject ambiguity, missing pairs and symlinks.
Keep Ubuntu's separate `*-generic` selection. Verify the remaining reviewed
runtime package names and networkd/resolver units against trixie; unavailable
packages or services fail preparation rather than trigger substitutes.

## Minimal implementation and controls

Extend the existing prepare/pack/smoke boundary with a fixed Debian entry, not a
general image/profile loader. The manifest binds the sealed source-profile ID,
exact base digest and captured recipe/configuration hashes. All three stages
revalidate that binding against versioned sources. Reject unknown profiles,
arbitrary images/paths/build arguments, mixed Ubuntu/Debian contexts, forged
manifests and changed source bytes. Preserve the original default and its tests.

Keep the existing private layout, three-public-file Docker context, host-only
controller key, fresh guest host identity and strict SSH pinning. Preserve the
mount-free builder/packer, network-none assembly containers, fixed six-GiB disk,
UID1001 guest user, root-SSH denial, fixed QEMU/network arguments, bounded QMP
shutdown, deadlines and owned-resource cleanup. No host shares or credential
copies; no new remote command or payload interface.

Before execution, independently review the recipe and profile validation tests,
kernel/initrd pairing controls, contamination refusals and failure cleanup. Keep
actual package/kernel identities in the environment receipt; the base digest
alone does not pin later package-repository contents.

## Execution gates

1. Run fresh **OS-only admission first** on the standard free runner using this
   exact recipe. Require authenticated SSH, wrong-key/pin refusals, systemd,
   cgroup/mount/user facts and acknowledged normal shutdown. Preserve all failures.
2. Treat Ubuntu-built host ABI compatibility as unresolved. Verify required ELF
   libraries/versioned symbols against the Debian guest; an identical Rust target
   or newer distro is insufficient. An incompatibility requires a reviewed build
   variant, not copied foreign libraries or relaxed loading rules.
3. Before any native author input, the unchanged Supervisor must verify actual
   network-namespace separation, non-root UID, NoNewPrivs and effective aggregate
   CPU/memory/swap/task/lifetime limits. Record the stock kernel/AppArmor policy;
   do not assume Debian permits this operation. Preserve AppArmor boot controls,
   namespace sysctls and WebKit sandboxing. No executor exemption or bypass.
4. Only after those gates may the fixed native diagnostic execute and collect its
   own input, Stop, expiry and renderer observations. A Debian pass would apply
   only to its recorded artifact/environment; it would not fix Ubuntu support or
   complete production application/security acceptance.

## Fixed workflow selection

`native_vm=true` keeps Ubuntu unless `native_debian13=true` is also selected.
The Debian flag alone is rejected before checkout; unrelated dispatch modes
remain excluded. Both use the same standard hosted runner and scoped artifact
paths. Run OS-only first:

```sh
gh workflow run ci.yml --ref fix/preview-markdown-input -f native_vm=true -f native_debian13=true
```

Only after that exact source/profile passes may the separately reviewed fixed
native diagnostic add `-f native_inline_react=true`. Every fresh run repeats OS
and authentication admission before transferring its fixed payload. This is not
an arbitrary image/command selector. No actual execution is claimed by these
instructions.
