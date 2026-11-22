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

## Web mathematics packages

The published `remark-math@6.0.0` and `rehype-katex@7.0.1` tarballs omit their
monorepo's root license. `REMARK_MATH_LICENSE.txt` preserves the complete, identical
upstream MIT text at the packages' npm registry `gitHead` revisions:

- [remark-math 6.0.0, d5d0660](https://github.com/remarkjs/remark-math/blob/d5d0660b150810a535bbb07eac6cc96a4510aa24/license).
- [rehype-katex 7.0.1, 88a9497](https://github.com/remarkjs/remark-math/blob/88a9497e1ede93b958237c85edbf5651faeca7af/license).

Both files have Git blob `ea3803784aa58da6fa7cd6e196948608def87bf9` and SHA256
`cb992262f361a5359e6771c28740d33c7041e15332ae8537fae40538992591a9`.
The notice generator accepts this sidecar only for those exact package/version
pairs, checks its bytes, and still rejects unrecognized missing license texts.
The generated notices also include the installed KaTeX, DM Sans and Lucide texts.
