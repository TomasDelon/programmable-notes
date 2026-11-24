# Resumed engineering audit — 23 November 2026

## Actual recovered state

Repository: `TomasDelon/programmable-notes` (public).
Main: `8516af3f9853579e7b39e215a1bcd5309be5cb6e`.
Draft [PR #6](https://github.com/TomasDelon/programmable-notes/pull/6):
`recovery/two-mode-inline-latex-20261123`, recovered at
`c3906da429b5022be871f4a93faf7dd9a6ab3c0f`.
The previous workspace was clean on `feat/mdx-react-engine` at `fff0e7e`;
that branch was preserved. Explicit remote references were fetched because the
checkout's fetch configuration mapped only remote HEAD.

The API confirmed both jobs passed in
[run 45281294302](https://github.com/TomasDelon/programmable-notes/actions/runs/45281294302)
for `c3906da`. This is actual hosted evidence for the recovered commit, not for
subsequent corrections. No deployment or merge was performed.

The recovered implementation supersedes the old web editing surfaces: exactly
Source and editable Preview, in-place dollar-delimited math and isolated React
islands. Favorites is already absent. Native `/engine` retains its separate
historical interface. Original snapshot byte identity remains unverified as
documented in the [previous review](2026-11-23-pr6-independent-review.md).

## Independent review and corrections

Inspected current instructions, status, handoff, ADR 013, recovery provenance,
canonical SourceEditor, rendered editor, math replacement validation, runtime
islands, safe rendering and existing tests. A separate read-only reviewer checked
workspace persistence/async adoption and the source bridge, then reviewed the fix.
The original research was treated as supporting material, not implementation proof.

Confirmed defects and regression evidence:

1. **Unfinished equation loss.** Enter invalid LaTeX, blur into nearby prose,
   Select All and Delete. The original transaction removed the equation NodeView
   and discarded the invalid field. A real Chromium regression failed because
   the field disappeared; a unit regression also proved programmatic insertion
   incorrectly succeeded. Document-changing transactions now refuse changes while
   an equation draft owns its NodeView and reconcile browser DOM mutations.
   Cancellation releases the guard and ordinary editing resumes. Exact exported
   BOM/CRLF/Unicode bytes remain unchanged until an authorized edit succeeds.
2. **Deferred revision remained invisible.** Receive a source revision while a
   field is open, reject the stale equation commit, then cancel. The original
   projection stayed on the old source. The new unit regression failed before the
   correction. Closing the field now triggers source reconciliation as well as
   source-prop changes. Stale commits still do not call the source apply callback.
3. **Interacting link draft.** Independent review of the new transaction guard
   identified that an already-open link form cleared its URL even when an invalid
   equation blocked submission. A regression reproduced the loss. Submission now
   retains the URL until the equation is completed or cancelled.

No concrete new IPC, filesystem, preview message-authority or async workspace
replacement defect was found within this review scope. Verified source checks
include pending-draft checks after async reads, workspace epochs around imports,
canonical revision guards, semantic projection round trips, opaque JSX/ESM,
bounded runtime messages and opaque-origin `allow-scripts` preview frames.
This is a focused review, not a comprehensive new native security certification.

## Executed verification

Node `24.22.1`, npm `11.9.0`; `npm ci` installed 429 packages.

| Command / scope                                                 | Actual result                                                                                                                    |
| --------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| Unmodified `npm run check`                                      | PASS: 270 unit, 84 Chromium tests; 8 tooling passes, 2 scanner-dependent skips                                                   |
| New regressions against unfixed behavior                        | Expected RED: insertion unit, deletion Chromium, deferred-revision unit; link retention RED during fix review                    |
| Corrected rendered editor unit suite                            | PASS: 8 tests                                                                                                                    |
| Corrected full `npm run check`                                  | PASS: 273 unit, 85 Chromium tests; formatting, ESLint, TypeScript, production build; 8 tooling passes, 2 scanner-dependent skips |
| Full history and archived-source `bash scripts/scan-secrets.sh` | PASS: zero additional findings; pinned scanner, existing exact exceptions retained                                               |

The scanner-dependent controls were rerun separately with the pinned executable:
`PN_GITLEAKS_BIN=… npm run test:tooling` passed all **10 tests, zero skips**,
including both synthetic credential-refusal controls. Raw scanner reports,
browser traces and original logs remain ignored. No sensitive values are included
here, and this scan does not remove previously documented historical privacy or
licensing questions.

### Cross-browser infrastructure failures

Matching Firefox 159 / Playwright revision 1572 and WebKit revision 2388 downloaded.
Dependency validation reported missing `libgtk-4.so.1`,
`libgraphene-1.0.so.0`, `libharfbuzz-icu.so.0`, `libmanette-0.2.so.0`,
`libhyphen.so.0` and `libGLESv2.so.2`. Package download could not resolve these
against the empty apt lists; the system dependency-install approval was cancelled.
No dependency-validation or browser sandbox setting was disabled.

A focused Firefox run had **17 launch failures**, before application interaction:
`Could not find profile folder`. One isolated retry with a workspace-local TMPDIR
failed at the same launch stage. These are not passing application tests and do
not establish a product defect. WebKit interaction was not executed locally.
Use a standard Ubuntu GitHub runner with `npx playwright install --with-deps
chromium firefox webkit`, `npm run build` and:

```sh
PN_ALL_BROWSERS=1 PLAYWRIGHT_WORKERS=2 npx playwright test \
  tests/e2e/web-live.spec.ts tests/e2e/web-rendered-editor.spec.ts
```

The next independent engineering task is reproducible opt-in hosted cross-browser
validation, avoiding a second native build merely to run browser QA.

## Release gates and continuation order

1. Verify corrections in hosted CI and focused Firefox/WebKit interaction. Add
   a real open-field/persistence-refresh integration test, beyond hook-level flags.
2. Resume native startup/renderer crash investigation on a fresh disposable
   profile and current optimized package. Historical JSC/WebKit SIGSEGV remains
   unexplained. An old successful installed ELF is not current GUI evidence.
   Re-run native file/recovery/resource/IPC acceptance against each candidate.
3. Finish distribution/native third-party attribution and obtain the owner's
   licensing and retained-document publication decisions before redistribution.
   Public visibility supplies no missing rights. Do not choose a project license.
4. Then expand safe source-preserving editing based on real daily-use failures,
   mobile/IME/selection coverage and performance measurements. Keep JSX opaque.
   Multiple tabs need design evaluation; no permanent tab bar is approved.
5. Physical GPU/Wayland testing is a compatibility gate for those targets. It
   does not block independent source fidelity or web editor reliability work.

No new native GUI/security run or production security-readiness claim is made in
this audit. No sandbox, capability, filesystem grant, dependency pin or UI design
was changed by these corrections. Unapplied fields remain memory-only; automatic
recovery stores committed source, not unfinished equation drafts. PR #6 stays
draft. Merge, deployment, license/permissions/billing changes, history rewrite
and release publication still require separate explicit authorization.

## Follow-up — 24 November

The separate draft PR #7 continued the roadmap with hosted three-engine QA,
bounded startup-oracle regression tests and actual current-package Linux work.
That work exposed and corrected a real source-whitespace defect under Tauri's
nonce policy. Installed fidelity/restart/recovery and production IPC checks have
now run; see [exact package identities, results, retained failures and current
limits](../security-evidence/2026-11-24-current-package/README.md). These later
observations do not change the historical scope of this audit or prove original
snapshot byte identity. PR #6 remains focused on equation recovery corrections.
