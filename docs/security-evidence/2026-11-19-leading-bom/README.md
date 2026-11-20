# Leading-BOM source mapping

Base 5578131. The MDX parser strips a leading U+FEFF before assigning offsets.
For ordinary BOM documents this shifted every source span by one UTF-16 unit,
so strict source comparisons conservatively rejected visual mappings. Six unit
fixtures reproduced the gap before the fix: paragraphs, ATX, Setext, lists,
imports first and JSX first. Raw red/green outputs are retained.

Only private parser input now replaces that first unit with a blank line. This
preserves original offsets without indenting imports or JSX. Mapping consumers
use offsets, not the private line numbers. The original source remains the cache
key, compiler input and patch target. Runtime grammar and all source bytes remain
unchanged. Existing metadata masking, full revision/span/context checks and opaque
component handling stay in place. Read-only review found no important issue.

## Executed validation

- Formatting, ESLint, strict types, 56 unit and 25 Chromium tests passed.
- Six explicit fixtures preserve complete expected BOM/LF/CRLF source, markers,
  comments, imports and nested JSX. Shifted/forged source ranges are rejected.
- Real browser MDX/React with a leading BOM and first-line import reached Count 1.
  Visual paragraph editing, exact original/updated download, Undo/Redo, reopening
  and renewed Counter interaction passed. Only the intended paragraph changed.
- Optimized production Debian package built, installed and passed actual ordinary
  BOM paragraph editing, pending guards, real native dirty-close/Cancel, exact
  Save/Undo/Redo/Reopen, mode 0640 and clean exit. Preview was explicitly stopped
  for this functional native runner; no new native React/resource matrix claimed.

Ubuntu 24.04.5/WebKitGTK 2.52.6, disposable QEMU TCG/Xvfb desktop and documented
software rendering. Debian SHA-256:
`331588fe47c2e4a8c12801ada0aa05b8b5eb2859cf1dff5b0f350a1439a4446d`.
Installed ELF SHA-256:
`b4e8dfd235016d1a667adfcee71e23559243d7733729d18d2317937f56f378ec`.
Final builder/source hashes matched. An initial copy raced formatting; normalized
source was resynchronized and rebuilt before installation/acceptance.

Reproduce normal checks with `npm run check`. With installed native prerequisites,
a disposable empty profile and a fresh generated fixture environment:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-pending-edit.mjs --leading-bom
```

Native IPC/policy denial passed on the immediately preceding guard package; its
hash/scope are recorded separately. No capability, sandbox or resource limit
changed here. Hosted startup remains billing-blocked, and earlier native blank
startup/recovery is unresolved. This does not certify hardware GPU/Wayland,
power-loss durability or production security readiness.
