# Downloadable editor review

[Download the working review ZIP](programmable-notes-review-2026-11-19.zip?raw=true)
(6,461,629 bytes).

This dated ZIP is the requested PR-accessible review attachment while hosted
Actions refuses jobs because of account billing. It contains a complete browser
build, a recorded walkthrough, before/after screenshots at desktop/tablet/mobile
sizes and both actual saved MDX files. The source application is from `94e6b15`;
these delivery-tool changes do not change its frontend. The PR remains draft.

Extract into a new directory. Open `walkthrough/walkthrough.html` for the video
and screenshots. To use the editor, open a terminal in `browser-build` and run:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000> in Chromium. Node/npm is unnecessary for this packaged
browser build. Browser Save exports an MDX download. Focus Source, Visual or the toolbar and
use Ctrl/Cmd+S. In Visual mode, Enter applies and Escape cancels; apply pending
text before saving. Unapplied text is memory-only until applied. Native file permissions,
WebKitGTK, recovery and cgroups have separate Linux acceptance procedures.
Browser CPU/memory quotas and production security readiness are not claimed.

SHA-256: `f92c9930bcb91156a0dc6a510b3c96ab46affac3aa116d8b1c3a07d22cebe93e`

The clean extracted package passed real React interaction, a new focused note,
exact keyboard-exported bytes, protected unapplied text, BOM/CRLF/opaque JSX
preservation and offline recompilation after initial loading. Final repository checks passed
56 unit and 26 Chromium tests. The packager verified a complete asset/capture hash
manifest and CRC; eight negative fixtures rejected changed/missing/extra assets,
changed captures, unsafe paths, symlinks and failed recordings. The ZIP contains
its manifest and capture receipt. [Raw checks and scope](../security-evidence/2026-11-19-review-demo/README.md).

![Current Split workspace](desktop.png)

![Protected unapplied visual text](pending-edit.png)

![New note in Source mode](new-note.png)

![Mobile Visual mode](mobile.png)

Regenerate from the repository with a fresh production build, serve it on loopback
port 4188, then run `node scripts/demo-editor.mjs`,
`python3 scripts/package-review-demo.py`, and
`python3 scripts/verify-review-demo.py --browser`. In Codex Cloud set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium` and
`PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright`. `DEMO_URL` can select
another available loopback port. CI runs these checks and uploads the unpacked
package as `playable-editor-demo` when runners become available.
