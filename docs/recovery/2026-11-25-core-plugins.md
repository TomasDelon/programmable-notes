# Core plugins and forgiving LaTeX verification — 25 November 2026

## Changes and authority

The web workspace introduces bundled Mathematics/React core modules and validated
persistent settings. Executable setup is hidden by default; an explicit setting
shows escaped ordinary code alongside live components. No setup disclosure/edit
buttons remain. Disabling React terminates isolated execution; disabling math
keeps literal dollar source. No community loader or new document permissions.

Invalid closed LaTeX is saved as editable red source without notices or a global
write barrier. Only unsafe delimiters, stale revisions or ambiguous source patches
retain the existing explicit recovery guard. See ADR 015.

## Reproduced failures and corrections

- The original malformed-TeX browser regression reproduced the global editing
  lock. TeX validity now affects presentation, not source-write authorization.
- Invalid focused fields lost their red feedback; activation retains validation.
- Runtime preference refresh and offset-only updates detached a formula's click
  target. Presentation refresh now avoids replacing unchanged targets.
- Disabled mathematical compilation originally let TeX braces become executable
  MDX expressions. Keeping the parser active while converting math to literal AST
  text fixes this. BOM-prefixed source exposed a separate offset mismatch; source
  presentation now accounts for the parser's BOM removal.
- Independent review reproduced invisible setup deletion with boundary Backspace.
  Hidden-source transactions now protect the original atoms. Select All replacement
  retains edge setup; interleaved hidden code refuses safely with recoverable text.
  Native browser selection over hidden atoms can collapse; editor-owned text input
  honors the actual document selection instead.
- Mobile Settings initially overflowed the 390px viewport; responsive wrapping
  fixed the failing real geometry/keyboard regression.
- An intermediate full run passed 109 Chromium cases and failed a moving-equation
  interaction. Another passed 111 and failed an iframe-transition assertion.
  These are failed checkpoints, not final passing gates. The latter now explicitly
  waits for actual old-island cleanup before addressing full-document execution.

## Executed checks

Targeted Chromium regressions passed after the fixes, including actual React
interaction, setting persistence, exact BOM/CRLF export, malformed formulas,
correction/reload, hidden-source Backspace and Select All replacement, canonical
undo/redo, interleaved hidden-comment refusal and React-disabled deletion.
The final local `npm run check` exited **0**: **359 unit cases /45 files,
14 tooling (zero skips), 116 Chromium cases and 6 Pages-policy browser cases**
passed, with format/lint/strict TypeScript/fresh production build. The Pages
fingerprint is `f5c1e68720ba977f`, 77 assets. This used Node 24.22.1, npm 11.9.0,
system Chromium, two workers and the pinned scanner via `PN_GITLEAKS_BIN`.
Full-history/archive secret scans found zero findings before this checkpoint.
The independent read-only follow-up found the hidden-source issue closed and no
further concrete security/semantics findings, including the full-document invalid
math transform. It did not run tests.

Hosted cross-browser results and actual deployment are pending at this checkpoint.

## Reproduction and limitations

Run `npm ci`, then `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check`
with the system browser available, or use the ordinary Playwright-installed browser.
The optional `editing_qa` workflow repeats interaction regressions three times in
Chromium, Firefox and WebKit with zero retries. `deployment_url` runs acceptance
against an actual Pages origin. Keep output/artifacts separate from source data.

Native `/engine` GUI and physical Android keyboards were not executed here.
No native runtime security readiness, community-plugin support, arbitrary JSX
reverse editing or component-state persistence is claimed. Source visibility in
full-document execution can rebuild its shared runtime and reset temporary state.
