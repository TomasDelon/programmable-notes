# Fixed pinned MDX/React pointer observation

26 November 2026. Follows [the bounded pointer plan](../../plans/wry-react-pointer.md).
REACT-01/SECURITY-01; partial A09/A11 evidence only.

**Actual MDX/React hooks and OS pointer interaction reached Count 0→1→2 in the
GtkSocket/Plug host window. Bounded Stop cleanup was not proven because the
observer aborted with ESRCH.** Its host-input step was not reached. Normal
keyboard, document geometry, hostile-document containment and product acceptance
remain open. This is one fixed standalone diagnostic, not application parity.

**Plan deviation:** the guest used a read/write 9p host-backed fixture share at
`/mnt`, not guest-local evidence with SSH transfer. This failed the plan's
no-host-shares condition. The backing tree contained synthetic sources/artifacts/
logs, a copied public Cargo cache and the newly generated task-local SSH transport
private key/known-host metadata. No original owner credentials, vault, home or
retained infrastructure directory was shared. No key access by document code was
observed or tested; its presence in that shared tree prevents a clean no-share
or privilege-denial acceptance claim. The provisioning restriction was missed
when reusing prior setup. The observed fixed React pointer behavior is scoped
to this deviating environment, with no runtime retry or rewritten result.
The dedicated key authorized only this disposable guest's bootstrap endpoint;
it was not enrolled in owner/host/other-service authorization. VM isolation and
full security acceptance are explicitly excluded.

## Actual React artifact

The 439-byte MDX fixture imports pinned React `useState` and `useEffect`, exports
a Counter with an actual React onClick state updater, and renders `<Counter />`.
Definitions/imports are compiler source, not an HTML counter renamed React.
`@mdx-js/mdx` 3.1.1 compiles the module; esbuild 0.28.2 bundles React/ReactDOM 19.3.1
and mounts MDXContent through `createRoot`. Compilation/bundling does not
evaluate the generated fixture in the privileged host.

The mounted effect publishes count/state through document.title. A bounded Wry
callback writes only its own native Plug's `_PN_FIXTURE_STATE` UTF8 property.
A separate native pre-JS sentinel proves that receipt transport before React
readiness is admitted. Errors use a bounded sticky receipt so a later effect
cannot clear them. The sticky-error preparation correction occurred before any
payload execution, followed by compilation and rebuilding; prior preparation
logs remain private. Executed sources were hash-checked unchanged afterward.

The final JavaScript bundle is 224,322 bytes and the HTML 224,650 bytes. Exact source,
compiled-MDX/bundle/HTML hashes, package-lock hash, pinned dependency versions and
package metadata hashes are in [receipt.json](receipt.json). The native artifact
hash is `a0f56ab6f56c22c0df706e91458ed30a51a5804c87c53479c14732b1455e2a65`.

`raw/` preserves exact MDX, compile script, generated MDX module, bundled HTML,
compiler receipt, case result and live metrics. Esbuild legal comments remain
unchanged in the bundle. The existing
[third-party notices](../../demo/THIRD_PARTY_NOTICES.txt) include the full MIT
notices for react 19.3.1, react-dom 19.3.1 and scheduler 0.28.0 used here.
`repro/` preserves the exact Rust/Python/manifest/lockfile inputs.
The generated browser module is archived as `raw/compiled-mdx.js.txt` without
changing bytes, rather than treating compiler output as authored Node source.

## One executed native case

Root completed the local full browser/check suite and explicitly released heavy
resource ownership before compilation/VM work. There was one reviewed native
artifact/case, no browser fallback, forced focus, JavaScript click/evaluation or
runtime retry. Normal keyboard was explicitly excluded from this pointer question;
its prior incomplete results were not waived or rewritten.

| Receipt                                                | Unit age        |
| ------------------------------------------------------ | --------------- |
| Independent native sentinel                            | 3.19s           |
| Mounted React Count 0 / error empty                    | 39.39s          |
| Two actual child-relative OS clicks begin              | 39.67s          |
| React Count 1 / Count 2                                | 41.21s / 41.72s |
| Live MainPID/start/cgroup verified before trusted Stop | 42.04s          |
| Cleanup observer aborts, ESRCH                         | 42.41s          |

The independently queried native child was 10485763 under Socket 4194315,
geometry 300×120. The observer used real xdotool clicks relative to that child.
Count 2 was also captured visually before Stop. These receipts establish this
fixed React component and pointer interaction, not arbitrary component behavior,
keyboard input, scrolling/clipping/selection or multiple-island integration.

The original deadlines remained 44 seconds for readiness, 49 for input, Stop
beginning before 50, and cleanup within one 5-second bound. The service policy
remained 512 MiB RAM, zero swap, 25% CPU, 128 tasks and 60 seconds. Actual vendored Wry,
ephemeral context, enabled WebKit sandbox, download/navigation denial, absent IPC
handler/devtools and unchanged Supervisor verify-before-payload were preserved.
This does not constitute actual application-command/ACL or filesystem evidence.

