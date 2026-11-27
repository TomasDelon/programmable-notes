# Installed shared-editor recovery acceptance

27 November 2026. **Proposed; not executed.** This extends A06–A07 only after the
basic packaged chooser/edit/autosave/history/close/reopen journey passes. It does
not substitute old manual-save application tests or controlled-IPC browser tests
for the current shared workspace. Follow PRODUCT_CONTRACT, NATIVE_SECURITY and
LINUX_DESKTOP_TESTING; keep native arbitrary React disabled.

## Environment and authority

Reuse the verified production package under a fresh ordinary desktop account,
clean environment and synthetic private vault. Bind source tree, package and
installed ELF hashes, observer identity, GTK/WebKit versions and actual process
identities to the receipt. Use the real owned OS chooser and physical keyboard
input. No security-test build, injected application grant, generic command or
filesystem API is permitted. File inspection and fault injection belong to the
external disposable observer, never document code.

Only touch the fresh fixture and this account's package-specific recovery store.
Reject unexpected ownership, symlinks, missing identity or ambiguous processes.
Never run against the owner's profile or documents. Preserve fixed observation
budgets and fail on missing evidence; do not use a blind delay as acceptance.

## Genuine unsaved snapshot and process interruption

1. Create a synthetic original containing BOM, mixed CRLF/LF, Unicode, comments
   and opaque JSX; record exact bytes and mode0640. Open it through the real vault
   picker and shared navigation.
2. Make only the disposable vault parent unwritable, retaining the original's
   bytes and mode. Type a fixed suffix. Require the actual application to report
   the failed original-file save and independently verify that original bytes
   remain unchanged. Existing document observation should produce the recovery
   version; do not fabricate its metadata or source. A guarded leave/close may
   exercise retention, but cannot be treated as a successful clean acknowledgement.
3. Require an integrity-valid, durably retained application-generated version
   matching the exact pending source before interruption. Record whether its
   creation preceded or followed the close request. A filename or DOM status
   alone does not prove retention.
4. Intentionally kill only the identity-checked owned application process, then
   verify descendant cleanup with PID/start identities. Keep this intentional
   fault separate from unexpected forced cleanup. If ownership or cleanup cannot
   be established, fail. Restore only fixture-directory permissions after death.

## Fresh-process restoration

1. Start a new installed process with the same disposable profile. Re-authorize
   the vault through the real chooser. Discover the actual retained version via
   the shared recovery dialog; do not restore automatically.
2. Add one synthetic corrupt sibling to the disposable recovery store only after
   the interruption. Valid versions must remain discoverable with a bounded
   warning. Compare stored version bytes before and after read-only discovery;
   discovery must not initialize, prune or rewrite the store.
3. Select the version and cancel. No file is created and the original is
   unchanged. Reopen the dialog; attempt the existing original path and require
   exclusive-create refusal without changing its bytes or permissions.
4. Choose an explicit unused vault-relative filename. Require exact restored
   source bytes, new private mode0600, unchanged original bytes/mode and preserved
   recovery versions. Type immediately into the new copy, undo/redo and compare
   actual disk bytes at each acknowledged save.
5. Close normally, require clean owned-process exit, start another fresh process,
   re-authorize and reopen the new file. Require exact final bytes. Cancellation,
   failed creation and original-file preservation must have independent checks.

## Evidence limits

Record each checkpoint separately and retain failures. A passed installed copy
journey does not prove held-read/selection-ABA race coverage, which remains scoped
to unit and controlled-port tests unless actually reproduced natively. It also
does not establish React integration, IPC/network denial or CPU/memory containment.
Unknown create acknowledgements must retain source/destination and block retry;
exercise that case separately with a reviewed fault mechanism rather than silently
calling an existing file a recovered success.
