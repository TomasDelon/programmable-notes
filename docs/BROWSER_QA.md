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
The optional three-engine dispatch has a 30-minute ceiling: the first hosted
attempt spent over ten minutes installing dependencies before any browser test.
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
