# Native startup observation: bounded cleanup correction

## Finding and scope

Independent read-only review found no new production startup, lifecycle, native
capability or Wry change between current main `8516af3` and recovery correction
`909efe3`. Packaged native startup still selects the original editor using
`isTauri()`. Web Preview integration does not replace that native surface.

The startup **diagnostic** in `scripts/native-startup.mjs` did retain obsolete
cleanup logic, unlike the shared observer already used by other native gates:

- A matching live historical identity after the first empty group read failed
  immediately, even if it would terminate within the unchanged cleanup deadline.
- Group membership was not confirmed again after asynchronous identity reads.
- A slow read could establish supposed success after the five-second cleanup
  deadline, provided the total elapsed time was still below service expiry.

These are test-oracle defects. They do not establish a production escape or the
cause of historical renderer crashes. Previously recorded failures remain failures;
this change does not relabel any old run.

## Correction

The startup diagnostic now uses `waitForStartupCleanup` in
`scripts/native-cleanup.ts`, which delegates to the existing bounded observer.
It checks historical process identity, waits for actual termination within the
same budget, confirms membership again and rejects delayed evidence. Missing or
transient controller evidence is not treated as an empty cgroup. Process stat
parsing uses the existing strict parser, including process names containing
parentheses. Only ENOENT/ESRCH establishes a missing historical identity.

Both limits remain: at most **five seconds for cleanup**, and acceptance strictly
before **60 seconds from the start request**, the earliest service expiry. The
remaining service lifetime can shorten the observation. No service timeout,
resource quota, namespace policy, capability, graphics or JIT setting changes.

## Evidence and limitations

The old observation algorithm was extracted into a controlled-IO test seam:
**4 failed / 3 passed** before correction, reproducing immediate failure,
membership-repopulation acceptance and late evidence acceptance. The corrected
observer passed the initial **22 tests** across startup/shared cleanup suites.
An additional remaining-lifetime regression was then added. These are simulated
IO/clock tests, not Linux process termination evidence.

Final full `npm run check` passed **281 unit / 86 Chromium tests**, formatting,
ESLint, strict TypeScript and the production build. It included 10 passing tooling
checks. The additional real-process integration then passed separately and the
complete tooling suite was rerun: **11 passed, zero skips**, including credential
canaries. Node 24 directly imported the helper and parsed the startup CLI.

The regression suite covers eventual exit, persistent live identities,
repopulated groups, delayed identities, earliest-expiry refusal, indeterminate
membership, zombie identities and shortened remaining lifetime. Independent
read-only review found no blocking issue. Final full-check results are recorded
in the continuation checkpoint. A real owned Linux child also passed the
initially-live → SIGTERM → verified-terminal path using actual `/proc` reads;
only group emptiness is a fixture in that test. This is not a systemd/cgroup or
Tauri acceptance result. Startup reports now bind the shared cleanup module's
hash as well as the CLI observer and installed ELF.

No fresh installed native startup/IPC/filesystem/resource test was run here.
WebKit/JSC crashes and current-package native acceptance remain unresolved.
To validate the actual behavior, build and install the current optimized package
in the disposable full-system desktop described in
[LINUX_DESKTOP_TESTING](../LINUX_DESKTOP_TESTING.md). Create a fresh disposable
profile and empty fixture environment, then:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 timeout -k 5s 300s node scripts/native-startup.mjs
```

Retain `startup.json`, observer/module and installed ELF hashes, cgroup samples,
identity records, startup observations and both successful/failed attempts.
Do not disable sandboxing or extend the service to obtain a successful result.
Repeat the separate full security/resource/file/recovery matrix on that same
package; a startup pass cannot replace those gates.
