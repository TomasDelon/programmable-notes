# Shared editor/local-vault integration — 27 November 2026

This evidence concerns the pending shared ProductRoot/controller packet on top
of ad0ffca. It does **not** establish an installed Linux application, real native
OS chooser, production filesystem journey or native React security acceptance.
The native default entry remains unchanged pending safe close and installed gates.

## Executed checks

- Full `npm run check`, matching downloaded Chromium: exit0. Formatting, ESLint,
  strict TypeScript,864 unit tests,133 tooling tests,153 Chromium cases,9 Pages
  cases and4 disposable local cloud-storage cases passed. Two scanner controls
  were skipped because that process lacked PN_GITLEAKS_BIN. They subsequently ran
  explicitly with the pinned scanner:2 passed,0 skipped. The combined tooling
  coverage is135 controls; the full command alone is not labelled zero-skip.
- First full-check attempt stopped at a formatting error in native-product.test.ts.
  Formatting was corrected before the successful full rerun. A separate tooling
  rerun also lacked the scanner variable and had the same two skips; it provides
  no extra security coverage beyond the successful targeted scanner controls.
- `cargo test --manifest-path native-documents/Cargo.toml --locked`:91 passed,
  0 failed,7 ignored. One is a worker invoked by its owning process-contention
  test. Four require own-child ptrace/crash injection, and two require dedicated
  disposable small tmpfs fixtures. Those six specialized cases were not executed
  in this run. Backend tests are separate from Tauri GUI/runtime acceptance.
- Independent source review found no Important/Critical issue in the inactive
  frontend packet. It confirmed real shared UI consumption, canonical session
  publication, stale callback retirement, exact recovery receipts and deliberate
  aggregate-close refusal. This is a code review, not a native runtime test.

Local logs are ignored because raw tool output is not a public evidence format.
The named commands and source-controlled tests reproduce the checks.

## Controlled real-browser witness

The trusted fixture in tests/fixtures/product-browser mounts the actual
ProductRoot, nativeProduct and NativeWorkspace with synthetic OS ports. Its
revision-checked storage is in memory. Run from the repository root:

```sh
npm ci
npm run prepare:runtime
npx playwright install chromium
node scripts/test-product-browser.mjs .cache/product-browser.png
```

Use PLAYWRIGHT_BROWSERS_PATH when the matching browser is installed outside its
default cache. The runner owns an ephemeral loopback Vite server and isolated
optimizer cache; it never mounts the product through an application route or
changes an entry point. Its screenshots and JSON results stay in ignored .cache.
The frozen runner exited0 with nine checkpoints: Source and Preview caret edits,
undo/redo in both modes, session-preserving switching, untouched mixed-MDX bytes,
fresh-session close/reopen, blocked-write retention and external-writer CAS refusal.
It also checks no literal numeric entity is visible after typing, a mode roundtrip
and fresh reopen. Normal Preview and blocked-write screenshots were captured.
Native filesystem and native runtime results remain marked not-tested.

Development observations are preserved in the task log: an initial cold/shared
optimizer caused startup/input timeouts; the runner now isolates its cache and
waits for actual UI. A save-label assertion and expanded mode-picker helper were
corrected to match actual controls. These failures were not application fixes.

A literal-byte assertion also exposed existing deliberate Markdown serialization:
a newly typed trailing space becomes a numeric whitespace reference so reparsing
does not trim it. Subsequent text currently retains that reference. This does not
alone establish visible corruption. The witness requires ordinary visible space,
no literal entity in Preview, exact surrounding source and correct reopen. Never
globally decode original user-authored entities to normalize generated ones;
any future normalization requires provenance and its own history/source tests.

## Remaining gates

The existing native boolean close command cannot safely release protection against
late draft reports. Aggregate controller admission now blocks publication and
captures late reports, but nativeProduct.prepareClose intentionally refuses final
release. The reviewed native-editor-close-handshake plan requires synchronous
clean editor detachment and a fixed editor-only native request/commit protocol.
No close-success or corrected-installer claim follows from this packet.

Native React still has intermittent startup/keyboard failures and lacks the full
repeatable interaction/containment matrix. See the separate native-inline fixture
evidence, including failed run45964414560. Rename/move/Trash, continuous external
observation, signed updates and installed shared-root acceptance remain separate.

## Later prerequisite and viewport verification

The next full check passed873 unit,140 tooling with zero skips,153 Chromium,
9 Pages and4 local cloud cases. Eleven pure Rust close-state cases passed. Hosted
run46003547608 on97d3aab passed native-check, including actual Tauri headless
Documents/close/update tests and optimized package build. This is not actual
native IPC, OS-close input or installed local-vault acceptance.

Expanding the controlled browser journey to768px and390px reproduced a genuine
pointer failure: the mode picker's invisible hit area intercepted the drawer's
Close button. Open drawer controls now stack above that hit area. The same
ordinary-click regression passed at all three widths with ten total checkpoints;
no force click or event bypass is used. Screenshots wait for the drawer to leave
the viewport and are whitelisted individually in CI artifacts. These are viewport
checks in Chromium, not mobile hardware/touch or Linux WebKitGTK acceptance.
An initial final-check attempt stopped at a missing browser-global qualification
in the new Node test runner; that test-only lint error was corrected before rerun.

