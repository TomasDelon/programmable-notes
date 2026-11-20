# Internal mixed line endings in visual edits — 2026-11-19

A real source-fidelity bug was reproduced: HTML textareas normalize CRLF to LF,
then the old patch code converted every replacement newline to the document's
CRLF convention. Changing one word in a mixed LF/CRLF paragraph also rewrote an
unrelated internal LF. Outside-span, no-op and source-mode byte tests did not
establish this case. No preview or native filesystem authorization issue was found.

## Change and conservative contract

The editor-owned patch keeps an existing break sequence when the newline count
is unchanged, including canonical textarea input that changes no visible text.
A normalization-only submission returns the original source and adds no undo
transaction. When counts change, equal prefix/suffix source stays exact, and an
unambiguous changed middle inherits an existing local ending (document default if
none exists). A differing-count middle with mixed old ending types is rejected.
Repeated text with shifted insert/delete alignments is also rejected if its old
ambiguity window contains different ending types. This is a bounded linear
operation; source-size, full revision, parser range/context and candidate parse
validation remain unchanged.

The policy is conservative. Some periodic multiline deletions have equivalent
safe byte results but are rejected by the mixed-window guard; use Source for those
edits. It does not promise to accept every safe text rearrangement or infer a
keystroke history from a final textarea value. On refusal, entered text stays
available, saves remain blocked until apply/cancel, and the message directs the
user to Source. JSX/imports/comments/metadata remain opaque.

## Executed red/green results

- Four initial unit cases and actual Chromium keyboard/export case failed before
  the fix. A further repeated-line insertion/deletion case failed before the
  conservative alignment guard. All focused unit cases then passed.
- Real Chromium typing now exports exact mixed paragraph bytes, retains BOM,
  Unicode/imports/comments/JSX, handles normalization-only input with no phantom
  undo step, restores exact bytes with undo/redo and keeps the React counter
  interactive. An ambiguous repeated-line edit retains its text, displays the
  refusal, blocks saving and returns to exact original bytes after Escape.
- Initial old-package native attempt failed before observing a preview service;
  it did not reach the fidelity assertion. This startup observation is retained
  and remains unexplained. No deadline, payload or security check was loosened.
- Second old-package attempt (ELF `7ef9a9c7…`) ran the actual compiled React preview
  and mode checks, then **failed on real saved disk bytes**: an expected LF became
  CRLF after editing. Full diff and actual synthetic disk source are retained.
- Final source-matched optimized package passed the entire installed fidelity
  suite with `--mixed-eol`: actual React counter, unchanged save, modes, heading
  editing/history, internal mixed-break paragraph saves/undo/redo, mode 0640,
  list edit, dirty-close Cancel/OK, actual process restart, explicit unsaved
  recovery, invalid UTF-8 draft rejection, explicit deletion and unchanged original.
- Separate installed IPC suite passed registered/recovery/plugin denials,
  Counter 2, parent DOM/storage, HTTP/file CSP denial, ordinary child private
  network/effective bounds and Stop. Automation-attached ACL probes remain
  distinct from ordinary production namespace observations.
- Full repository check passed **63 unit / 28 Chromium tests**. A final focused
  browser run also checked the added ambiguous-edit retention/escape scenario.
  Native recovery backend/source and its preceding 36-test evidence are unchanged.

## Exact native package

No `security-test` feature. Build, inspection, installation and actual execution
are retained separately:

- Debian SHA-256: `f4921d0b04f00ff31710289c05f8a03a23cb9addccb7844e8cc644e7c8c3a514`.
- Installed ELF SHA-256: `7d315faad3928befbc19c16ee8838011d8be0fc1dd121642a9dd9d2c2d4a44ff`.
- Size: 6,814,682 bytes. Source hashes match the builder.
- Executed native observer SHA-256:
  `d4967c80e2a9326f95989ec5a8c0cbcc8b4f32f119ea78eebb532add5620a853`.

Same disposable Ubuntu 24.04 full-system QEMU TCG, authenticated Xvfb/Openbox,
WebKitGTK, real systemd/cgroup v2 and supported software-renderer settings. This
is not physical GPU/Wayland, a new full pressure/expiry matrix or a production
security-readiness claim. Old intermittent startup failures and the original
immediate-allocation memory-before-expiry gate remain open.

## Reproduce

With the production package installed, external driver running, an empty legacy
recovery slot and a fresh fixture env in a disposable profile:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol
# Fresh fixture env for the independent native boundary suite:
npm run native:test
```

The flag varies the fixture and adds exact paragraph history checks; it skips no
existing fidelity/recovery gate. On missing preview startup, the runner now records
compiler status/alerts/source for diagnosis before failing. See
[Linux testing](../../LINUX_DESKTOP_TESTING.md) for environment/package prerequisites.
Raw failed and passing attempts are retained below, with only synthetic documents.
