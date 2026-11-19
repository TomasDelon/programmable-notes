# First-counter input investigation — 2026-11-19

The earlier real820px Playwright failure completed its first click yet kept
Counter0. Its [complete original trace](../2026-11-19-stop-retry/raw/tablet-failure.trace.zip)
shows the same iframe, but has no event-delivery probe. It does not establish
whether input reached React or whether state reset. No production change is
justified by that evidence alone.

A standalone bounded diagnostic now records exact browser/source/probe identity,
trusted pointer/click events, counter-text mutations, errors and frame navigation.
It installs no preventDefault/propagation stop, source/DOM changes, application
messages or privilege. A second real diagnostic click never turns the first
failure into a pass. It caps traces/screenshots at three failures and rejects
existing evidence directories; per-case records preserve earlier observations.
Only the synthetic default local app is used, never personal files.

## Executed observations

| Browser                     | Observation                          | Result                                                                 |
| --------------------------- | ------------------------------------ | ---------------------------------------------------------------------- |
| SystemChromium156.0.8078.79 | 30instrumented first clicks          | 30passed                                                               |
| Playwright159.0.8154.6      | 30instrumented first clicks          | 30passed                                                               |
| System156                   | 20untouched first clicks             | 20passed                                                               |
| Playwright159               | 20untouched first clicks             | 20passed                                                               |
| Playwright159               | one instrumented positive control    | passed; actual trusted click/text mutation captured                    |
| Playwright159               | one deliberately omitted first input | expected exit1; second real click responded, original failure retained |

Paired system/pinned runs used separate browser processes concurrently; each
process reused its browser between fresh contexts. That warm-browser scope differs
from Playwright's worker-restart lifecycle. A separate ten single-round command
invocations per browser also passed with a fresh Node/browser process each time;
those cold controls retain actual trusted-event and text-mutation observations. The initial observer retained event
snapshots only on failure; its exact source/report hashes are preserved. The
latest observer additionally retains successful event snapshots and immutable
case records. All observed app-source artifacts bind head0975b35. No app/source/
capability/runtime restriction changed during these observations.

The deliberate missing-input control retained Count0 with no click event, then a
trusted pointer/click on BUTTON and Count0→1 in the same srcdoc timeOrigin. It
still exited1. Its trace CRC passed; receipt/hash and actual screenshot are
retained. A separate collision control exited1 at EEXIST before launching a
browser and left the existing report byte-for-byte unchanged.

The current full repository check passed74unit/30Chromium plus format/lint/types.
This is **not a fix or cause claim** for the intermittent miss, nor proof that a
browser-version difference caused it. The matching browser full-check results in
the preceding milestone remain separate. Hosted CI for exact head0975b35 again
refused both jobs before any runner step because of account billing/spending
limits; its raw annotations are retained. Neither local nor native execution can
be relabelled as a hosted CI pass.

## Reproduce

Build and serve the owned local app, then use a separate terminal:

```sh
npm ci
npm run build
npm run preview -- --host 127.0.0.1 --port 4189 --strictPort
# Second terminal, repository root; always choose a NEW evidence directory:
COUNTER_EVIDENCE=.cache/counter-new node scripts/diagnose-counter-input.mjs
# Exact untouched control:
COUNTER_EVIDENCE=.cache/counter-untouched node scripts/diagnose-counter-input.mjs --without-probes
# Expected exit1; omission is intentional and is NOT an application failure:
COUNTER_ROUNDS=1 COUNTER_EVIDENCE=.cache/counter-negative node scripts/diagnose-counter-input.mjs --self-test-failure
```

For system browser set
`PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH=/usr/bin/chromium`; for matching Playwright
unset it and install `npx playwright install --only-shell chromium`, with the
workspace browser cache where needed. Evidence includes individual caseJSON,
manifest/report and at most three failure traces/screenshots. Use rounds1..100;
use one round for the deliberate negative. Restart the Node command between
one-round runs for truly cold browser controls. On the next real miss, compare
first/second event and mutation records plus frame identity before proposing a
runtime change. Source edits intentionally restart React; mode changes do not.
