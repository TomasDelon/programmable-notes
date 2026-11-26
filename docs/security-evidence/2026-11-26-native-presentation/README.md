# Native product presentation correction — 26 November 2026

## Delivery defect and correction

The owner installed the 0.1.1 testing package and observed the historical engine
interface plus an automatically opened child window. That observation was valid:
`EditorEntry` selected `App` with the legacy stylesheet for every Tauri launch.
Backend tests and compilation had not established product presentation parity.

Version **0.1.2** adds the current product presentation to the native controller:
the existing typography/styles, document canvas, navigation and shared live
Markdown/math editor. Native Preview is the initial mode. Choosing Split explicitly
starts the separate supervised React child. Settings retains native file/recovery/
update authority. No browser workspace database or iframe transport is substituted.
See [ADR024](../../decisions/ADR-024-native-product-presentation.md).

## Executed local validation

`npm run check` completed successfully at `3b9cf7d` with the pinned Node/npm and Chromium:

| Gate                                                    | Observed result          |
| ------------------------------------------------------- | ------------------------ |
| Formatting, ESLint, strict TypeScript, production build | Passed                   |
| Unit tests                                              | 637 passed               |
| Tooling, with pinned credential scanner available       | 84 passed; zero skips    |
| Production Chromium interaction/security cases          | 150 passed; zero retries |
| Built local Pages policy/browser cases                  | 9 passed                 |
| Inactive-cloud local workerd/D1 acceptance              | 4 passed                 |

The keyboard follow-up restores canonical undo/redo when focus is on a native
control outside the editor. Its new unit regression failed before the correction.
On the corrected inputs, formatting/lint/TypeScript/build and **all 638 unit tests**
passed. The three updated native-entry interaction cases passed again in pinned
Chromium (10.3 seconds) and pinned WebKit/WPE (13.5 seconds), with zero retries or
skips. The remaining browser/storage paths have unchanged relevant behavior; their
earlier results are retained rather than represented as a second full local run.
WebKit/WPE uses the retained library-path wrapper for the pinned browser, with no
sandbox workaround. It is not an installed Tauri/WebKitGTK observation.

The three new browser cases enter through the actual native routing decision with
synthetic IPC, then exercise Preview and Source typing, keyboard/toolbar undo/redo,
opaque save revisions, exact BOM/CRLF/import/JSX/comment bytes, switching, reopening,
Settings and explicit preview startup. They assert **zero IndexedDB opens and zero
iframes**. Default/edited desktop, tablet and mobile PNGs are captured as Playwright
attachments; footer geometry checks prohibit document overlap. Successful PR CI now
uploads `playwright-results` too, so screenshots are downloadable.

These are browser-native-adapter tests. They do **not** verify native dialogs,
actual disk writes, WebKitGTK launch, PackageKit or process containment.

Regression work retained failing witnesses before correction: canonical undo could
leave stale rendered text; native's old compiler rejected valid Welcome mathematics;
hover/click and clipping made the mode picker unreliable; the save indicator
overlapped mobile text. The full suite additionally caught a late-input retention
regression in the first freshness fix. Its existing assertion was preserved:
queued edits remain attached to their original file and never overwrite the newly
selected file. Focused document/settings tests passed 22/22 after correction.

Native math uses the shared compiler transforms and the generated MathML with
system rendering. Font, network, frame and worker CSP directives remain `'none'`.
No IPC permission, cgroup limit, namespace requirement or sandbox switch changed.
Independent review found no blocking authority expansion or source-state defect.

Native notice generation passed: 346 third-party Cargo packages, 227 embedded npm
packages, 17 Rust legal resources; notice SHA-256 remains
`22c389b80810875502248084d47c7c4427517acc783b99e28088c89ba79508cd`.

## Packaged acceptance and limits

The hosted native job must build and inspect the optimized **0.1.2** Debian
package, run its native/recovery controls and upload `linux-amd64-testing` before
delivery is claimed. The draft PR records the actual run, final conclusion and
artifact link. [Installation instructions](../../LINUX_LOCAL_EDITOR.md) require
checking `build.json` and `SHA256SUMS`; the earlier 0.1.1 interface is superseded.

This cloud workspace has no suitable installed WebKitGTK full-system desktop.
The owner's earlier screenshot proves neither this replacement's installed GUI
behavior nor its sandbox acceptance. Repeat the production native contract on a
compatible disposable Linux desktop; never disable isolation for compatibility.
The older `native-fidelity.mjs` selectors target the former interface and need
adaptation before certifying this surface. Historical results remain historical.

React remains in a separate window in Split, with the existing expiry/resource
policy. Browser-only attachment/Trash storage is not silently adopted. Appearance
is in memory. The real-key signed update channel is still inactive; a no-key
testing package cannot be activated remotely. Cloud activation stays paused. No
public release, merge or production-security-readiness claim accompanies this work.
