# ADR023: Local Linux folders and signed Debian updates

Historical implementation note, 26 November 2026: the owner's later setup answers
require automatic writes to real local-vault files and a coherent shared product.
The manual-save workflow and separate native product described here do not define
the current UX target. Security/file-integrity mechanisms and signed-update policy
remain evidence to assess for reuse. See [PRODUCT_CONTRACT](../PRODUCT_CONTRACT.md)
and [ARCHITECTURE_TARGET](../ARCHITECTURE_TARGET.md).

Status: implementation/testing; installed GUI and live update delivery require
their own evidence. Cloud storage activation is paused by the owner.

## Local notes

The native application continues through App/useDocuments/NativePreview. It does
not adopt the browser workspace or its iframe runtime. An explicitly selected
local folder is a source repository, compatible with an independently managed
Git repository without running Git commands or introducing synchronization.

`open_notes_folder` takes no renderer pathname. The OS chooser supplies authority.
The Rust walker pins descriptors, opens every component without following links,
and reads only supported regular UTF-8 source files. Logical module names remain
relative to the selected root. Publication of the batch is all-or-nothing; failed
limits, special files, symlinks and read failures leave existing grants intact.
The root and nested directory descriptors remain anchored across rename/replacement.
Existing save/reopen code retains byte fidelity, revisions, mode/ACL preservation,
conflict checks and atomic replacement.

Retain the current 32-source/8MiB total/500,000-byte per-source limits. The walk
also bounds entries, depth and path length and skips declared dependency/VCS
directories. Larger libraries require lazy cataloguing later; never silently omit
sources to fit. This version reselects the folder after restart. Persisting only
a pathname would not establish authority over a replacement directory. New notes
continue through explicit native Save As; no silent filesystem writes are added.

Visual mode reuses the owning rendered Markdown/math editor with React execution
disabled there. Unapplied attempts use native recovery and keep navigation guards.
Native React continues only in its separate supervised preview in Split mode;
frame-src, preview capabilities and resource/namespace enforcement are unchanged.

## Distribution and updates

Keep `.deb` and `/usr/bin/programmable-notes`: the package installs the existing
path-specific AppArmor policy. Switching to AppImage would change that boundary
and needs independently validated policy/bootstrap work. Browser service-worker
updates do not update a native executable.

Use the official pinned Tauri updater for strict version-bound artifact signatures
and a separate bounded fixed-origin transport/policy layer. The JSON feed is not
signed: require the artifact's signed trusted-comment version to equal the
advertised newer version. Reject downgrades, foreign locations, redirects, wrong
architecture/format, oversized responses, expired/replayed grants, wrong keys and
tampered bytes. Recheck actual installed package version/configured status around
installation, including upgrades performed outside the running process.

Use the stable system PackageKit API with graphical Polkit authorization. Do not
call the stock updater installer with its password-dialog/terminal-sudo fallbacks.
No password, command, package URL or installation path comes from a renderer.
Only editor-authorized commands can consume one-use opaque native update tickets.
The trusted editor freezes input synchronously and acknowledges native dirty/busy
state; Rust independently checks pending operations and installation state.
Document-operation reservations and update exclusion use sequentially consistent
atomics. Preview startup checks exclusion while holding its supervisor lock.
Stop preview before replacing the executable.

Active installation blocks ordinary window close. Confirmed installation locks
the old UI until ordinary close/reopen. Unconfirmed privileged completion also
retains the source/operation lock, persists its staged package if still needed,
and never reports success or starts another install. Once the installation call
returns, ordinary close is permitted; inspect the system installer before reopening
an unconfirmed update. Debian package management is not an atomic rollback promise.

## Publication and trust

No production signing key or update feed is created implicitly. A missing compile-
time public key produces a truthful disabled-channel status. Test fixture keys
are never trusted in the application. Signing-key custody/backup and an authorized
signed distribution channel must be established before enabling real updates.
An initial inspected Actions artifact provides a testing download; it expires and
is not a permanent update feed. Publishing signed packages/feed remains separate
from building, uploading an owner testing artifact, merging or a GitHub Release.

Native redistribution notices must include verified Cargo crate texts, the Wry
fork, embedded frontend/WASM notices and the exact Rust runtime notices. The
artifact upload stays behind that fail-closed inventory gate. No project license
is invented and no historical evidence is deleted.

## Acceptance boundary

Rust filesystem/policy tests, mocked frontend interactions, packaging and actual
installed WebKitGTK/PackageKit behavior are different evidence. Keep failures and
unexecuted gates visible. Stock hosted namespace/cgroup limitations do not authorize
weaker sandboxing or a claim that the installed application was validated.
