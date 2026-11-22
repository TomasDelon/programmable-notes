# Production Linux desktop testing design

The user authorized autonomous Milestone 3 implementation on `feat/mdx-react-engine` from `0275bdc`; PR #1 stays draft. No release publication, merge, visual editing, custom syntax, AI or Git synchronization.

## Approach and scope

Keep React/CodeMirror, the worker compiler, Tauri 2 and the existing separate systemd preview. Native persistence uses editor-only Rust commands and native OS dialogs, with opaque per-file grants. A generic filesystem plugin with broad path scopes would enlarge authority unnecessarily; a folder-wide workspace service would add unrequested scope. Debian packaging is the first target because it installs the executable and system dependencies predictably. AppImage/Flatpak are deferred rather than quietly disabling namespaces or introducing an untested filesystem boundary.

These are engineering defaults chosen under the user's autonomy instruction, not additional user requirements. The goal is serious Linux desktop testing, not a claim that arbitrary compromised WebKit native code is fully contained.

## Persistence boundary

Native picker selection is the only path-authorization entry point. No renderer IPC accepts an arbitrary filesystem path. Opening explicitly selected Markdown/MDX and existing supported source-module extensions returns bounded UTF-8 source, logical paths, random opaque IDs and revisions. No neighboring files are loaded automatically. Existing browser upload/download behavior remains.

A small independently tested Rust store owns grants. Linux directory descriptors anchor the selected parent; no-follow, nonblocking regular-file opens reject symlinks/devices/FIFOs. Saves accept only a grant ID, expected revision and bounded text. They detect changed inode/content before writing; use an exclusive random temporary file in the same anchored directory, preserve permissions/group/extended attributes, sync file data, atomically rename, then sync the directory. Failed precommit writes preserve the old file; postcommit durability uncertainty is reported distinctly. Noncooperating same-user races between final conflict check and rename are documented, not promised solved by advisory locking.

The frontend retains dirty source on cancellation/error/conflict, supports Save As and explicit reopen, and prevents accidental dirty replacement/close. Native window close asks for confirmation when source is dirty. Filesystem operations run outside the WebKit and async executor threads; preview Stop has its own independent supervisor state. Preview processes receive neither grants nor document-store state, and every document command repeats editor/child authorization beyond generated ACL checks. Native dialog plugin IPC receives no capability grant.

## Security review and packaging

Audit generated capability scopes, handler guards, iframe/CSP/navigation behavior, environment inheritance, cgroup verification/lifetime, and the two-file Wry fork. Preserve all existing resource limits and native-child automation=false. Concrete weaknesses get regression tests before fixes. Inherited debugger/sandbox-disable/injection environment must not silently weaken production children. Do not claim GPU, hardened AppArmor profiles or arbitrary native exploit containment without real evidence.

Build an optimized embedded-asset Linux executable and `.deb`, without `security-test`. Add desktop metadata/icon and only required dependencies. Validate package contents, installation, native launch, real picker/open/edit/atomic save/reopen, error recovery, shutdown and child cleanup. Keep artifacts local/test attachments or CI artifacts; do not publish a public release.

Production IPC tests may launch the **same installed release executable** as `--preview-child` with fixed stdin through an external trusted wrapper for direct WebDriver ACL/profile tests. That direct probe is not resource evidence. Actual supervised production children must still force automation off; their resource/React tests use external AT-SPI. This replaces reliance on security-test CLI shells without adding production testing permissions.

## Evidence and completion

Use disposable Ubuntu VMs with real systemd, user buses, delegated cgroup v2, authenticated graphics and enabled user namespaces. Software-renderer options may change rendering, never sandboxing. Exercise hardened profiles and hardware GPU only where infrastructure supports them; record exact blockers and reproduction steps otherwise. Retain versions, flags, hashes, journals, cgroup observations, failures and successful retries. CI builds/packages/tests are separate from actual native runtime evidence.

Acceptance: meaningful store unit/security tests, frontend integration and unchanged browser regressions, installed production-package editing/persistence, actual production IPC denial, and repeated relevant CPU/OOM/Stop/expiry/recovery tests. Push only verified work; clearly record any remaining blocker. Next milestone remains gated by the results, not assumed release readiness.
