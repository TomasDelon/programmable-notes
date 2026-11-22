# Safe source selection and repeated filenames

Base `bc9a21d`. Selecting an unknown or closed key could invalidate the selected
source/entry while their files were absent. Hook tests reproduced this using an
old callback after closing a source. Empty and inherited names also changed the
workspace. Selection now checks `Object.hasOwn` inside the functional updater
against the latest workspace; invalid values leave the entire state unchanged.
This is defensive state validation, not a demonstrated untrusted-preview escape.

Separately opened same-named files had identical visible choices. Real Chromium
reproduced two identical labels. Options now include current list positions,
while their actual values, source keys, native grants and histories stay intact.
Positions can change after closing a source; they are not persistent identities.
No source transformation, native API, grammar or aesthetic redesign was added.

## Executed verification

- Two hook regressions first failed, then all seven browser-document hook tests
  passed. Real repeated-name browser regression failed at duplicate labels, then
  passed independent selection/editing, exact BOM/Unicode/CRLF/LF exports,
  pending-input protection, separate Undo/Redo and closing/reopening one copy
  without changing the other. An initial fixture DOM-typing error was corrected
  before semantic reproduction; typechecking was not disabled.
- Full check passed formatting, lint, strict types, fresh production build,
  **90 unit tests and 35 Chromium tests**. A second formatting pass was required
  before that final successful command; the earlier failure is retained.
- Installed production fidelity command exited0 with every prior flag plus
  `--same-names`. Two real picker-authorized `repeat.mdx` files in separate
  directories had distinct visible choices. Both buffers were edited with actual
  end/space keys, saved independently and compared byte-for-byte after each
  Save/Undo/Redo. Both retained mode `0640` and acknowledged Reopen. Native selection
  is operated by the external Root DOM driver; text input uses actual X keys.
  Unchanged Reopen does not independently prove external-change reloading.
- The same full command then passed dense fallback, actual React counter,
  unchanged save, modes, quotes, mixed endings, direct Source navigation,
  dirty-close Cancel/OK, actual restart, explicit unsaved recovery, invalid-data
  rejection/deletion and original preservation. No old gate was skipped.
- Read-only review found no Important/Critical issue. All 150 shipping source,
  config, vendor, lock and default-fixture files match the builder. Fidelity/GTK
  helper hashes match host/guest. Source parity is not a hermetic-build claim.

Independent IPC also exited0 on this exact installed ELF: Root positive controls,
production private network/automation-off/NoNewPrivileges/effective fixed limits/
Stop, separate preview ACL denials for document/recovery/preview commands, absent
privileged plugins, real Counter2 and DOM/storage/HTTP/file CSP refusal. This is
not a malicious-pressure matrix.

## Exact package and reproduction

Debian SHA256 `63c795d7b42c2f4da973f0f38b5bce6e0f81813f39396e3963fd4696227b1816`,
6,827,646 bytes; installed ELF
`4c0ab98090c5c52097abcb81532ef3979d754e22605d819e4740608e7609abf3`.
Optimized production package inspection passed; no security-test API was enabled.
Fidelity observer `2399a54d99f4f40e827ebf525353741c0dfa72230cf86e334bc1d68430192013`.
Disposable Ubuntu 24.04 QEMU TCG, WebKitGTK 2.52.6, real systemd/cgroupv2,
ordinary authenticated Xvfb/Openbox and documented software-rendering flags.

Follow `docs/LINUX_DESKTOP_TESTING.md`, then use a fresh fixture:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation --visual-budget --same-names
```

The previous complete malicious matrix retains its own ELF 6e301bce scope and
5-pass/1-failed additional OOM result. This UI-only change does not claim a new
complete pressure run. Native renderer SIGSEGV and intermittent startup/blank
failures remain unresolved. The verified downloadable browser review still binds
engine 54c41a7; its earlier labels are not relabelled as this change. No public
release, merge, production security readiness or PR readiness change is implied.
