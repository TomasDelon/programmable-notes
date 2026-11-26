# ADR-030: editor-only vault service

Date: 26 November 2026. Status: implemented service; GUI/ACL acceptance pending.
Requirements: DATA-01/02, SECURITY-01; supports A03/A04/A10.

Expose the reviewed retained-root inventory, selective opening and no-replace
creation through four narrow Tauri commands. `choose_vault` invokes an OS folder
picker without a renderer-supplied root path. Other commands accept an unpredictable
vault-session token and validated relative paths. Display paths are labels only.
The existing Store and save/reopen/close grants stay authoritative; do not add a
second document store or generic filesystem plugin.

Every handler first checks the authoritative editor window label, non-child mode
and editor-managed document state. Only editor ACL grants are generated. Preview
capabilities stay empty, and the preview process has no Documents state.

An Arc-backed session captures admitted operations before asynchronous work.
Replacing the selected vault invalidates its token for new admissions, while an
already admitted operation remains scoped to its captured root and returns that
origin token. Existing document grants survive selection changes. Picker
cancellation changes nothing. Operation/dialog reservations live through blocking
work and prevent close/update from racing an abandoned frontend promise; no
Store lock is held during the picker.

The typed frontend binding transports opaque identities and exact source. It is
not imported into the runtime. Its mocked tests do not establish native security.
The actual WebDriver probe now requires editor-side domain refusals for forged
vault tokens before checking preview denial; unknown-command/ACL errors cannot
pass as registration. Chooser-positive acceptance still needs an actual dialog.

No shared UI route or autosave controller is activated here. A lost creation
reply can leave a real created file; later reconciliation must inventory/reopen
rather than blindly overwrite, delete or retry. Proactive filesystem watching,
rename/move/Trash and source-session integration remain separate work. Actual
Linux/WebKitGTK chooser/ACL behavior is unverified by this service's compilation
and backend tests; preserve that delivery gate.
