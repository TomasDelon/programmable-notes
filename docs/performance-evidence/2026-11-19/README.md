# Bounded mapping reuse

A 5,000-paragraph CRLF document (198,888 UTF-8 bytes) exercised initial range and
block mapping, no-op, a checked middle-paragraph patch and remapping. Every run
asserted exact bytes and counts. On Node 24.22.1 in this cloud, the five warm-run
median decreased from **786.64 ms to 328.15 ms** (58%). Cold samples were 1,762.48
and 624.64 ms. Raw samples include matching source hashes; these observations are
not a hardware-independent threshold or a native GUI frame-time claim.

Reproduce with `node scripts/benchmark-markdown.mjs`. For the baseline use
`src/editor/markdownEdits.ts` from `83d1e4a` with the same benchmark script.
No CI timing assertion was added.

Only one successful AST is retained, keyed by the entire source string, bounded
by the existing 500,000-code-unit public entry limits. Invalid parses are not
cached. Ranges and blocks are recreated for every caller, so presentation data
cannot mutate the retained AST. Original range, revision, context and candidate
round-trip checks still run. There is no result cache keyed merely by offsets,
no document history cache, and no document execution or authority change.

The regression exercises caller mutation, same-length changed source, malformed
source between calls, rejected candidates and subsequent valid patches. The
existing exact-byte browser and native source-preservation tests remain required.
Large documents still incur an initial synchronous parse and DOM cost; this
bounded reuse does not claim to eliminate all long tasks or guarantee smoothness
at the source limit.

## Executed acceptance

Full checks passed formatting, lint, strict TypeScript, 40 unit and 19 Chromium
tests. All six policy tests passed. The installed optimized production package
(deb `ac03a1a27d9ced5c5aedceed05065a1504a4e65da7e863c0c74c1878316a85e4`,
ELF `db94d324fe6efc390508eee43d02108a751634d0ac79f92d339034aeecf3f120`)
passed actual React interaction, unchanged BOM/CRLF save, three workspace modes,
inline heading/multiline/list edits, exact disk bytes/mode 0640, undo/redo, dirty
close cancellation, restart/reopen, explicit recovery and invalid-draft deletion.
Raw logs retain exact scope. This is not a fresh complete CPU/OOM/expiry matrix.

A fresh upstream Wry provenance fetch failed DNS (`EAI_AGAIN` on static.crates.io);
the network escalation was cancelled. No pass is inferred. The fork is unchanged
and its preceding hosted CI verification passed for `438f4b4`. Hosted runners
for the next head remain blocked by the separate account billing limitation.