## Frontend close integration

A later frontend check passed956 unit,140 tooling/zero skips,153 Chromium,
9 Pages and4 local cloud cases with format/lint/types/build. Independent source
review found no Important/Critical issue in the bounded close integration.
The expanded browser runner passed13 checkpoints: active DOM composition refuses
close without replacing the owner; commit refusal plus exact cancel remounts the
same session/history; a fresh isolated page's held commit retires real editor DOM
input and cannot publish/write or reopen after its validated acknowledgement.
The latter page is a fresh synthetic-memory fixture, not a native restart test.

The fixture uses the real negotiated transport decoder, model, controller and
React editor under StrictMode. Native close records/OS requests and revision-CAS
storage are injected. Physical IME, native IPC, actual window destruction and
native-file durability remain not-tested in this browser record. The packaged
entry remains unchanged until bootstrap/fatal lifecycle and installed acceptance.

## Combined close/bootstrap and child-guard foundation

After the fixed close transport, model, Root and window-lifetime bootstrap were
frozen, `npm run check` exited0:966 unit,143 tooling with zero skips,153 Chromium,
9 Pages and4 disposable local cloud cases, plus formatting/lint/types/build.
`npm run test:product:browser` separately exited0 with13 checkpoints. The new
close checkpoints dispatch DOM composition events and synthetic native replies;
they establish neither physical IME behavior nor actual native IPC/window close.

The inactive bootstrap captures bindings before awaits, preloads presentation,
negotiates once and retains one model. A permanent fatal latch prevents new close
resolutions and survives React retry; already dispatched commits remain uncertain.
There is no reload, legacy fallback or fabricated clean-close action. The default
native entry has not been switched by this foundation packet.

Native child WebKit guards now precede authored iframe assignment, including
security probes without a payload. File chooser, permission, print, fullscreen
and script-dialog handling are denied/suppressed by native handlers. Publication
checks exact trusted location and sandbox again at actual JavaScript execution.
Three Node tests execute the fixed publication template, and six direct Rust
tests exercise one-shot activation. Rust formatting passed. These do not execute
GTK signals. Hosted compilation and real Linux chooser/dialog/Stop/expiry tests
remain separate requirements; no observed exploit or native readiness is claimed.
The inline Wry host is a separate path and is not validated by this child change.

Hosted CI [run46016023081](https://github.com/TomasDelon/programmable-notes/actions/runs/46016023081)
on41091f3 subsequently passed both required jobs: real GTK compilation, optimized
package inspection, native headless tests, real Store autosave harness and the
shared Chromium witness. Browser screenshots/results are downloadable as
[playwright-results](https://github.com/TomasDelon/programmable-notes/actions/runs/46016023081/artifacts/15205968992).
That package still predates the shared native entry candidate; do not present it
as the corrected installed UI. No actual GTK signal or installed journey follows
from these successful build/headless jobs.

## Shared native entry candidate and regression feedback

The first candidate `npm run check` exited1 after973 unit and143 tooling cases
passed:150 Chromium cases passed and3 old native-entry cases failed. Those cases
still mocked the rejected manual-save shell and omitted guard/vault negotiation.
Pages/cloud gates were not reached in that failed command. The fixtures were
migrated to the actual entry and scoped grant/revision autosave rather than
restoring the rejected shell or deleting fidelity/security coverage.

The migrated browser cases then exposed a real chrome-focus history regression:
Ctrl/Shift/Z outside an editor relied on browser contenteditable history. A trusted
app-only fallback now invokes the existing canonical editor commands, excludes
forms/editors/dialogs and refuses stale selection, pending or closing state.
Synthetic key events cannot authorize source changes. The same targeted three
cases then passed, including exact BOM/CRLF/JSX bytes, scoped revisions, document
switch/close/reopen, no browser database or preview iframe, React unavailability
and responsive two-mode navigation. Independent source review found no Important
issue. These remain Chromium tests with simulated IPC, not actual native I/O.

The optional-hosting tooling run first failed its APT regression control because
the expected-job inventory omitted the new job. That inventory now includes the
job, so removing its source setup is detected. The complete tooling suite then
passed150 cases with zero skips. The real Store/controller autosave harness also
exited0 locally: exact bytes/permissions, coalescing, history, restart, external
conflict and lost acknowledgement. Its chooser is synthetic; no GUI/create or
physical input acceptance follows from that harness.

The final frozen candidate `npm run check` exited0:973 unit,150 tooling with zero
skips,153 Chromium,9 Pages and4 disposable local cloud cases passed, together with
format/lint/types/build. The separate shared-root browser journey again exited0
with13 checkpoints. These local gates apply to the shared-entry/hosted-witness
packet; native GUI and React containment remain unexecuted by these commands.

The reviewed hosted witness verifies successful check/native-check jobs for the
exact same repository/branch/head, then checks the package source tree, hash and
production inspector before installation. A fresh ordinary desktop account cannot
sudo and receives a clean environment, authenticated X display and existing WebKit
sandbox. Fixed receipts/screenshots are collected; missing evidence, forced app
cleanup or residual app/WebKit actors fail. No private provisioner, credential
share, paid runner, release or isolation bypass is introduced.
