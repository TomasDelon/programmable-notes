# ADR-035: Share-free native fixture launch boundary

Status: launcher and synthetic controls; end-to-end provisioning is not accepted.
Requirements: SECURITY-01. No application permission or sandbox policy changes.

## Context

The standalone React diagnostic accidentally exported its transport private key
through a writable guest share. Its functional evidence remains historical; it
does not satisfy isolation acceptance. A successor must not accept free-form QEMU
arguments or rely on a prose promise to keep credentials outside shared paths.

## Decision

Use a small Linux Python standard-library launcher with a versioned, bounded,
duplicate-key-rejecting configuration. Its only actions are check or launch.
Reject unknown fields, additional arguments and noncanonical/overlapping roots.
Require three distinct private, owned directories for guest boot inputs,
authentication and runtime outputs. Resolve every path without following links;
require owned regular files, single links, private authentication/configuration
modes and distinct inode identities. The key is checked but never read or passed
to QEMU. Boot files and the runtime directory remain descriptor-pinned.

Construct QEMU arguments internally with no argument extension hook. Use fixed
TCG, four vCPUs, 8 GiB, raw ext4 input, loopback-only SSH forwarding, restricted
user networking and explicit serial output. No host filesystem share, device
passthrough, configuration file or inherited credential environment is supplied.
The process remains owned by the launcher, with a fixed deadline, bounded output
and terminate/kill/reap on failure, interruption or expiry. Capture a process handle
before honoring signals received during spawn.

Synthetic tests invoke the real CLI against real temporary layouts; mocked launch
dispatch checks exact arguments, inherited descriptors and lifecycle. Controlled
local pipe writers test output bounds without starting QEMU or mounting anything.
Independent review must inspect these controls and the actual launch code.

## Limits and next gate

This is not a guest-image builder, SSH transfer system, general VMM sandbox or
proof of successful boot. Ownership/modes cannot establish that an image is fresh
or that a key is synthetic. Provisioning must separately establish public-key-only
installation, pinned host identity, no credential copies in any image/payload,
SSH-only transfer, reviewed actual argv/mounts and complete cleanup.

The CLI check marker means layout checks passed, not native security readiness.
No successor guest may run until that end-to-end implementation is versioned and
independently reviewed under NATIVE_SECURITY.md. Existing native functional and
security acceptance gaps remain open; the archived failed fixture is unchanged.
