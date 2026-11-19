# Current engine browser review delivery

Application source 54c41a7 (shipping frontend unchanged from 368dd95). The earlier
engine 34dc906 archive/receipt remain pinned at their historical commit; this
record does not overwrite their provenance. Delivery-tool changes add real
Source-navigation and dense-readonly scenes/exports, without product changes.

The actual recording exercised all earlier counter/paragraph/newnote/dirtysibling/
longinput/literal+multilinequote/mode/responsive cases. It then expanded opaque JSX,
used trusted Show in Source, waited for actual focus and exported unchanged bytes.
A 100 KB dense document displayed one exact escaped read-only block, no text-edit
controls and the explicit fallback, then exported exact source. Two screenshots
and two actual exports were added. A navigation export intentionally duplicates
the already-edited quote document's bytes.

## Executed verification

- Full repository check:88 unit / 34 system Chromium tests, format/lint/strict types/fresh build.
- Recording and clean-extracted browser checks used matching Chromium 159.0.8154.6.
  Extracted app passed all old cases plus Source focus/unchanged export and dense
  readonly/exact export. Its Source check does not independently prove caret offset;
  the existing full e2e test proves offset using actual insertion and byte exports.
- Strict packager accepted the current receipt/build/producer hash, complete asset
  and capture manifest, portable paths and CRC. All nine malformed controls refused
  wrong/missing/extra assets, capture/producer changes, unsafe paths, symlink and
  failed recording. Negatives start from a valid positive baseline.
- The clean-extracted local-file HTML actually played a 27.64-second, 1440 × 1000 video,
  decoded frames with no error and loaded all 20 embedded images. The archive has
  23 PNG files, seven actual MDX exports and 40 entries total.
- ZIP 10,984,209 bytes; SHA256
  `0d802c849718fa6ab5e36c3a1e8af69ffe42ab0d58743e54061bc8404e1cea26`.

Formatting required a second pass and lint rejected new unscoped document globals;
both were fixed before recording, without disabling checks. Static review caught
hidden-details role-button counting; details now expand before counting. Source
focus explicitly waits for the React effect. No remaining Important/Critical
review finding. Old generated capture cache was preserved. New receipts are in
this distinct directory; the earlier current-review capture remains unchanged.

Native scope remains package 6878294f… / ELF 6e301bce…: full editing/recovery/IPC passed;
the latest complete six-case resource command exited1 (5 passed, additional
resident-page requiredOOM cause missing). Earlier renderer SIGSEGV and startup/
blank failures remain. No fresh native test, public release or security readiness
is inferred from browser media. Hosted CI remains separately blocked before steps
by account billing. PR #1 remains draft. See docs/demo/README.md for the current
portable download, local serving instructions and historical immutable link.

Delivery16e8a3a is pushed. Actual remote Git blob34ce65cf… matched every one of
the10,984,209 bytes and SHA2560d802c84…; its Git blob object hash also matched.
The README download is now pinned to that immutable delivery. Raw base64 response
remains ignored locally; only the concise verification receipt is versioned.
