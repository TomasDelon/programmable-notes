# Verified portable browser review delivery

The requested current demo is retained in `docs/demo` as a PR-accessible download.
Its ZIP is a browser testing artifact, not a native installer or public release.
No public site was deployed. Unpacked build/test caches stay ignored. It was
assembled from frontend source at d955aae; the current delivery changes are tests,
packaging and documentation. Exact size/hash is in raw/archive.json and the linked
download README.

## Executed validation

- Formatting, ESLint, TypeScript, 45 unit and 23 actual Chromium tests passed.
- The recording asserted actual React interaction, source-preserving inline
  editing, exact saved lesson bytes, three modes at three sizes, a new note and
  retention of the first lesson. The capture receipt is written only after
  recording/browser cleanup succeeds; it binds the full asset tree and output
  allowlist. The served index must match the production build.
- A clean extraction, plain Python loopback HTTP server and fresh Chromium
  context passed Counter interaction, new-note focus, exact download and offline
  recompilation. It uses no original build workspace at runtime.
- Manifest and CRC verification passed. A valid current-input baseline is
  required before eight negative cases. Rejection must match the intended reason
  and create no ZIP: changed capture, changed existing asset with unchanged index,
  missing asset, extra asset, backslash traversal, Windows dot/space path,
  symlink and failed receipt.

Review caught two initial packager gaps before publication: index-only build
validation accepted a changed JS asset, and Linux path handling accepted a literal
backslash filename unsafe for portable extraction. Both were reproduced and
fixed. Assembly now compares the complete build-file hash map and an exact capture
allowlist; canonical portable names, regular files and root containment are
required. Read-only review confirmed both fixes. No unverified ZIP was published.

The final full-run repetition also exposed an incorrect CRLF fixture: contenteditable
fill normalized line endings before note creation in three of five diagnostic
runs, while every before/after switch preserved its actual bytes. The corrected
fixture imports a real CRLF file, verifies its baseline, makes an unsaved edit and
retains the same exact-byte preservation assertions. It passed five repetitions
and the full suite. Source fidelity checks were not relaxed.

The first local recording used the wrong default encoder-cache location; selecting
the already installed writable Playwright cache resolved it without a download.
Port 4188 was occupied, so recording used 4189. A prior static-server process was
not inspectable inside the current sandbox; it was left untouched. The automated
portable verifier now owns an ephemeral in-process loopback server and shuts it
down, avoiding shared-port/process-identity ambiguity.

## CI and limits

CI now records, assembles, verifies negative fixtures, cleanly extracts and runs
the portable browser probe before uploading `playable-editor-demo`. Those commands
ran locally; a hosted execution is not claimed. Account payment/spending-limit
annotations continue to prevent hosted jobs from starting. The last green hosted
head remains 438f4b4. The dated PR attachment provides current review access while
that infrastructure is unavailable.

No Windows runtime/extraction, physical GPU, Wayland, new complete native resource
matrix or production security readiness is claimed. Native focus, IPC, persistence
and remaining blank-startup failures retain their separate package-specific evidence.
