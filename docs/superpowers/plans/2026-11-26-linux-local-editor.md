# Linux local editor and signed updates

The owner paused cloud storage and requested a downloadable Linux application
using a local notes repository and a Settings update button. The Cloudflare API
probe was cancelled; no account, database, login, key or deployment was changed.
Preserve the inactive cloud implementation/research without activating it.

**Outcome:** install a Debian testing build, explicitly choose a local notes
folder, edit/save real source, and use a trusted Settings update flow.
**Invariants:** descriptor-based filesystem authorization, exact source bytes,
atomic saves/revisions/recovery, unprivileged supervised React, no passwords in
the app, no paid services, no merge or unauthorized public release.
**Witness:** real Rust filesystem/signed-update regressions, shared editor tests,
production package build/inspection and downloadable owner testing artifact.
Installed GUI and PackageKit/Polkit observations remain separate requirements.
**Done:** verified changes and draft PR evidence; identify rather than conceal
any runtime, signing, publication or distribution prerequisite.

## Architecture

Keep the native App/useDocuments/NativePreview boundary. A local repository means
ordinary supported source files in an OS-selected directory, compatible with Git
without requiring Git commands or a browser database. Add a bounded, all-or-nothing
folder grant using pinned descriptors and nofollow traversal. Existing saves,
Save As, revisions, close protection and native recovery remain authoritative.
First implementation reselects the folder after restart; a remembered pathname
alone cannot authorize a replacement directory. Existing 32-source/8MiB/500KB
limits stay explicit. Larger collections need later lazy loading.

Retain .deb because its fixed executable path carries the existing AppArmor
profile. Use the official updater's strict version-bound signature verification,
but a GUI-only PackageKit/Polkit installation adapter. Do not use password-prompt
or terminal-sudo fallbacks. Only Rust/editor-authorized opaque update handles may
install. Freeze editing, check dirty/pending/operation state and stop preview first.
The package manager can fail; do not claim atomic rollback or installed success.

Production signing keys and a signed distribution feed are not configured by a
test fixture. Initial owner testing can use a GitHub Actions artifact. Publishing
an update feed/package is a distinct action under the owner's prior no-public-
release boundary; prepare concrete artifacts and tests before that final decision.

## Tasks and ownership

- [ ] Folder worker: anchored walker/select-at/store opening, OS picker command,
      ACL registration, cleanup, limits and actual filesystem tests.
- [ ] UI worker: native folder adoption/navigation, Settings, guarded update
      actions and shared literal-only Visual editor; no browser-runtime iframe.
- [ ] Update worker: pure policy/transport/PackageKit crate, strict official
      signature verification and native caller/operation guards; no publication.
- [ ] Notices worker: complete fail-closed Rust license text inventory and tests,
      preserving exact upstream provenance; no invented license.
- [ ] Root: native command/state registration, packaging/notice integration,
      CI artifact delivery, full checks, package evidence and draft PR updates.
- [ ] Root: report installed GUI/security/update gaps precisely; never substitute
      Chromium or compilation for WebKitGTK/PackageKit/runtime verification.

## Deferred

Cloud activation and credentials, Git synchronization, arbitrary native paths,
community plugins, large-library loading, watchers and destructive file actions.
No AppImage switch without independently validated sandbox policy integration.
