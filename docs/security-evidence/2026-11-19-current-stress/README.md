# Current packaged resource matrix — four passed, one failed

Installed optimized production keyboard-save package, no test feature:
ELF SHA-256 `886285a41426b8d1d66a3c432139e057f7bf6a31cc823fd5831a30112cfccb5e`;
Debian SHA-256 `ee4b4e3f8eef1cf2f31d94c6e9af1af52bd0dcf735b65c3dcb79c8acf61ff271`.
Ubuntu 24.04.5/WebKitGTK 2.52.6, disposable QEMU TCG/Xvfb desktop, ordinary user,
supported software rendering. No application code, payload, sandbox, resource
limit or acceptance assertion was changed for this run.

## Executed full matrix

| Case                     | Result     | Actual observation                                                                                                                                                             |
| ------------------------ | ---------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| CPU/Stop                 | Passed     | 775,989 µs CPU over 3,045 ms, 30 throttled periods, 110 ms editor response; complete Stop before earliest expiry, then Counter 0 → 1 → 2.                                      |
| Immediate memory fixture | **Failed** | Required OOM cause absent. The unit reached the 60-second lifetime instead, with journal peak 491.5 MiB and sampled peak 515,461,120 bytes. Counter recovery passed afterward. |
| Natural expiry           | Passed     | Actual runtime-limit journal cause, no known live descendants, then interactive Counter recovery.                                                                              |
| Editor SIGKILL           | Passed     | Armed real loop, killed editor, independent preview expiry/cleanup, fresh editor and Counter 0 → 1 → 2.                                                                        |
| Preview window close     | Passed     | Cleanup at 46,966.6 ms from request, before natural expiry; Counter recovery and replacement-group removal.                                                                    |

The full command exited **1**, with WEBKIT_STRESS_FAILED ['memory']. Its ten
resource-unit records are retained with per-case outcomes. All observed groups /
known live descendants were gone, but that does not turn the missing OOM gate
into a success. The memory case is not accepted as OOM merely because expiry
contained it. No fixture, deadline or required journal pattern was relaxed.
Raw complete logs, samples, case failures and a small summary are in `raw/`.

A preceding independent editor-crash run also passed on this same binary. Its
exact logs and two unit reports are retained. This provides two current successes;
it does **not** establish the root cause or repair of the earlier intermittent
blank-preview failures. The static/Counter startup comparison remains relevant:
common emulated startup consumes much of the fixed lifetime. A non-emulated
comparison is unavailable here; this is a measured test outcome, not proof that
emulation alone caused the memory gate failure.

## Reporter correction and negative checks

The stress runner previously appended a target only inside stopped(). A failed
policy/readiness/UI check could omit that active unit from JSON. Units are now
registered immediately after a valid start reply; cleanup updates the same object.
Every case row is explicitly passed/failed, including completed units whose later
journal-cause check fails. Acceptance conditions are unchanged. Read-only review
found no important issue.

Two deliberate negative tests passed:

- NATIVE_DISPOSABLE_PROFILE=0 caused exit 1 before the launcher PID file existed;
  no application was launched. The destructive stress tool now requires the flag,
  and all contract examples show it.
- A separate fresh fixture working directory intentionally omitted the external
  AT-SPI script. The command failed at that observer, retained the active CPU unit
  with caseOutcome=failed and its actual error/samples, and did not invent a
  noLiveDescendants marker. The external verifier then checked real empty/removed
  membership and known PID/start identities after cleanup. **The CPU acceptance
  workload was not armed/executed in this intentional negative.**

The missing-observer log is a harness rejection test, not another application CPU
failure. Its verifier and report are retained for reproduction. Only raw generated
evidence is marked generated for GitHub review; outcome summaries and executable
source remain visible. Git attribute checks confirmed that distinction.

Reproduce with the installed-package prerequisites, disposable account and a fresh
fixture env for each invocation:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stress.mjs --case=editor-crash
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-stress.mjs
```

Preserve stdout/stderr and NATIVE_EVIDENCE_DIR even when the exit code is nonzero.
For the intentional observer negative, create a fresh private fixture working
directory containing docs/handoff/samples/fixtures/counter.mdx and a node_modules
link to the trusted checkout, but no scripts/native-atspi.py. Run the canonical
absolute stress-script path from there with --case=cpu-stop, require exit 1, then
run `raw/verify-observer-negative.mjs` in the same fixture environment. Never remove
a real driver or use personal notes to construct a negative test.

This is not a full green matrix or production security readiness. Current hosted
CI still cannot start because of account billing. Physical GPU/Wayland/IME and
broader distribution review remain unexecuted. Earlier package evidence retains
its earlier exact binary and result scope.
