# P2 mixed-source fidelity

Actual optimized installed package (no test features), ordinary user in the same
disposable Ubuntu 24.04.5 / WebKitGTK 2.52.6 VM, Xvfb/Openbox and supported software
rendering. No preview sandbox/capability/resource change.

Package SHA-256: `9c6a3ff6ca5df01fd5700e9dc3cca4f587f74baa266c7630112b4583e31a1472`.
Installed ELF SHA-256: `33e90d64bf3636ddea68bb96cf6a37e0b66ff356630f00fae1447c7c97ac7862`.
The runtime input hashes and producer logs are under `raw/`.

The installed app opened synthetic mixed MDX with BOM, CRLF, Unicode metadata,
imports, React state/event code, headings, paragraphs, lists, nested JSX,
comments and a TSX fence. Its actual supervised preview rendered a button and
responded to a real accessibility click. A no-op Save preserved every byte.
Visual mode excluded metadata/fenced code from editable spans. Heading and
multiline paragraph patches, undo/redo and exact disk saves preserved unrelated
bytes and mode 0640. Stop, close cancellation, real process restart, reopen,
legacy recovery restoration, invalid UTF-8 refusal and deletion also passed.
Automatic recovery is explicitly paused for this manual visual-editing suite;
P1 automatic acceptance is recorded separately.

Repository checks passed 39 unit and 19 Chromium tests. New cases cover a
Unicode/metadata/fence/JSX document, no-op download, body edit, exact undo/redo,
stale full-source revision rejection after a metadata-only change, and reopening.
Review caught two initial guard bugs: ordinary prose between two rules and
U+2028/U+2029 acting as JS multiline regex boundaries. Physical LF/CRLF scanning
and a mapping-header heuristic fixed both, with regressions retained.

The first native observer searched static text with a button-only accessibility
helper and failed. The fixture now contains a genuine React button and verifies
its click-driven state change, retaining the static JSX too. An intermediate
harness syntax error ran no application test; it is retained separately. Neither
failure was resolved by changing production permissions or removing byte checks.

This protects YAML-style mapping prefixes in the trusted editing surface only;
metadata is not parsed, executed, exported or stripped by the MDX runtime. Other
unsupported structures remain source-only. This is not general YAML metadata
support, native IME certification, machine power-loss evidence or fresh resource
pressure testing.

Reproduce with the base native prerequisites, the installed production binary,
a fresh external fixture env and an initially empty legacy recovery slot:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs
```
