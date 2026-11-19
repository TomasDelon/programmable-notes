# Resident-page pressure and trusted OOM evidence

Base368dd95. No application, native permission, sandbox, resource limit, runtime
lifetime or production binary changed. Installed optimized Debian6878294f… /
ELF6e301bce… retains the preceding actual editing/recovery/IPC acceptance.

A new **additional** workload retains128MiB Uint8Array blocks and writes one byte
per4096-byte page. The original16MiB full-fill fixture remains unchanged and
mandatory. The additional workload was an investigation of resident-pressure cost,
not a replacement for a failing original test. The complete default suite now
includes six cases; any failed case still makes the command fail.

## Actual full production run: command failed

| Case                               | Result     | Observations                                                                                                                                                                                                                               |
| ---------------------------------- | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU/Stop                           | Passed     | 775854µs CPU/3041ms,31 throttled periods,395ms editor response; whole-group Stop before earliest expiry and Counter0→1→2 recovery.                                                                                                         |
| Original16MiB full-fill allocation | Passed     | Trusted systemd OOM-kill,536870912-byte peak/zero swap, complete cleanup and Counter recovery. First manager OOM notification59.339s after Started; final failure/cleanup record60.603s. No runtime-expiry message occurred for this unit. |
| Additional resident-page pressure  | **Failed** | Actual result timeout at the fixed lifetime,528297984-byte peak (503.8MiB),zero swap. Required OOM cause absent; its immediate per-case Counter recovery was not executed. Following cases passed their own recovery.                      |
| Natural expiry                     | Passed     | Armed real loop, required runtime-limit journal, group/known descendants gone and interactive recovery.                                                                                                                                    |
| Editor SIGKILL                     | Passed     | Killed actual editor, independent preview expiry/cleanup, fresh editor and Counter0→1→2.                                                                                                                                                   |
| Preview window close               | Passed     | Complete close/cleanup49794.9ms from request, before earliest possible expiry; subsequent Counter recovery/Stop.                                                                                                                           |

The full command exited **1**, `WEBKIT_STRESS_FAILED ['memory-pages']`. Its11
unit records, raw journal JSON, samples, artifact hashes and case failures are
retained. An independent post-run check verified all recorded cgroups empty/gone,
all known PID/start identities gone or terminal, and both editor Roots gone.
This is **5 passed /1 failed**, never a complete pass.

The preceding selected page-workload run passed OOM and Counter recovery on the
same ELF and identical compiled-HTML SHA
`f397704efd41f167251b1e11e48f22e5f7d99a5deebcc24979eb2fce753a3b60`.
That run preceded the strict-oracle correction and is labelled pre-strict. A
separate post-hoc check of its real structured journal confirmed matching trusted
systemd sender/UID/unit, resultoom-kill and512MiB peak/0swap. The full run's later
timeout does not undo that enforcement observation; neither does the earlier
success repair the failed full-suite gate. Startup under unchanged25%CPU in QEMU
TCG took tens of seconds, but no exclusive cause or timing fix is established.

## OOM oracle strengthened

Review found the old broad OOM text match could accept an allocation diagnostic
rather than kernel enforcement. Both memory cases now require a structured
journald entry from the matching systemd user manager: trusted executable path,
COMM/UID/transport, exact unit-failure MESSAGE_ID, matching USER_UNIT and
UNIT_RESULT=oom-kill. Authored console/RangeError/OOM text, wrong sender/unit/UID/
result/transport/message ID, arrays and malformed records are rejected. Raw JSON
is retained before parsing, including missing-cause failures. Unsupported/missing
metadata fails closed; there is no broad-text fallback.

An adapter of the previous text predicate failed both new semantic unit tests;
the strict helper passed. The original helper-load RED is not counted as semantic
proof. New case selection also first failed as Unknown --case before a launcher
PID existed. Full repository check passed **88 unit /34 Chromium**, format/lint/
strict types/fresh build. Subsequent raw-journal-retention-only change passed
targeted lint and the actual full native command above. Review's Important issue
was resolved; no remaining Important/Critical code finding was reported.

## Exact scope

- Debian `6878294f4bf653907d772da244d70551846de89ff21080d465048470b473b115`.
- Installed ELF `6e301bcee2a5bd38df027e4fa089a1cf2b06e27873b489509aeb4f789a2857bd`.
- Final observer `e7013cc22f1dc7df045097d7c06a531e6d964bd1e9eaaa749ee99a3368a8e451`.
- Journal oracle `637db391c7b4ee4075e21fcf51b259af700fa06464ee1fcf70ca149b5687ca09`.
- Disposable Ubuntu24.04 QEMU TCG4CPU/8GiB, WebKitGTK2.52.6, actual systemd/cgroupv2,
  ordinaryUID1000 authenticated Xvfb/Openbox, documented software-rendering flags.
- Actual WebProcess Seccomp2/NoNewPrivs1; every returned unit's effective512MiB/
  zero-swap/25%CPU/128task limits checked. Fixed60s lifetime unchanged.
- No fresh Rust/package build was needed for this test-only change. Earlier
  source-parity/package/IPC scopes remain separately recorded, not relabelled.

## Reproduce and remaining blocker

Use the full disposable Linux procedure in `docs/NATIVE_SECURITY.md`, install the
optimized package and start the external driver. Node24 is required for the
TypeScript journal helper. Use fresh fixtures per command:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stress.mjs
# Another fresh fixture: isolate the additional OOM gate.
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stress.mjs --case=memory-pages
```

Repeat on a supported ordinary Ubuntu/KVM or physical-CPU desktop with the same
limits. Physical GPU/Wayland is unnecessary for this software-rendered test.
The present cloud host exposes no /dev/kvm and no authorized remote compute
credentials/provider; the owned full-system VM uses TCG. This does not justify
raising limits or accepting expiry as OOM. The selected/full outcome difference
is observed, not proven to be solely an infrastructure defect.

Earlier native renderer SIGSEGV and intermittent blank/startup failures remain
unresolved. The prior original-memory expiry failure is retained in current-stress;
this repeat's original-memory success does not establish its cause or a general
fix. Latest368dd95 hosted run44542637950 refused both jobs before runner steps for
account billing. No production security readiness is claimed; PR#1 stays draft.