## Stop request observed; bounded cleanup unproven

MainPID 565/start 8069 and eight tracked identities were verified in the exact
safe non-root unit cgroup before the real trusted-host Stop click. The host
logged `HOST_BUTTON_STOP Ok(())`, and the matching trusted user-manager journal
recorded stopping/stopped events before the fixed expiry. The checker then
aborted with `[Errno 3] No such process` instead of completing its required
identity/group checks. The original result remains `stop=NOT_PROVEN` and
`host_input=NOT_RUN`.

The executed exception handler retained only the exception string, without a
traceback, filename or phase. The exact failing process-bound read cannot be
identified from existing evidence; several such reads occur in the checker.
No source correction or retry was performed. ESRCH was not silently interpreted
as disappearance or converted into a passing cleanup result.

The established `scripts/native-stress.mjs` already normalizes ENOENT/ESRCH for
process-bound reads. The diagnostic helper's narrower exception handling is a
follow-up candidate, not proof of which read failed. No production observer was
changed and no generalized cgroup-error normalization is justified by this case.

Later read-only checks found the owned cgroup absent and no entries for the
eight known PIDs. Those observations are outside the original observation
sequence and cannot repair the missing 5-second proof. Native Stop callback and
systemd stopped messages also do not replace the required identity predicate.
The original observer produced no host-input acceptance result after its abort.

## Live resource observations

The read-only background sampler recorded 42 snapshots before/during the Stop
request, without blocking or extending the main deadlines. At unit age 42.16s it
read 10.608 seconds cumulative CPU use, 427 periods/423 throttled, 125.7 MiB peak memory
and eight process identities/states. WebKitWebProcess was recorded running in
that snapshot; other helpers were sleeping. The unit journal later reported
10.743 seconds CPU and 125.7 MiB peak, zero swap.

These are live kernel counters/process observations, not proof that a particular
resource or host-contention condition caused startup latency. A snapshot's
timestamp precedes completion of its individual reads; it is not atomic. The
sampler is not the termination oracle and cannot establish completed cleanup.
No independent process seccomp/namespace audit or malicious CPU/memory workload
was executed for this artifact.

## Environment, reproduction and cleanup

The fresh disposable guest used the approved local clean distro tooling base:
Ubuntu 24.04/kernel 6.8.0-149, GTK 3.24.41/WebKitGTK 2.52.6, QEMU TCG, 4 vCPU/8 GiB.
Explicit trusted setup modes were audited; the guest detected `qemu`, had no
container marker, mounted securityfs normally and reached systemd `running`.
Both namespace restriction sysctls remained 1; the existing documented disposable
systemd-executor namespace opt-in was applied. Original retained infrastructure
and the clean tooling image were not changed. Rust used two compile jobs.

Use a new disposable full-system Linux/X11 guest satisfying
[NATIVE_SECURITY](../../NATIVE_SECURITY.md), with an ordinary UID 1000 `ubuntu`
user, authenticated X11 and delegated user controllers. The source scripts
record the exact tested paths. In new scratch, copy the manifest/lockfile,
`repro/main.rs` to `src/main.rs`, and the raw compiler/MDX sources. Compile the
fixture without evaluating its output, producing `fixture.html` in scratch:

These commands describe the tested software, not approval to reproduce its
share deviation. A future compliant runtime must keep artifacts/evidence on
guest-local storage and transfer them with private transport keys outside the
guest; it requires its own environment validation and runtime evidence.

```sh
node compile-react.mjs
CARGO_BUILD_JOBS=2 cargo build --release --locked --offline
sha256sum target/release/pn-wry-inline-spike
```

The manifest expects this repository read-only at `/repo`; the tested Node
compiler paths point to `/workspace/programmable-notes` and its pinned modules.
Install the fixed diagnostic as `/probe/pn-wry-inline-spike`, with the matching
observer and writable evidence directory at `/mnt`. In the authenticated ordinary
X11/user-bus session, with the documented supported TCG rendering switches set to 1,
run the host and observer in separate terminals. Preserve original deadlines,
each artifact identity and all failures. An observer correction would require
its own reviewed evidence; it cannot alter this case's recorded outcome.

After retention the fresh guest was powered down; new runtime container,
heavy build/rootfs/disk files and ephemeral keys were removed. Small private
logs/sources/artifact bytes remain for diagnosis. No release, production change,
full security acceptance or normal-keyboard pass follows from this packet.
The former share backing path itself was removed; remaining non-key small
diagnostics were relocated to a never-shared retention path. No live9p/QEMU
server or new container remains. Dedicated private/public transport-key copies
and guest/staging root filesystems were removed; no private-key material was
found in the sanitized public packet or retained small diagnostics. Original
retained infrastructure and the approved clean tooling image are unchanged.
