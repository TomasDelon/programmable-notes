# Hosted browser interaction QA

Normal PR CI still runs the production check in Chromium and the native build /
backend checks. They remain mandatory for every PR. To validate all three browser
engines without running another native build, dispatch the existing CI workflow
against the desired branch:

```sh
gh workflow run ci.yml --repo TomasDelon/programmable-notes \
  --ref test/hosted-browser-recovery-qa-20261123 -f browser_qa=true
```

The opt-in run uses a standard `ubuntu-24.04` GitHub-hosted runner, installs the
matching Chromium, Firefox and WebKit dependencies, scans credentials, runs the
synthetic scanner controls and executes `npm run check` with `PN_ALL_BROWSERS=1`.
It retains the `playwright-results` HTML report on success or failure for seven
days. Check the exact run head SHA and individual test results before claiming
coverage. A queued/started job or green compilation is not browser acceptance.
The optional three-engine dispatch has a 45-minute ceiling. A 30-minute attempt
spent 26m18s installing dependencies, then timed out during checks; the higher
outer job ceiling gives the unchanged tests time to execute. This does not
extend individual test timeouts or weaken assertions.
Normal Chromium PR/push checks retain their original 15-minute ceiling. Neither
setting changes the native application's resource or service lifetime limits.

Only this explicit browser-only dispatch skips `native-check`. Pull requests,
pushes to main and ordinary dispatches retain both original jobs. No paid runner,
service, cache account, billing setting or token permission is introduced.
Standard hosted Linux execution is free for public repositories under GitHub's
public-repository runner policy; account restrictions and artifact retention
still apply. This workflow does not remove an account-level restriction.

For a suitable local Linux test host:

```sh
npm ci
npx playwright install --with-deps chromium firefox webkit
PN_ALL_BROWSERS=1 PLAYWRIGHT_WORKERS=2 npm run check
```

Production-code isolation is unchanged. Browser WebKit is **not** native
WebKitGTK/Tauri acceptance: use the separate disposable desktop procedure in
[LINUX_DESKTOP_TESTING](LINUX_DESKTOP_TESTING.md) and retain actual package identity,
IPC/resource/filesystem results and crashes.

## Refresh race regression

`tests/e2e/web-rendered-editor.spec.ts` now exercises a real field opening during
a real IndexedDB focus refresh. The test pauses delivery of a successful open
request, opens and types into the equation, then resumes the original request.
It does not replace stored data, checksums, read results or CAS writes. A competing
tab's source remains saved; the local field survives and its explicit application
retains local source with a conflict instead of overwriting the competing version.

The full local check passed **273 unit, 86 Chromium and 10 tooling tests**, with
zero skipped tooling controls when the pinned scanner was supplied. Independent
review strengthened the race test to reject a timed-out read as evidence of a
successful refresh; the final focused Chromium case passed again. Both hosted
jobs for recovery base `909efe3` passed in
[run 45287285963](https://github.com/TomasDelon/programmable-notes/actions/runs/45287285963).
Hosted three-browser results are recorded after dispatch; Firefox's local launch
failure and missing WebKit libraries are retained in the
[recovery audit](recovery/2026-11-23-resumed-engineering-audit.md).

## Latest executed checkpoints

At `21b3a48`, [ordinary CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45290649176)
and the [three-engine dispatch](https://github.com/TomasDelon/programmable-notes/actions/runs/45290660173)
both passed. The [retained report](https://github.com/TomasDelon/programmable-notes/actions/runs/45290660173/artifacts/14874553610)
is owner-accessible for seven days; this session's artifact/log download API
returned Forbidden, so no downloaded per-engine count is claimed.

At the nonce correction `3cf7f28`, [ordinary CI](https://github.com/TomasDelon/programmable-notes/actions/runs/45299830820)
passed both jobs. The separate [three-engine dispatch](https://github.com/TomasDelon/programmable-notes/actions/runs/45300006229)
exceeded 30 minutes: browser dependency installation alone ran from 00:48:02 to
01:14:20 UTC, then `npm run check` was cancelled at 01:17:45. GitHub's annotation
explicitly reports the job ceiling. It is **incomplete**, not a new Firefox or
WebKit pass. No application failure is inferred without its unavailable logs.
The preceding successful three-engine run applies to its earlier commit; the
nonce regression additionally passed locally in Chromium and real native WebKitGTK.

The timed-out dispatch was retried once under its existing 30-minute definition.
Attempt2 also exceeded that ceiling: dependency installation ran from 01:23:36
until cancellation at 01:53:27 UTC; `npm run check` was not reached. Both attempts
are incomplete and GitHub's annotations explicitly identify the 30-minute ceiling. The updated workflow gives only future
explicit browser-only dispatches 45 minutes. Ordinary PR checks remain 15 minutes,
native-check 45 minutes and actual application security limits unchanged. This
avoids repeatedly downloading dependencies only to cancel the test phase.

At `525b70b`, [ordinary CI45318116068](https://github.com/TomasDelon/programmable-notes/actions/runs/45318116068)
passed both jobs, and [three-engine QA45318464348](https://github.com/TomasDelon/programmable-notes/actions/runs/45318464348)
passed its full check with native-check intentionally skipped. The
[Playwright report14886669317](https://github.com/TomasDelon/programmable-notes/actions/runs/45318464348/artifacts/14886669317)
is retained for seven days. No downloaded per-engine count is claimed. These
terminal results apply to525b70b; subsequent diagnostic/evidence changes require
their own checks and must not inherit that head's status silently.

The optional `editing_qa` diagnostic also repeats caret mathematics: in-place
source/history, display newlines, desktop/mobile flow and Chromium composition
integration. Chrome-specific DOM/EditContext fixtures are explicitly skipped in
Firefox/WebKit; ordinary mathematical editing and geometry run in all three.
It retains zero retries and the existing three repetitions. This supplements
the mandatory PR gates; it does not replace native/package or full web checks.
