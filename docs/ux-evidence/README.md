# Unified workspace evidence

`before/` contains actual Chromium captures of `4e9ed86` at desktop 1440×1000,
tablet 820×1180 and mobile 390×844, with the old Markdown panel expanded.
They are retained as the requested comparison evidence, not build output.

The CI `playable-editor-demo` artifact includes these captures, new captures of
all three workspace modes at the same sizes, a real Playwright WebM recording,
a readable `walkthrough.html`, the saved MDX fixture and a runnable production
browser build. Download and extract the artifact; serve it over localhost HTTP.
Open `walkthrough.html` for the comparison and extract `browser-build.tar.gz`
into a separate directory to try the application. No hosted public deployment
or release is created.

Reproduce with `npm run build`, run Vite preview on port 4188, then
`node scripts/demo-editor.mjs`. The script asserts React interaction, an inline
patch and exact downloaded source bytes. Playwright's encoder is installed by
`npx playwright install chromium`; no system ffmpeg package is needed.

Local validation passed formatting, lint, strict TypeScript, 26 unit tests and
18 real Chromium tests. The suite covers three viewport sizes, React state across
mode changes, inline punctuation/multiline edits, exact CRLF downloads, reopen,
undo/redo, stale revisions, pending input, mapping failure guidance and existing
sandbox negative probes. It does not certify physical GPU/Wayland behavior or
preserve arbitrary React state across code edits. The independent demo review
was not present among the files available in this session.
