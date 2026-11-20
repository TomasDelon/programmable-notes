# Embedded compiler attribution

`esbuild-wasm` includes compiled Go code. Its npm package's root MIT license
covers esbuild; that file alone does not provide Go's redistribution notices.
The generated browser notice asset therefore appends the accompanying Go texts.

The installed `0.28.2` WASM build information reports `go1.26.5`, GOOS js,
GOARCH wasm and no external dependency module entries. The JSON pins the exact
WASM SHA256, installed package version, Go version and combined notice SHA256.
The historical browser review's WASM was independently verified byte-identical.
Git attributes preserve the pinned notice bytes during CRLF checkout conversion;
this is an integrity rule, not proof that Windows native behavior was tested.

The combined file preserves official Go root LICENSE/PATENTS plus the standard
library vendor and Boring license/patent files at that tag: eleven files fetched
from the official GitHub repository and checked against their Git blob hashes.
This is a source-license superset, not a claim that every listed component is
linked into the WASM. Compiler/test-only vendor trees are outside that inventory.
No project open-source license or native Rust attribution completeness is implied.

When changing the compiler, inspect actual embedded Go build information and
upstream license changes, retain the new official texts/provenance, then update
the pins. Do not merely update a failed hash to silence the check. Run:

```sh
npm run prepare:notices
npm run test:tooling
npm run build
```

Demo packaging also requires the complete pinned embedded notice text. Retain the
browser notice asset when redistributing the historical demo; keep prototype font
notices and native binary attribution separate. See `docs/PUBLIC_READINESS.md`.
