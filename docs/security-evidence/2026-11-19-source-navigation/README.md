# Original-source compiler navigation

An explicit editor action opens the existing source at its original compiler line
and places the caret without changing source. The worker reports original UTF-16
offsets, with MDX physical CR/LF lines distinguished from JavaScript U+2028/U+2029.
Generated MDX JavaScript locations do not become navigation targets. Captured source
bytes and current CodeMirror bytes must match before selection. Preview messages
cannot supply these targets; navigation grants no edit or filesystem authority.

## Executed browser checks

The missing navigation action first failed a real Playwright test. An actual
esbuild probe then exposed the Unicode line-count distinction; the red regression
is retained. Final full checks passed formatting, ESLint, TypeScript, **42 unit
and 22 Chromium tests**. Browser tests cover imported TSX error navigation, exact
cursor insertion/export, undo, correction/rebuild, MDX BOM/CRLF/emoji lines,
repeated same-source navigation, JavaScript Unicode separators and forged preview
locations. The old preview assertion initially failed because Source mode hides
React output; the corrected test explicitly selects Split before checking output.

## Actual installed Linux acceptance

Built and installed an optimized production package without test features:

- deb SHA-256: `be37c69ef7d8a59428eeb3147fd651d24c151e2172c6eb52c4f94333d0f24d89`
- ELF SHA-256: `cbe2593ad8e6b34d7a447d5b67d7707a78cf0e5ee47912b5a4eca26f47a554f0`

In the disposable Ubuntu/WebKitGTK desktop, the real OS picker authorized a
synthetic BOM/CRLF/emoji MDX file (mode 0640). Compiler navigation placed the caret
at physical line 3, revealed Source mode and retained the original disk bytes.
Externally typed input was consumed completely, then explicit Save wrote exactly
the expected bytes and retained mode 0640. Undo plus explicit Save restored the
original bytes, followed by clean process exit. This run does not test JS Unicode
separators natively; that case has actual Chromium and unit evidence above.

Two failed harness attempts are retained. First, the harness stopped compilation
and forgot to request rebuilding after opening invalid MDX, so there was no error
target. Second, it requested Save before all X keyboard events were consumed and
observed the earlier `I` snapshot rather than `INSERT `. The final harness explicitly
rebuilds and verifies complete editor input before Save. No application security
check, source comparison or test assertion was removed.

Reproduce with the documented installed-app fixture environment in a disposable
profile, then:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-diagnostics.mjs
```

No runtime exception source-map composition or column navigation is claimed.
Hosted CI remains blocked before startup by account billing. Separate current
resource/startup failures are documented in the resource-repeat evidence and are
not hidden by this successful editor-feature acceptance.
