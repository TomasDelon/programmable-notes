# Current portable review refresh

The dated PR-accessible ZIP now contains frontend source from 94e6b15, including
unapplied-input protection, ordinary leading-BOM mappings and trusted save keys.
The source/dependency/handoff paths were clean relative to that revision before
assembly. Delivery-tool changes do not change the frontend. Exact archive size
and SHA-256 are in `raw/archive.json` and [download instructions](../../demo/README.md).
This is the requested browser review artifact, not a native installer, public
release or deployed site. The draft PR stays draft.

The new recording asserts disabled Save/selection while inline text is unapplied,
explicit validated apply, real Counter interaction, exact MDX download, responsive
Source/Split/Visual at three sizes, independent New note and actual Ctrl+S export.
Final repository checks passed formatting, lint, strict types, 56 unit and 26
Chromium tests. Full asset/capture hashes bind the successful recording. Screenshots and WebM are
included; earlier three-surface screenshots are explicitly labeled historical.

Clean extraction to a fresh directory and an owned ephemeral loopback Python
server passed real React, focused new note, trusted-key exact export, pending
protection, offline recompilation after initial loading, and a BOM/CRLF/opaque JSX
visual edit with exact exported bytes. No source checkout/runtime build dependency
is used by the extracted app. This is not a cold-start browser-offline/PWA claim.
Manifest/CRC and all eight intended rejection cases passed again. Read-only review
found no important issue; complete-build receipts and path guards remain intact.

Run after a fresh build and capture:

```sh
python3 scripts/package-review-demo.py
PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium \
  python3 scripts/verify-review-demo.py --browser
```

Hosted CI executes the same commands when account billing allows runner startup.
A new hosted upload or green job is not claimed. Current package-specific native
keyboard, pending-input and source-preservation evidence stays separate. Earlier
native blank-preview recovery, physical GPU/Wayland and distribution-security
review remain outside this browser artifact's claims.
