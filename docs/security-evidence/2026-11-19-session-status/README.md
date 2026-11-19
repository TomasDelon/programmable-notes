# Native connection feedback — 2026-11-19

Compilation and native execution now have separate feedback. The trusted editor
reads the supervisor's owned `systemd-run --wait` child handle. A disconnected
connection is not evidence of an empty cgroup, healthy renderer, OOM or expiry.
The backend retains cleanup ownership. No automatic restart or source/file write
follows a status response. The new argument-free read repeats editor authorization
and is absent from preview capabilities.

## Verification

The baseline installed app rendered an actual counter and expired at the fixed
60-second limit, with the systemd runtime-limit journal, while the editor still
claimed to be requesting a preview. Raw baseline observations are retained.

Regression tests cover an actual owned OS child and retained Stop identity,
serial polling, stale replies, malformed/error responses and cross-generation
in-flight requests. The fresh review identified overlapping reads across rebuilds;
the stronger test failed (three requests instead of one), then passed with a
shared in-flight gate independent of the Stop/start queue. The full local check
passed **69 unit / 30 Chromium tests**, formatting, lint and strict TypeScript;
**7 native-policy Rust tests** passed. These are separate from native runtime proof.

The installed final package passed the complete session observer: two actual
counter interactions, natural runtime-limit expiry, ended/disconnected feedback,
manual rebuild, UI-only Stop with cgroup removal before expiry, unchanged source
and mode0640. Stop was requested at actual unit age46.728146 seconds; no direct
cleanup RPC contributed to that success. The tested observer SHA256 is
`2ab790d24d0f2e849f6de66c812d4720c0887c6a599c3186eb1aabcc8fa52ce4`.
Its exact source and report are retained.

The independent updated native IPC suite passed on the same installed ELF:
Root readfalse/true/false controls, preview denial of the new read and all existing
privileged commands/recovery actions, absent privileged plugins, Counter2,
DOM/storage and HTTP/file CSP denial. Ordinary production child private networking,
automationoff, NoNewPrivs and effective fixed limits passed separately from the
automation-attached ACL probe. Full pressure/lifetime gates remain separate.

The complete installed fidelity suite also passed on this exact ELF: actual MDX
counter, unchanged BOM/CRLF save, Source/Split/Visual modes, quote no-op/exact disk/
history/unsafe-input retention, Unicode clipboard input, internal mixed LF/CRLF
edits and Undo/Redo, mode0640, dirty-close Cancel/OK, real application restart,
explicit unsaved restoration, invalid UTF8 rejection/deletion and original file
unchanged. Its existing observer4c6a02ab… and the updated IPC/session observers
match their host/guest copies. Backend persistence source is unchanged; preceding
36 normal Rust backend tests are not relabelled as new execution here.

## Stop oracle and retained failures

The first native observer invoked Stop directly after clicking the UI. An actual
controlled `execve` EIO in the verified synthetic editor made UI Stop fail, yet the
old observer passed because its direct command cleaned up the cgroup. Its report
retains `Native stop failed`, the live pre-cleanup UI and the injected syscall
trace. This is a demonstrated **false success in the old observer**, not a
successful production Stop. The current observer reserves direct Stop for final
cleanup and requires the UI action alone to remove its cgroup within three
seconds, before the unit's actual monotonic expiry. No execution limit changed.

The corrected isolated observer was exercised with the same actual syscall
failure. It **exited1 as required**: UI reported the EIO, the cgroup remained live,
connection read was true and the three-second UI-only gate failed before natural
expiry. Stop was attempted at unit age48.020256 seconds; only finally-cleanup
then issued direct Stop. The old observer's false pass and the corrected
observer's meaningful failure are both retained. No native permissions or
resource settings were weakened to make either observation happen.

An attempted JavaScript replacement of the Tauri internal invoke function was
rejected by its immutable property and was not a working fault injection. The
external syscall fault uses root ptrace only in this disposable VM, verifies UID,
PID/start ticks and exact executable hash, then detaches before final cleanup.
It does not disable the app or preview sandbox. Controller/old-observer source
and logs are retained as `.txt` evidence, not shipping app code.

The intermediate-package full control reached expiry feedback but could not find
the rebuilt counter, before any fault. A corrected isolated control on the final
package also failed to find its first counter before injection. Neither counts as
a successful negative control. Preserve these startup/rebuild failures alongside
later successes; their root cause is unresolved. Earlier request-age and immutable
SDK controls are likewise inconclusive, not security fixes.

## Exact production package

- Debian SHA256: `79e1c512781976998879f81306007a343289a97a41e1f825751d5a7183fd1454`.
- Installed ELF: `d74850a5418b014a4107315ff5c76ca12668affadcd4a3545cee002f1422eb2f`.
- Size: 6,826,986 bytes. Optimized custom-protocol build, no security-test CLI.
- Host/builder application source parity is recorded for seven relevant files.
- Disposable Ubuntu24.04 full-system QEMU TCG, real systemd/cgroupv2,
  WebKitGTK2.52.6, authenticated Xvfb/Openbox, supported software-rendering flags.

The long-document renderer SIGSEGV, occasional blank/startup observations and the
prior memory-before-expiry acceptance failure remain unresolved native reliability
blockers. Physical GPU/Wayland/IME compatibility is separate untested work. No new
full malicious-pressure matrix or production security readiness is claimed.
Hosted CI for head34647ef did not start either job: billing/spending-limit refusal,
zero runner steps. Exact API annotations are retained; this is not a code failure
or a passing CI result.

## Reproduce

Use a disposable Linux desktop, the documented native prerequisites, optimized
installed package and an external WebDriver. Source a fresh fixture environment
for each independent run:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 npm run native:session:test
# Fresh fixtures for each:
npm run native:test
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-fidelity.mjs --mixed-eol --quotes
```

The session test requires actual counter interaction, real natural expiry and its
journal, editor feedback, no automatic restart, manual rebuild/interaction, UI-only
Stop before expiry and exact unchanged original bytes/mode0640. Missing runtime,
unsupported infrastructure or failure is never a pass. Connection polling may
report connected while a renderer is blank; it deliberately measures the wait
connection only.
