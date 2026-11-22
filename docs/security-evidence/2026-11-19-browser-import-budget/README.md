# Browser Open: preflight workspace budgets

Baseb9a2b73. Browser Open previously enforced aggregate file/byte limits only
after reading and decoding every file in an explicit selection. A large selection
could therefore allocate far more than the bounded workspace before rejection.
This was a browser import reliability issue, not a demonstrated preview escape.

Open now checks existing workspace plus selection metadata before reading any
file:32 total files,500KB per file and8MiB total UTF8 bytes. It uses the existing
shared limits; nothing is raised. Strict UTF8/fatal decoding with retained BOM,
path/name validation and final `addDocuments(current.current, docs)` validation
still run. The latter rejects source growth during asynchronous reads without
discarding the intervening edit. Rejection never partially imports a selection.
No native command, filesystem authority, visual mapping or sandbox changed.

## Executed tests

The first three hook tests failed on actual unexpected `File.arrayBuffer` calls,
then passed metadata-only rejection of over-count/aggregate/later-oversized files
without reading any file or changing dirty buffers. Two more focused tests passed:
exact8MiB acceptance preserving BOM/Unicode/CRLF/LF; and source growth by one byte
during a stalled read, with latest-workspace rejection and newer dirty bytes kept.
The final accepted workspace retains the exact source as both buffer and original
snapshot. Read-only review found no Important/Critical issue;5 focused tests passed.

Actual Chromium regression passed zero-read count and late-oversized refusal,
unchanged selection/document count, dirty Undo/Redo, successful following import,
exact exported BOM/Unicode/mixed endings, and the retained dirty sibling indicator.
Its first attempt compared CodeMirror `innerText` against `textContent`; line
containers have different separators, so that assertion failed after actual Undo.
The corrected assertion compares `innerText` with the captured `innerText`.
Final downloaded-file assertions still compare exact bytes. The failed log remains.

Full `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check` passed:
formatting, lint, strict types, fresh production build, **83 unit /33 browser**.

## Scope and limits

This change is browser Open only; the installed native UI uses OS-picker-backed
`openNative`, not this path. No new native package/runtime test is claimed. The
preceding exact46f65e87… package retains its recorded editing/recovery/IPC and
bounded long-document observations. Native SIGSEGV/startup/blank and memory-OOM-
before-expiry acceptance remain unresolved. Hosted baseb9a2b73 run44538616415
refused both jobs before runner steps for billing; actual annotation is retained.
The downloadable review still binds engine34dc906. No production security-readiness
or public release is implied.
