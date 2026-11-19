# Downloadable editor review

[Download the current browser review ZIP](programmable-notes-review-2026-11-19.zip?raw=true)
(10,984,209 bytes).

The application source is `54c41a7`; these delivery-tool changes do not change
its frontend. The ZIP contains a complete browser build, a 27.64-second
1440 × 1000 walkthrough, 23 PNG files (20 shown in the walkthrough), desktop/tablet/
mobile before/after modes and seven actual MDX exports. The navigation export
intentionally preserves the already-edited quote document unchanged. PR #1 stays
draft; this is a review attachment, not a public release.

Extract into a new directory. Open `walkthrough/walkthrough.html` for video and
screenshots. To use the working editor, run in `browser-build`:

```sh
python3 -m http.server 8000 --bind 127.0.0.1
```

Open <http://127.0.0.1:8000> in Chromium; Node/npm is unnecessary. Source authoring,
interactive isolated React, trusted visual Markdown edits, per-document history,
exact source exports and browser drafts are working. Enter applies visual text;
Escape cancels; Ctrl/Cmd+S exports from the trusted workspace. Unapplied text is
memory-only until applied. Source changes restart React; mode changes preserve it.

The recording also demonstrates exact multiline quote prefixes/endings, refused
structural edits with pending input retained, **Show in Source** for opaque JSX,
and a conservative dense-document read-only fallback without changing source.
The fallback is not a universal parser deadline. JSX stays opaque in the trusted
editing surface; arbitrary React reverse editing is unsupported.

SHA256: `0d802c849718fa6ab5e36c3a1e8af69ffe42ab0d58743e54061bc8404e1cea26`.

Actual clean-extracted browser checks passed the earlier editing/React/offline/
pending/history/source-fidelity cases plus Source focus/unchanged export and dense
readonly/exact export. Exact caret insertion remains covered by the repository's
end-to-end tests. Local-file playback decoded frames without error; all 20 embedded
images loaded. Full repository check passed 88 unit and 34 Chromium tests. Manifest/CRC
and nine malformed-artifact rejection controls passed. [Raw evidence and scope](../security-evidence/2026-11-19-engine54-review/README.md).

![Split workspace](desktop.png)

![Trusted navigation from opaque JSX into Source](source-navigation.png)

![Dense source stays read only with explicit Source fallback](dense-fallback.png)

![Multiline quote preserves its markers and endings](multiline-quote.png)

![Mobile Visual mode](mobile.png)

Native filesystem permissions, WebKitGTK, recovery and cgroups have separate
Linux acceptance procedures. No native installer is included. Browser CPU/memory
quotas and production security readiness are not claimed. The latest native
six-case command has five passes and one failed additional OOM gate; native
renderer/startup issues remain. [Current native evidence](../security-evidence/2026-11-19-memory-pages/README.md).

Regenerate with a fresh production build on loopback port 4188, then
`node scripts/demo-editor.mjs`, `python3 scripts/package-review-demo.py` and
`python3 scripts/verify-review-demo.py --browser`. `DEMO_URL` selects another
loopback port. CI uploads the unpacked `playable-editor-demo` when account billing
allows runners to start. In Codex Cloud, system Chromium is selected with
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; matching downloaded
Playwright uses `PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright` with the
executable override unset.

[Previous immutable engine 34dc906 review](https://github.com/TomasDelon/programmable-notes/blob/247ee9a1de67c027a032ee1ba162fd03714611ba/docs/demo/programmable-notes-review-2026-11-19.zip?raw=true)
and its [remote receipt](../security-evidence/2026-11-19-multiline-review/raw/remote-download.json)
remain historical. The current delivery gets its own immutable download receipt.
