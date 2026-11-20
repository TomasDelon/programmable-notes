# Current source-status browser review delivery — 2026-11-19

The [PR-accessible ZIP](../../demo/README.md) now contains the committed frontend
from f61163f, including selected-document save status and dirty-sibling protection.
The prior 405ebc4 archive remains available at its immutable GitHub link; its old
hash is not applied to this new archive.

- ZIP: 6,626,776 bytes, 29 entries.
- SHA-256: `82446e3f0cdf9fe0c6ae89a4dbeb2dd723dbae2d21c080985f6311fbe3c2d64d`.
- Complete runnable browser build, WebM, walkthrough HTML, responsive before/after
  Source/Split/Visual screenshots, native-independent exact saved lesson/new note,
  current source-status screenshot and manifest/capture receipt.
- Actual capture passed React interaction, inline pending guard and exact patch,
  mode switching at desktop/tablet/mobile sizes, New note, exact Ctrl+S export,
  clean lesson while another note is dirty and retained sibling source.
- Clean extracted-build browser probe passed actual React, focused new note,
  keyboard export, offline recompilation after initial load, pending protection,
  BOM/CRLF/opaque JSX exact bytes and separate selected/sibling status.
- Complete build/capture hashes and ZIP CRC verified. Eight deliberate packaging
  negatives rejected changed/missing/extra assets, changed captures, unsafe paths,
  symlinks and failed captures. No validation predicate was relaxed.

This is a browser review attachment, not a native installer or public site/release.
Native saves, Linux recovery, IPC and resource observations remain separate in the
[installed status evidence](../2026-11-19-document-status/README.md). No browser hard
CPU/memory budget, cold offline/PWA support or production security readiness claim.

Hosted runner startup remains blocked by account billing; this source attachment
keeps the demo reviewable without relying on a new Actions artifact. See the
linked instructions for local loopback serving without Node/npm.

Actual pushed GitHub source Blob re-download also matched all 6,626,776 bytes
and SHA-256 above (delivery commit 164cb4e, blob
d62f26ba00abe09e8952a91e89939829c256c7e1). Receipt is retained in raw.
