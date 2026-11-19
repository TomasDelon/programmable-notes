# Current engine review download — 2026-11-19

The portable browser review now binds engine source34dc906, including strict
multiline quoted text. Recording ran actual React interaction, source/visual mode
changes, exact paragraph export, responsive desktop/tablet/mobile screenshots,
new-note/keyboard save, selected/dirty-sibling status, bounded1000-line input,
literal quote edit, multiline quote Undo/Redo and mixed-ending export, and rejected
line-count input with retained value/Save blocked/cancellation. Actual screenshots,
video and five exported MDX files are included. No interface redesign was made.

The package passed complete hash/CRC verification and nine malformed-input
controls against a current positive baseline. A clean-extracted production build
then passed real browser interaction, new-note exact keyboard export, protected
pending edits, offline compilation after loading, BOM/mixed-ending/opaque-source
exports, ambiguous-break refusal, long-input scrolling and both literal/multiline
quote editing with structural rejection. Native operations are a separate scope.
The recording and extracted test used matching Playwright159.0.8154.6.

- Size:8,540,754bytes /36 ZIP entries.
- SHA256: `ccc780298173df68c25612d56989f0560889c1f0ee58e8dc1bd6c0995cd3febb`.
- Source application: `34dc906320d1ab6630c3008d53cae7d22d1efffa`.
- [Download/instructions](../../demo/README.md) link the committed review ZIP.
- Its manifest and capture receipt bind every captured/built file and capture script.

The archive runs from a plain loopback HTTP server with no Node install. The
walkthrough opens directly as local HTML. It is a PR review artifact, not a public
release or native installer. Browser resource quotas, native filesystem access,
WebKitGTK, recovery, production isolation and physical GPU/Wayland are not verified
by it. Their current successes/failures remain linked from implementation status.

Hosted CI for exact source34dc906 refused both jobs before any steps because of
account billing/spending limits. Raw annotations are retained. Local verification
and a successful download are never substituted for a hosted CI pass. The draft
PR must remain draft, with no merge/public release/readiness change.

Final local repository check passed75unit/31browser, formatting, lint and types
with the matching browser. A producer formatting change caused the old capture
checksum to be refused without producing an archive; actual recording was rerun,
and a ninth producer-mismatch regression now preserves that guard. Preformat
receipts are explicitly historical controls, not the final downloadable bytes.
A deeper source audit matched150 tracked shipping files/configs/locks/vendor/
packaging/default fixtures and Node build metadata between host and native builder,
strengthening fd151c78… provenance; this is not a hermetic-build claim.

The clean-extracted walkthrough also played directly as local HTML in the actual
matching browser:1440×1000, 21.32s, decoded frames observed, all18
images loaded and no media error. The first6.44s recording was too fast for review;
recording-only pauses now hold verified states without changing assertions. Its
receipt is explicitly prepace; the final checksum above binds the paced version.
