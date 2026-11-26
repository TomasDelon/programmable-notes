# ADR-036: Private guest preparation and OS admission

Status: real image preparation verified; guest OS admission and native application
acceptance remain separate execution gates.

## Context

The discarded native fixture exposed a disposable controller key through a host
share. ADR-035 supplies the fixed share-free launcher, but does not build images,
authenticate transfers or prove that a guest booted. The managed development host
also lacks host QEMU and package-install privileges. A standard public Ubuntu
GitHub runner can provide host QEMU without a paid runner or service.

## Decision

Use three explicit development commands, without a general VM service:

1. Preparation creates a fresh private root, a host-only controller key and exactly
   three public build-context files. Capture immutable bytes after validating the
   context and matching its public key to the private key through trusted keygen.
2. Packing builds the pinned Ubuntu recipe, configures fresh guest server identity
   in a newly created container, and streams its filesystem into a mount-free,
   network-isolated packing container. Only fixed boot files, the sparse raw disk
   and the public server key leave that assembly. Private controller material
   never enters Docker. Publish launch configuration only after validation and
   successful cleanup of the newly recorded Docker resources.
3. OS admission uses the existing owned launcher and fixed SSH commands with strict
   identity pinning and forwarding disabled. Before any authored payload, verify
   the complete bounded mount/key inputs, systemd, cgroup availability and expected
   account. Bracket wrong-key and wrong-pin refusals with successful probes. Normal
   powerdown and the exact successful launcher exit are required for success.

Source files, script arguments, Docker socket and SSH operations are fixed. No
arbitrary command/payload interface or owner credential input is added. Docker's
host client retains its configured registry/proxy/certificate trust; fresh
network-isolated containers explicitly receive empty proxy settings. Mutable
BuildX state belongs to a separate private task directory, not HOME or the public
context. Failed new roots remain incomplete rather than being overwritten.

The manual-only CI mode uses a standard Ubuntu runner and a separate per-run
concurrency group. Mixed dispatch inputs refuse before checkout. It does not also
run ordinary application builds, merge, release or deploy. Upload only the
sanitized OS-admission receipt, never images, auth roots or client state.

## Evidence and limits

The [dated evidence](../security-evidence/2026-11-27-vm-provisioning/README.md)
records actual Docker preparation, artifact hashes, sparse allocation and the
remaining runtime gates. Host Docker client location and read-only BuildX state
failures were observed and corrected without changing sandbox policy.

The guest account is a synthetic unprivileged fixture account; root SSH is
disabled. The same-UID trusted host is outside this fixture's adversary model.
No source review, mocked process test or image hash establishes installed GUI,
native IPC denial, inline React input, Stop, resource containment or recovery.
The rejected native interface is not promoted by this decision.
