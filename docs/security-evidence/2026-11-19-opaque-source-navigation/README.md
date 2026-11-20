# Opaque Visual blocks: trusted Source navigation

Base `ca9909768c5ddd2a1e9d3db8301c2036ab4218dc`, with the application changes
in this commit. This is separate from the earlier compiler-diagnostic navigation
in `2026-11-19-source-navigation`. The design prototype remains reference only.

Expanded opaque blocks offer **Show in Source**. The trusted editor passes a
parser-owned raw offset and captured full source. App verifies selected document
identity/revision; CodeMirror independently verifies its source and safe offset,
then focuses the corresponding caret. Navigation changes no bytes, undo history,
file grant or runtime artifact. Pending inline text and busy operations block it.
JSX remains escaped read-only text. No preview message or native API exposes it.

## Executed verification

- Missing-action unit and actual browser tests first failed; final focused unit
  tests passed. Read-only implementation review found no Important/Critical issue.
- `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium npm run check` passed:
  formatting, lint, strict types, fresh production build, **77 unit /32 browser**.
  The new real browser case covers BOM/CRLF/mixed LF/emoji/U+2028, exact exports,
  exact caret insertion, Undo/Redo, keyboard activation, pending-text protection,
  inert JSX, forged preview messages and React state retained across navigation.
- Native-policy **7** and native-documents **36** ordinary Rust tests passed;
  **4 ignored fault tests were not rerun here**. All three Rust format checks
  passed. Tauri's test-feature navigation-boundary test passed (**1**); that is a
  separate unit-test scope from the production binary below.
- Installed optimized package full fidelity command exited0, with
  `--mixed-eol --quotes --multiline-quotes --source-navigation`. It retained all
  earlier counter, unchanged save, modes, quote, paragraph/list, dirty-close,
  actual restart, explicit unsaved restoration, invalid-data/delete and original
  file protection gates. The new case rejected unsafe inline text, verified the
  disabled Source action, cancelled with actual Escape, navigated from trusted
  Root UI and inserted an actual keyboard space at the exact JSX start. Save,
  Undo/Redo and disk comparisons retained unrelated bytes and mode0640.

The independent native IPC suite also exited0 on that installed ELF. Production
private-network/no-new-privileges/automation-off observations, effective fixed
limits and Stop passed separately from the automated child ACL probes. All native
document/recovery/preview commands were denied from preview, privileged plugins
were absent, real Counter2 worked and DOM/storage plus HTTP/file CSP denial passed.
This does not replace malicious pressure/lifetime acceptance.

## Exact production artifact and environment

- Debian SHA256 `2002734b418d961aaf81caaa147f44f9e092cbfc31e4f697fe35b00f87b3b97f`;
  6,827,260 bytes. Package inspection passed, optimized/no test-feature CLI.
- Installed ELF `46f65e87ad853e0147fcbce28037b16a671e4f31d75f123b5a9a49f2e8794846`.
- Fidelity observer `efedc5c1edbaea623615c4d2a0f15e0dc0fb94eb39506cdd2d27e4851e4cd3a4`.
- External GTK dialog driver `9fb7305b21012ebe35a5bdbecb75326dcbabddf191666c5a6d754627f14ba5ca`.
- Disposable Ubuntu24.04 QEMU TCG, real systemd/cgroupv2, WebKitGTK2.52.6,
  authenticated Xvfb/Openbox, documented software-rendering settings.
- All150 shipping source/config/vendor/lock/default-fixture files match builder
  hashes. Host/builder changed-source and host/guest observer hashes are retained.
  This is source parity, not a hermetic/reproducible binary-build claim.

Reproduce with the installed package, external native WebDriver and a disposable
profile using the prerequisites in `docs/LINUX_DESKTOP_TESTING.md`:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation
```

Raw logs retain red/green, full checks, Rust scope, native acceptance and exact
artifact/source hashes. Initial package inspection used a nonexistent script
name and therefore did not inspect a package; the corrected existing
`verify-linux-package.mjs` command passed. No application/test gate changed.

## Limits

This is no new full malicious-pressure matrix, long-document crash repair,
physical GPU/Wayland/IME validation or production security-readiness claim.
Earlier native SIGSEGV, intermittent blank/startup and memory-before-expiry
acceptance failures remain unresolved. Hosted CI at baseca99097 was refused before
any runner steps because of account billing; the actual annotation is retained.
The downloadable browser review still binds engine34dc906, not this new action.
