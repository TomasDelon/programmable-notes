# Source extension case and exact module identities

Base `40e253c`. The browser chooser accepted mixed-case MDX names, but entry
selection, compiler loaders, visual/draft eligibility and native format checks
handled them inconsistently. The real browser regression reproduced another
entry being retained instead of compiling the selected uppercase document.

Only extension classification now accepts ASCII case variants of the existing
six source formats. Full paths, logical keys, package names and import lookup
retain exact case. Open/Save As filters enumerate those same spellings. Unsupported
browser formats reject before any selected file is read. Native grants, caller
checks, snapshot integrity rules, atomic saves and preview permissions are intact.

## Executed checks

Workspace and actual browser regressions failed before implementation. Native
snapshot RED failed before the store case ran; it is not evidence of two separate
old-code failures. Both new native round trips passed afterward. An intermediate
browser attempt queried a preview hidden in Source mode; the corrected fixture
explicitly selects Split and retains that failed attempt.

The first full `npm run check` passed formatting, lint, strict types, fresh build,
94 unit tests and 36 matching Chromium tests. Full native document tests passed
39 ordinary tests; four infrastructure-specific cases remain ignored by that
ordinary command and are not counted as new passes. Historical explicit runs of
those cases retain their own evidence. Read-only review found no Critical or
Important issue; its suggested extension-only mismatch and simultaneous
case-distinct compiler fixtures were added. The final full check passed 94 unit
and 37 Chromium tests, including both additional controls. Seven native policy
tests also passed.

Browser coverage includes real typed mixed-case TSX hooks/events, visual patches,
exact BOM/Unicode/CRLF export, wrong-case import errors and recovery after fixing
the import, plus explicit uppercase-named browser draft restoration as a separate
unsaved buffer. That draft fixture is self-contained: this does not claim recovery
of an imported workspace dependency graph.

## Package and native scope

Disposable Ubuntu24.04 QEMU TCG4CPU/8GiB, WebKitGTK2.52.6, real systemd/cgroupv2,
ordinaryUID1000 authenticated Xvfb/Openbox and the documented compositing/DMABUF
software-rendering flags. No native test feature was enabled.

The optimized Debian package passed inspection and installation:

- Debian SHA256 `3c0b8347e5fbd558b925990fadfd0008993cf1c36c67fcae37681e073ba1afd2`,
  6,828,648 bytes.
- Installed ELF `ff7d4babb1f63bf2973d1bc6f6ae18652164bace5c5d7ae440260b76be220fbf`.
- All 151 shipping source/config/lock/vendor/default-fixture files match the
  builder; this is not a hermetic-build claim.
- Fidelity observer `7faebddcc934769fc46fb9d8ac9188e199f958f9607ba08643fbf695f32c5184`.

The first full native command **failed** during heading Undo after the real
mixed-case picker, React counter, unchanged BOM/CRLF save and all three modes had
passed. Repeated-name independent histories and the dense read-only fallback also
passed before that failure. WebDriver reported page crash/hang, then lost its
session. The Root process remained alive; the WebKit renderer PID41070 was gone.
Its trusted journald executable metadata identifies WebKitWebProcess and records
`Unexpected code block in DFG->FTL tier-up`. This narrows the failing component;
it does not establish a root cause or a fix, nor prove identity with the earlier
renderer SIGSEGV. No JIT or security setting was changed. Core inspection was not
available through `coredumpctl` because that tool is absent. A PID/start/executable
hash-checked SIGTERM cleaned only the owned disposable Root41039.

The bounded identical-command repeat also exited1 at the same heading Undo
step, with the same DFG-to-FTL diagnostic from a different trusted WebKit renderer
PID41593. Root41563 survived and was identity-checked before test cleanup. This
is two reproduced failures, not a passing retry. A lowercase-filename control
on the same binary is recorded separately; no causal conclusion is inferred
merely from the extension appearing in a failing fixture.

The same-binary lowercase-filename control exited0 with every earlier optional
flag. It passed all heading/paragraph/list/quote/multiline/history/exact-save,
mode0640, Source navigation, dirty-close cancellation, actual restart, explicit
legacy recovery, invalid-data refusal/deletion and original-preservation gates.
This successful control and both failed uppercase attempts remain distinct. It
does not demonstrate a general native crash fix.

The shorter `--extension-case`-only command also exited0 on the exact same ELF:
real uppercase picker/React/unchanged save/modes, heading/paragraph/list edits,
Undo/Redo, exact BOM/CRLF disk bytes, permissions, dirty-close Cancel/OK, actual
restart/reopen and explicit unsaved legacy recovery, invalid draft refusal and
explicit deletion. This provides working native uppercase editing coverage;
it does not replace the failed fully primed combinations or cover optional quote/
dense/repeated-name fixtures. The added optional gates remain mandatory when
requested, and none were removed from either full failed command.

A static comparison using the pinned WebKitGTK2.52.6 source-hash algorithm matches
`rc#ClTeuX` to the shipped CodeMirror `advanceCursor` gutter loop. The production
builder's full bundle SHA matches the analyzed bundle. The receipt includes both
named candidates, exact matching span and upstream source digests. This 32-bit
code hash can collide: it identifies the compiling-function candidate, not a
root cause, Tauri defect or safe production workaround.

A separate default-JSC C-API control called the exact matching loop200,000 times
with a synthetic progressing cursor and checked every collected marker. It
exited0 without JSC environment switches. This is a pure JavaScript control;
it has no DOM, CodeMirror runtime, Tauri, driver or cgroup acceptance scope and
does not rule out an engine/heap/timing issue in the actual app.
Build/install/inspection alone do not establish runtime behavior.

Reproduce in the disposable Ubuntu desktop described in Linux testing:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation --visual-budget --same-names --extension-case
```

The main file becomes `fidelity-acceptance.MdX`; auxiliary fixtures retain their
lowercase names. Rust separately checks distinct `Note.MdX`/`Note.mdx` native paths,
original permissions and bytes, uppercase snapshot metadata and unsupported format
refusal. Older binaries may reject new uppercase-named snapshots; no migration or
record rewriting is introduced.

Independent IPC on this exact installed ELF exited0: editor positive controls,
separate preview ACL denial for document/recovery/preview commands, absent
privileged plugins, real Counter2, parent DOM/storage isolation, HTTP/file CSP
refusal and normal supervised private networking/automation-off/NoNewPrivileges/
effective fixed limits/Stop. It is not a new complete malicious-pressure matrix.
Native file selection uses real dialogs with explicit absolute synthetic paths;
GTK directory-list filter presentation is not independently asserted. Native
multi-file uppercase TSX import and versioned uppercase-record GUI restoration
remain outside these fidelity commands.

## Remaining limits

Base commit CI run44557795559 refused both jobs before any runner steps because
of the account payment/spending-limit block. Local results are not hosted CI.
The prior resource matrix on ELF6e301bce remains five passes/one additional-page
OOM failure. Native renderer SIGSEGV and intermittent startup/blank failures remain
unresolved. No new full pressure-matrix pass, physical GPU/Wayland validation,
public release or production-security readiness is claimed. The downloadable
browser review remains pinned to its earlier engine54c41a7.
