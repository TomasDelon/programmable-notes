# Packet: editor-only native vault service

26 November 2026. DATA-01/02, SECURITY-01; supports A03/A04/A10. Not another UI.
Uses the existing Documents.store and reviewed Vault/open/create primitives.

- **Outcome:** the shared controller can select an OS-authorized vault, inventory,
  open/create actual sources and use existing save/reopen/close bindings.
- **Invariants:** authoritative editor label and non-child mode checked before
  dialog/state/IO; editor-only Tauri ACL; no absolute-path IPC, generic filesystem
  plugin, preview permission, duplicate document store or silent buffer disposal.
- **Witness:** cancellation/replacement/token/path/operation-lifecycle tests and
  explicit registered-command denial probes, distinguishing mocked transport from
  actual Linux/WebKitGTK execution. Positive editor controls must exist too.
- **Done:** narrow command/typed-adapter integration, appropriate tests/compilation
  and independent security review; actual native permission gates stay pending
  unless run. No product readiness or shared UI activation implied.

Add choose_vault (OS picker, no path argument), vault_inventory(vaultId),
open_vault_sources(vaultId, paths) and create_vault_source(vaultId, path, source).
Keep existing save_document/reopen_document/close_document. Every command calls
existing editor() first, preserving both authorize(label, Host.child) and managed
Documents checks. Register commands/permissions and grant only editor capability.
Add no preview permission or remote capability.

Keep one active Arc-backed vault session beside the existing Store. Its token
must be unpredictable and separate from file grants/editor sessions/disk CAS;
reuse the existing pinned secure entropy implementation without a new external
package. Capture the validated session before releasing its lock so admitted IO
never retargets after selection changes. Responses carry originating vault ID.
Selecting a new vault invalidates old tokens for new requests; old document grants
stay valid until explicitly closed. Cancellation changes no state.

Use existing Operation reservation and spawn_blocking. Blocking closures own their
operation/dialog guards through completion even if the UI abandons its promise.
Never hold Store mutex during a picker. Preserve close/update protection. Do not
close pending buffers merely because folder selection changes. A lost create
reply may mean a file exists; reconciliation, not blind retry or deletion.

Add typed invokes without importing them into untrusted runtime context. Extend
registered-command denial coverage to all new commands AND existing
open_notes_folder, previously omitted. Do not mistake unknown-command errors,
mocked IPC or compilation for actual permission denial. Production dialog/ACL
validation requires the documented disposable Linux environment.

## Progress

- [x] Existing authorization, operation guards, state and coverage inspected.
- [x] Implementation and targeted backend/adapter tests.
- [x] Independent review and compilation; actual native GUI/ACL gate remains unexecuted.

Executed: 8 app Rust tests in a clean Ubuntu tooling image, 79 native document
tests (7 existing ignored slots), 25 targeted TS tests and the real Store/autosave
harness passed. Independent security review found no concrete code blocker;
its missing-positive-control finding was corrected. Four probe regressions fail
when registration/ACL errors replace the expected editor domain refusal.

Runtime limitation: this outer environment has no tauri-driver, DISPLAY, user bus,
/dev/kvm or WebKitGTK development package. Container compilation supplies library
headers, not the full systemd/cgroup GUI acceptance environment. A separate bounded
VM embedding diagnostic does not test these application commands. Real chooser
cancellation/replacement and registered-command denial still need the documented
disposable Linux native run. The new WebDriver controls are prepared, not executed
native permission proof. No shared controller or product route is enabled.
