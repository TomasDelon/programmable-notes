# Product acceptance and delivery gates

These are acceptance obligations derived from [PRODUCT_CONTRACT](PRODUCT_CONTRACT.md),
not a report of passing tests. Current native product parity is **not accepted**.
The web app/code is a reference for useful behavior, not something to preserve
unchanged when incompatible with the target architecture.

## Required observable journeys

| Gate                           | Requirement | Observable witness                                                                                                                                                                                                                                                                                                                | Required scope                                         |
| ------------------------------ | ----------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------ |
| A01 Shared product             | PRODUCT-01  | Actual platform boot reaches the shared product/use cases with platform adapters; no legacy or lookalike fallback. Review dependencies, actions and candidate screens, not matching colors alone.                                                                                                                                 | Structural + interaction + independent review          |
| A02 Editing modes              | UX-01       | Source/Preview only; no Split/X. Real pointer hover, keyboard/focus and supported touch affordance work. Headings/math do not introduce independent form/Tab stops.                                                                                                                                                               | Actual UI and gesture tests                            |
| A03 Local source truth         | DATA-01     | Open a disposable vault; type one character; observe it in the real note file without pressing Save. Reload/restart and see the exact bytes. Repeat undo/redo and invalid MDX/TeX input.                                                                                                                                          | Installed Linux + actual disk                          |
| A04 Safe autosave              | DATA-01     | Rapid edits during slow writes persist the latest content; no stale acknowledgement marks newer text saved. Permission/ENOSPC/sync failures retain data and report accurately. Close flushes or clearly blocks.                                                                                                                   | Controller tests + native filesystem/error injection   |
| A05 External changes           | DATA-01     | Another process modifies the file; observation/reopen and subsequent typing do not silently overwrite that version. Both conflicting texts remain recoverable until resolution.                                                                                                                                                   | Installed Linux + independent writer                   |
| A06 Real file lifecycle        | DATA-02     | Create, rename and move actual notes/folders. Delete to recoverable Trash and restore safely with collisions and references considered. Restart preserves the intended vault context under validated authority.                                                                                                                   | Installed Linux + filesystem assertions                |
| A07 Lossless history           | EDIT-01     | Mixed BOM/CRLF/whitespace/import/comment/nested-JSX fixture; direct edits and keyboard/toolbar undo/redo preserve unrelated bytes through autosave and document switching. After restart, compare persisted bytes; persistent undo history across restarts is not required. Late callbacks stay bound to their original document. | Shared core + UI + real-file journey                   |
| A08 Mathematical text          | MATH-01     | Incomplete dollars are stable ordinary text; valid math reveals source at selection; invalid closed TeX stays raw/red locally; correction works while other writing continues. No independent field, layout jump or global error lock.                                                                                            | Real caret/input tests on supported engines            |
| A09 Inline React               | REACT-01    | In the same document/window, author a component with imports/hooks/state/events and interact with it. Definitions are hidden by default; source visibility setting works. No setup/edit-source form substitutes for it.                                                                                                           | Actual selected native renderer                        |
| A10 Runtime/source distinction | SECURITY-01 | Ordinary React button/state interaction does not change note source or files; forged messages cannot authorize editing/saving. Explicit future editing contracts have separate revision authority.                                                                                                                                | UI + negative security tests                           |
| A11 Runtime containment        | SECURITY-01 | Denied IPC/filesystem/shell/network; infinite CPU and both memory workloads contained; Stop before expiry; editor typing/disk autosave remain usable; full descendant cleanup and successful interactive recovery.                                                                                                                | Real disposable Linux process/cgroup/security evidence |
| A12 Core plugins               | PLUGIN-01   | Toggle core math/React capabilities without rewriting source or changing unrelated undo state. No community code gains privileged APIs.                                                                                                                                                                                           | Shared core + actual UI                                |
| A13 Signed updates             | UPDATE-01   | Check, authenticate artifact/version, install with OS authorization, cancel, reject tamper/downgrade, handle uncertain completion and reopen safely without lost writes.                                                                                                                                                          | Real configured distribution + installed package       |

A01–A12 define the dependable Linux editor milestone. A13 is a separate distribution
gate: complete the integration and plan, but do not publish a release/feed or claim
updates active before the required authorization, key custody and runtime evidence.
Do not hide A09/A11 failures by shipping a separate window or privileged iframe.
Recovery is verified through failure paths, not presented as the main saving model.

## Evidence and review

Map each implementation task and test to gate IDs. Define the expected result
before implementation; tests that only bless the new design are insufficient.
Review a candidate against the owner contract independently of its implementer.
Compare real actions and screens; validate the exact artifact/source/configuration.

Keep these kinds distinct: unit tests, browser interaction, mocked transport,
native backend filesystem tests, installed GUI, process-security runtime and
configured update installation. A blocked or unexecuted required gate prevents
claiming the corresponding product milestone. A green CI result or a shared
entry-point finding does not grant acceptance on its own.

The original handoff fixtures and [native security contract](NATIVE_SECURITY.md)
remain required supporting evidence. Preserve prior failures, source identities,
commands and logs. Do not increase skips, remove requirements or weaken isolation
to produce a pass. Only owner-directed product changes can amend these obligations.

## Current setup result

- Owner's six setup questions are answered and recorded in the product contract.
- Shared-entry audit can report the current native/browser divergence without
  treating informational success as product readiness.
- Subsequent development routes native startup to the shared ProductRoot with
  scoped vault autosave and guarded close. Controlled-IPC/browser tests support
  that composition; A03–A07 still require actual installed real-file witnesses.
- Native inline React remains unavailable. A09/A11 are unresolved, and no legacy
  separate-window fallback can satisfy them. File lifecycle, restart recovery
  discovery, continuous external observation and update integration remain pending.
- The setup itself did not implement or establish installed acceptance. Later
  development evidence is recorded in IMPLEMENTATION_STATUS, not inferred here.
