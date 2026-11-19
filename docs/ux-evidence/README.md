# Unified workspace evidence

[Current downloadable browser review](../demo/README.md) includes the working
production build, a WebM recording, before/after screenshots in all three modes
at desktop 1440×1000, tablet 820×1180 and mobile 390×844, plus actual saved MDX.
It also demonstrates a new note without replacing the original lesson. This
PR-accessible ZIP is available while Actions cannot start because of billing.

`before/` retains real captures of 4e9ed86 with the former three-surface layout.
No design-reference prototype replaced the application. The current screenshots
come from actual Playwright interactions with the source-preserving editor.

Current CI's `playable-editor-demo` artifact will contain `browser-build/`,
`walkthrough/`, a README and checksummed manifest. Extract it, open
`walkthrough/walkthrough.html`, or serve `browser-build` over loopback HTTP.
Earlier artifacts used `browser-build.tar.gz`; their included README remains
applicable to those historical downloads.

Reproduce with `npm run build`, serve the build on port 4188, run
`node scripts/demo-editor.mjs`, `python3 scripts/package-review-demo.py`, then
`python3 scripts/verify-review-demo.py --browser`. The verifier uses a clean
extraction and its own ephemeral HTTP server. Set the documented Chromium and
encoder-cache variables when using the cloud's installed binaries.

Executed local checks passed 45 unit / 23 Chromium tests, exact source saves,
new-note/sibling histories and eight artifact integrity/path negatives. Native
results remain separate; physical GPU/Wayland and arbitrary React state across
executable edits are not certified by a browser recording.

[Last green hosted demo for 438f4b4](https://github.com/TomasDelon/programmable-notes/actions/runs/44430453610/artifacts/14486761171)
remains a historical verified upload. This cloud's artifact re-download returns
HTTP 403. Current PR review ZIP validation and exact scope are retained in the
[dated delivery evidence](../security-evidence/2026-11-19-review-demo/README.md).
