# Share-free native fixture gate

Requirements: SECURITY-01; repairs the documented test-fixture deviation.
Owner authorization: autonomous technical correction, no product decision needed.

- **Outcome:** one versioned, fail-closed launch boundary constructs only a
  share-free QEMU command from owned synthetic boot inputs; private transport
  material cannot live in the guest staging/evidence root.
- **Invariants:** no arbitrary QEMU arguments, 9p/virtiofs/host directory mounts,
  host credential/image reuse, sensitive output, production policy change or
  automatic native retry. Existing failed evidence remains unchanged.
- **Witness:** real CLI negative cases reject the old shared-root/key layout and
  unknown/share arguments before any launch. Valid isolated roots produce the
  fixed command; mocked exec verifies only that command reaches the launch boundary.
- **Done:** implementation, negative controls and independent review, then required
  project checks. No actual guest until the corrected end-to-end provisioning and
  transfer implementation is independently reviewed too.

Use a small Python standard-library module/CLI and existing counted Node tooling
harness. The configuration has explicit private guest-staging and authentication
roots, boot files and loopback SSH port; no free-form options. Validate canonical
owned mode-0700 roots, no symlinks/ambiguous overlaps, owned regular boot inputs,
private mode-0600 single-link transport key outside guest-visible staging, distinct
boot/key inode identities, and bounded scalar inputs. Capture validated inputs
once. Fixed TCG/4-vCPU/8-GiB and
loopback SSH forwarding only; no KVM/device-policy changes. Do not publish keys,
configuration values or raw process errors. The launch command is constructed by
this same checked boundary, not validated then extended by a private provisioner.

This guard cannot attest image contents, host-wide sandboxing or successful guest
boot. Guest image creation, public-key-only installation, pinned SSH host identity,
SSH-only staging/collection, end-to-end process lifetime/cleanup and actual namespace/resource
acceptance still need their own reviewed integration. Do not claim the previous
security deviation is fully runtime-validated merely because configuration tests pass.

Plan: inspect actual old boot interface; add failing CLI/layout/argument tests;
implement the minimal preflight/launch boundary; review ownership, race and output
handling; run targeted controls then final repository check. Work on shared UI
integration may proceed independently without enabling an unvalidated native runtime.
