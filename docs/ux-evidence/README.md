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

Verified hosted demo for `e0689a9`: [download the complete browser/demo artifact](https://github.com/TomasDelon/programmable-notes/actions/runs/44363697100/artifacts/14454384093).
The corresponding `check` job passed, including the recording script. Artifacts
expire after 30 days; a fresh CI run regenerates them. Native acceptance and IPC
results for the optimized installed app are recorded in the
[dated Linux evidence](../security-evidence/2026-11-18-unified-ux/README.md).

Latest pre-billing-block demo: [`438f4b4` browser build, screenshots and walkthrough](https://github.com/TomasDelon/programmable-notes/actions/runs/44430453610/artifacts/14486761171).
The check job including recording/upload passed; artifact metadata reports it
unexpired. Artifact download from this cloud returns HTTP 403, so a successful
re-download is not claimed. Subsequent hosted jobs are blocked before startup by
account billing; current local/native checks are in IMPLEMENTATION_STATUS.md.
