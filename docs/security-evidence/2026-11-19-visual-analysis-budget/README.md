# Conservative visual-analysis budget

Base144da10. The existing source-length limit alone allowed expensive synchronous
mapping work. Five isolated baseline Node probes parsed ordinary/dense examples;
four larger quote/bracket probes within500KB each exceeded an external3s deadline
with a256MiB heap. This is parser evidence, not document execution or native escape.

## Actual browser observation

A fresh real Chromium editor selected a100001-byte bracket-heavy file, stopped
preview, then entered Visual. Transition5073.5ms; maximum10ms heartbeat gap2943.8ms.
The same browser producer/new build measured68.3ms transition/24.3ms maximum gap,
with one read-only fallback. These are single descriptive probes, not a statistical,
portable performance guarantee. The first producer tried to wait for a middle
character inside CodeMirror's virtualized long line and failed before Visual;
that harness failure is retained separately and was not an application timeout.
The corrected producer waits for the selected filename. Exact file bytes are
verified independently by the Playwright regression, not by that timing probe.

## Implemented boundary

A linear preflight refuses synchronous visual mapping above4096 raw `[]`/`>`
markers or the existing500000UTF16-unit length bound. No ranges/candidate patch
is accepted; one escaped read-only block covers the exact whole source with a
trusted Show in Source action and explicit explanation. Raw markers inside
strings/comments also count: some valid documents conservatively require Source.
This does not change MDX grammar, compiler/runtime requests, original bytes,
revision/context/candidate checks, native authority or sandbox restrictions.
Existing source/save/workspace/compiler limits still apply. It does not establish
a universal parser/DOM deadline; a cancellable visual-analysis worker remains a
stronger future boundary. No native SIGSEGV fix is claimed.

## Executed automated checks

Missing-limit unit tests first failed. Final focused tests cover exact budget,
over-budget header mapping/patch refusal, candidate growth, quote-only and size
fallback, exact BOM/CRLF whole-source positions, plus existing editor safeguards.
Full `npm run check` passed **86 unit /34 Chromium** with formatting/lint/strict
types/fresh production build. The actual new browser case verifies100KB dense
readonly content, no edit controls, trusted Source focus, exact downloaded bytes,
then normal corrected visual editing and Undo. Existing browser security and
React interactivity tests passed. After a test-oracle acknowledgment correction,
targeted observer lint passed; no shipping code changed after the full check.

Read-only review found an Important observer issue before native acceptance:
unchanged bytes plus enabled Save could mask a native write refusal. The new
native case now requires current-document `Saved.` acknowledgment and no file
error before emitting its exact-save marker. No success is inferred from old bytes.

## Exact optimized Linux artifact

- Debian SHA256 `6878294f4bf653907d772da244d70551846de89ff21080d465048470b473b115`;
  6,827,252bytes. Optimized production build, package inspection passed.
- Installed ELF `6e301bcee2a5bd38df027e4fa089a1cf2b06e27873b489509aeb4f789a2857bd`.
- Fidelity observer `915efc473a2d621c544191f2ac9f0fa5cb6ca21e189faeb500bc440eb76ea516`.
- All150 shipping sources/config/vendor/lock/default-fixture hashes match builder.
  This is source parity, not a hermetic binary-build claim.
- Disposable Ubuntu24.04 QEMU TCG, WebKitGTK2.52.6, authenticated Xvfb/Openbox,
  real systemd/cgroupv2, supported software-rendering flags. No JIT/sandbox/policy
  override was introduced.

## Actual packaged editing and refusal control

The full production fidelity command exited0: new dense read-only/exact Source/
acknowledged Save/mode0640, then every earlier counter, modes, quotes, mixed endings,
real keyboard editing, exact history/disk, dirty-close Cancel/OK, actual restart,
explicit unsaved recovery, invalid-data/delete and original protection gate passed.

An external control made only its synthetic parent directory0550 before Save,
keeping the file0640. Actual Save returned Permission denied. Captured facts show
Save enabled, original bytes unchanged and mode0640: the previous weak oracle's
conditions all held. The corrected observer nevertheless exited1 at its original
wait deadline because Saved.+no-error was absent; it never emitted the dense-save
pass marker. Independent checks verified all100026 original bytes/SHA, mode0640,
directory restored0700 and owned Root gone. Exact control source and failed log
are retained. This is a deliberate Save-refusal/reporting control, not an
uncontrolled application failure, and is not labelled a full native-suite pass.
Read-only follow-up confirmed the acknowledgment correction resolves the finding.

Independent native IPC exited0 on the same installed ELF: production private
network/automation-off/NoNewPrivileges/effective512MiB/0swap/25%CPU/128task limits
and Stop; separate automated preview command/recovery denial, absent plugins,
Counter2, DOM/storage and HTTP/file CSP refusal. This is not a full pressure matrix.
Host/guest fidelity and GTK dialog observer hashes match exactly.

## Reproduce

Follow `docs/LINUX_DESKTOP_TESTING.md`, install the optimized package, start the
external native driver and use fresh disposable fixture environments:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes --multiline-quotes --source-navigation --visual-budget
```

The optional dense case precedes, rather than replaces, all existing native
editing/counter/history/restart/recovery gates. Previous native renderer SIGSEGV,
intermittent blank/startup and original memory-OOM-before-expiry failures remain
unresolved. No complete new resource-pressure matrix, physical GPU/Wayland/IME
coverage or production readiness is claimed. Hosted144da10 run44539390455 refused
both jobs with zero steps for billing; raw annotation retained. The current
GitHub-downloadable review still binds engine34dc906.
