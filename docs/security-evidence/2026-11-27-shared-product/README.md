# Shared editor/local-vault integration — 27 November 2026

This evidence concerns the pending shared ProductRoot/controller packet on top
of ad0ffca. It does **not** establish an installed Linux application, real native
OS chooser, production filesystem journey or native React security acceptance.
The native default entry remains unchanged pending safe close and installed gates.

## Executed checks

- Full `npm run check`, matching downloaded Chromium: exit0. Formatting, ESLint,
  strict TypeScript,864 unit tests,133 tooling tests,153 Chromium cases,9 Pages
  cases and4 disposable local cloud-storage cases passed. Two scanner controls
  were skipped because that process lacked PN_GITLEAKS_BIN. They subsequently ran
  explicitly with the pinned scanner:2 passed,0 skipped. The combined tooling
  coverage is135 controls; the full command alone is not labelled zero-skip.
- First full-check attempt stopped at a formatting error in native-product.test.ts.
  Formatting was corrected before the successful full rerun. A separate tooling
  rerun also lacked the scanner variable and had the same two skips; it provides
  no extra security coverage beyond the successful targeted scanner controls.
- `cargo test --manifest-path native-documents/Cargo.toml --locked`:91 passed,
  0 failed,7 ignored. One is a worker invoked by its owning process-contention
  test. Four require own-child ptrace/crash injection, and two require dedicated
  disposable small tmpfs fixtures. Those six specialized cases were not executed
  in this run. Backend tests are separate from Tauri GUI/runtime acceptance.
- Independent source review found no Important/Critical issue in the inactive
  frontend packet. It confirmed real shared UI consumption, canonical session
  publication, stale callback retirement, exact recovery receipts and deliberate
  aggregate-close refusal. This is a code review, not a native runtime test.

Local logs are ignored because raw tool output is not a public evidence format.
The named commands and source-controlled tests reproduce the checks.

## Controlled real-browser witness

The trusted fixture in tests/fixtures/product-browser mounts the actual
ProductRoot, nativeProduct and NativeWorkspace with synthetic OS ports. Its
revision-checked storage is in memory. Run from the repository root:

```sh
npm ci
npm run prepare:runtime
npx playwright install chromium
node scripts/test-product-browser.mjs .cache/product-browser.png
```

Use PLAYWRIGHT_BROWSERS_PATH when the matching browser is installed outside its
default cache. The runner owns an ephemeral loopback Vite server and isolated
optimizer cache; it never mounts the product through an application route or
changes an entry point. Its screenshots and JSON results stay in ignored .cache.
Native filesystem and native runtime results must remain marked not-tested.

Development observations are preserved in the task log: an initial cold/shared
optimizer caused startup/input timeouts; the runner now isolates its cache and
waits for actual UI. A save-label assertion and expanded mode-picker helper were
corrected to match actual controls. These failures were not application fixes.

A literal-byte assertion also exposed existing deliberate Markdown serialization:
a newly typed trailing space becomes a numeric whitespace reference so reparsing
does not trim it. Subsequent text currently retains that reference. This does not
alone establish visible corruption. The witness requires ordinary visible space,
no literal entity in Preview, exact surrounding source and correct reopen. Never
globally decode original user-authored entities to normalize generated ones;
any future normalization requires provenance and its own history/source tests.

## Remaining gates

The existing native boolean close command cannot safely release protection against
late draft reports. Aggregate controller admission now blocks publication and
captures late reports, but nativeProduct.prepareClose intentionally refuses final
release. The reviewed native-editor-close-handshake plan requires synchronous
clean editor detachment and a fixed editor-only native request/commit protocol.
No close-success or corrected-installer claim follows from this packet.

Native React still has intermittent startup/keyboard failures and lacks the full
repeatable interaction/containment matrix. See the separate native-inline fixture
evidence, including failed run45964414560. Rename/move/Trash, continuous external
observation, signed updates and installed shared-root acceptance remain separate.
