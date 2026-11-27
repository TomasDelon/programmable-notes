# Fixed MDX/React fixture: compiler and browser control

27 November 2026. Preparation for
[inline-react-v1](../../plans/native-inline-react-v1.md), REACT-01 / SECURITY-01.
This packet contains a fixed compiler fixture and browser control, not a native
host, guest run, containment result or production application acceptance.

## Inputs and artifact identity

The versioned [document.mdx](../../../scripts/native-inline-react-v1/document.mdx)
uses actual React `useState`/`useEffect` for a counter and controlled input. The
[compiler](../../../scripts/native-inline-react-v1/compile.mjs) exports only
`compileFixture()`, accepting no payload or path arguments and returning HTML and
manifest bytes. There is no CLI, output-file API or privileged runtime interface.
Compilation/bundling does not evaluate generated code in the Node host.

Installed dependency versions must match the repository lock and direct pins:
`@mdx-js/mdx` 3.1.1, esbuild 0.28.2, React/ReactDOM 19.3.1 and the locked scheduler
0.28.0. The manifest records installed package-metadata hashes, Node version,
source/compiler/package/lock SHA-256 hashes, compiled-MDX/JavaScript/HTML hashes
and byte sizes. Repeated compilation under identical inputs produces identical
bytes. Esbuild retains inline legal comments; the existing
[third-party notices](../../demo/THIRD_PARTY_NOTICES.txt) preserve the applicable
React, ReactDOM and scheduler license texts.

The HTML bundles its dependencies and carries a restrictive CSP. Browser control
uses an iframe with `sandbox="allow-scripts"` and no referrer. These restrictions
are not proof of native process, namespace, filesystem or aggregate resource
containment.

## Observed browser behavior

The root task's corrected matching-browser run passed one test in 2.9 seconds:
two real button clicks produced React Count 0→Count 2; a real field click produced
the explicit focus receipt; only then did `page.keyboard.type('hello')` send one
typing sequence. Both the actual input value and bounded title receipt confirmed
`hello`, with Count 2 retained and an empty error code. No DOM focus/click or
JavaScript value injection was used to establish input behavior.

The first launch attempt omitted the matching browser-cache environment and did
not launch a browser. It was an infrastructure/setup failure, not a failed
product interaction test. The corrected run is the browser observation above.
This packet makes no claim that the concurrently running full check completed.

Title receipts contain fixed profile/readiness/count/focus fields, at most 16
UTF-16 input units and a sticky fixed error code, with a 256-byte UTF-8 ceiling.
They are spoofable document-controlled diagnostics. They convey no source/file
authority and never authorize host actions. Manifest and browser receipts keep
`nativeTested: false`.

## Reproduction and report attachments

From the repository root, using the pinned Node/npm versions and installed locked
dependencies, run the focused compile controls:

```sh
node --test tests/tooling/native-inline-react-fixture.test.mjs
```

Those controls check reproducible hashes and package identities, HTML parsing
with script execution disabled, generated-script syntax through `node --check`,
preserved policy/legal comments, rejected compiler arguments and absence of
generated bootstrap evaluation in the host. They do not execute React input.

Build the standard browser test server inputs, then run the actual browser spec
with Playwright's matching installed Chromium:

```sh
npm run build
env -u PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH PLAYWRIGHT_BROWSERS_PATH=/workspace/.cache/ms-playwright npx playwright test tests/e2e/native-inline-react-fixture.spec.mjs --project=chromium
```

The cache path above is this cloud workspace's location; a standard runner uses
its matching Playwright installation. The spec attaches `fixed-fixture-manifest`
and `browser-fixture-receipt` JSON to Playwright reports. Where CI retains those
reports, inspect these attachments for the exact artifact and observed state;
attachment generation does not itself establish an uploaded or passing CI run.
Their scope is `fixed-fixture-build-only` / `browser-fixture-control-only`.

No native host/driver, SSH transfer, VM, namespace admission, Stop/expiry observer,
hostile CPU/memory test or production permission check was implemented or run by
this packet. Native payload execution still depends on successful reviewed stock
OS admission and the remaining fixed-profile plan gates. The earlier deviating
native result remains unchanged.

## Native host source preparation

The isolated `host/` crate embeds only these fixed compiler artifacts through its
trusted build script. It reuses the reviewed GtkSocket/Plug and Supervisor path;
stdin remains blocked until actual resource/namespace checks pass, before WebKit
starts. Own-Plug native sentinel/title metadata is bounded to256 UTF-8 bytes and
never dispatches actions. Runtime UID1001 and exact arguments are required.
Navigation/download/devtools restrictions, clipping and trusted native Stop remain.

All235 registry lock records match the application lock. The actual Rust build
script compiled and generated fixed public artifacts; Node-specific preload
options are removed while registry/proxy/CA settings remain. This is not general
build-environment sanitization or host evaluation of the generated document.

Three host tooling groups passed. The complete local regression packet passed
**793 unit, 119 tooling / zero skips, 153 Chromium, 9 Pages and 4 inactive-cloud
cases**, plus formatting/lint/types/build. GTK host compilation is not a local pass:
GLib development metadata is missing. A locked release build was added to the
existing native CI job, reusing its target/cache without another job or installer.
No native host execution, driver, containment or product acceptance is implied.

## Actual hosted host compilation

At **37e45f4**, [native CI job140274299391](https://github.com/TomasDelon/programmable-notes/actions/runs/45928155833/job/140274299391)
completed the locked fixed-host release compilation successfully on Ubuntu24.04.
This observation is the host compilation step, not a claim about the whole job's
final outcome or native rendering/input. The independently completed OS-only
[run45928250450](https://github.com/TomasDelon/programmable-notes/actions/runs/45928250450)
also passed the updated Gdk-enabled guest recipe. Pointer, keyboard, Stop and
expiry remain unexecuted until the reviewed fixed profile runs.

## Fixed guest input and termination profile

The successor profile transfers only the immutable helper, session, observer and
integrity manifest after the same fresh guest passes OS admission and bracketed
SSH identity refusals. No controller private key, repository, compiler cache,
owner vault or host filesystem share enters the guest. Authenticated Xvfb uses a
fresh guest-only cookie; the existing user manager and delegated controllers are
required. No namespace policy or resource bound is relaxed.

The first case observes the persistent native bridge, actual React counter
clicks and explicit field focus before one ordinary keyboard typing sequence.
It checks the live unit identity/policy immediately before Stop, then historical
process identities and group cleanup within the original five seconds, followed
by real trusted-host input. The second case uses a fresh unit and requires the
authenticated systemd runtime-timeout cause before closing its host. Disappearance
or a later Stop cannot stand in for expiry. Renderer UID, NoNewPrivs, distinct
network namespace and seccomp-filter observations are separate from title data.

Synthetic controls cover contaminated inputs, fixed framing and stale build
metadata, bounded real pipes, process reuse/zombies, migration, cleanup races,
missing expiry cause, stale artifacts and individual CI step guards. They do not
establish native behavior. The helper's manifest is inspected without executing
it on the controller and records its actual embedded compiler/dependency/bundle
identities under the trusted-build assumption.

The explicitly optional command is:

```sh
gh workflow run ci.yml --ref fix/preview-markdown-input -f native_vm=true -f native_inline_react=true
```

All unrelated dispatch inputs retain defaults. OS-only mode remains available
without the inline flag. The `fixed-native-inline-react-diagnostic` artifact
contains only the validated aggregate/case summary and public hashes; private
host logs, authentication data, screenshots and guest trees are excluded. GitHub
notices retain fixed enum-only diagnosis without depending on artifact download
access. **No native profile result is claimed until its completed run is recorded.**
Even a passing helper is not the product application or full security acceptance.

The complete local packet check exited **0**: **793 unit, 125 tooling / zero
skips, 153 Chromium, 9 Pages and 4 local cloud-storage browser cases**, plus
formatting, lint, strict types and production build. The three new wrappers
exercise **14 driver, 28 observer and 23 session controls**; the smoke wrapper
exercises51 controls and the receipt reporter10. Independent review repeated the
native control cases and found no remaining blocker. These are source/control
and browser observations, not native runtime passes. Functional file identities
were checked unchanged after the complete run.

## First actual native profile: desktop startup failed

At **aeff50b**, [run45931348826](https://github.com/TomasDelon/programmable-notes/actions/runs/45931348826)
**failed**. Its helper compiled, the fresh guest passed OS admission and
bracketed SSH identity denials, and normal QMP shutdown passed. The validated
native notices reported `session_phase=desktop`, `session_reason=deadline`,
`cleanup=passed`, and both cases `not_run`.
[Annotation summary](native-profile-45931348826.json) retains those exact fields.
No native pointer, typing, Stop, expiry or renderer-policy result is claimed.

The desktop reason currently combines xauth startup, an individual display
probe, the five-second readiness window and the overall session budget. The
exact failed substage and original cause are **not established**. A separate
controlled local child reproduced a real source-level issue: a first display
probe exceeding its one-second call bound aborts the entire five-second
readiness loop instead of becoming a failed sample within that original bound.
This reproduces a possible failure mode, not the cause of this actual VM run.
The next correction preserves all absolute bounds and adds fixed substage
categories. Earlier failed observations remain failed.

## Readiness-loop correction and discriminating next run

Controlled real Python probes reproduced the faulty loop: a first display probe
exceeding one second aborted before later readiness samples. The corrected loop
treats only a cleaned-up per-call timeout as a failed sample inside the same
original five-second absolute window. It rechecks the owned Xvfb process before
and after probing. A separate outer deadline still wins; no unit, input, Stop,
expiry or overall session bound changes.

All28 session controls passed, including slow-first-probe then timely readiness,
permanently slow probes failing within the existing bound, retained shorter outer
deadlines, authentication timeout and premature Xvfb exit. Driver15 controls
include the three exact new failure enums and injection refusals. Independent
review repeated both groups. The next native run distinguishes `xauth_deadline`,
`display_readiness_deadline` and `xvfb_exited`; none is retroactively assigned to
run45931348826. This local control correction is not a native startup pass.

## Second actual native profile: host observation and cleanup failed

At **30daf57**, [run45932957386](https://github.com/TomasDelon/programmable-notes/actions/runs/45932957386)
**failed** after desktop startup completed. The Stop case reported
`phase=host`, `reason=observer_error`, with all five observations `not_run`;
expiry was not run. Session cleanup reported `cleanup_failed`. OS admission and
normal guest shutdown passed. [Exact annotation summary](native-profile-45932957386.json)
keeps application teardown failure distinct from hypervisor shutdown.

No parser defect, namespace cause or original host exit is established. A
controlled signal to an observer waiting for its host reproduced the same
observer receipt, so it could be a consequence of session teardown after early
host exit. Separately, a nonzero host exit without a confirmed unit record
correctly retains unproven cleanup. These local reproductions do not identify
the actual run's cause. Existing private exception events were not included in
the public summary; the next diagnostic packet exports only validated own-source
frames, exception type/errno and bounded host stage/exit fields. Raw logs and
credentials stay private. No isolation, cleanup criterion or deadline changes.

## Bounded startup and exception diagnostics

The next packet preserves each case's original reason and host/observer exit
state **before teardown**. Fixed native startup markers distinguish supervisor
entry and exact known static error categories; unknown or malformed markers
remain unknown. These categories are diagnostic only and cannot authorize
cleanup, retry or document operations. No raw stderr capture was introduced.

The controller separately extracts only validated exception type, errno and
at most eight own-source function/line frames from existing private JSONL.
Parsing uses bounded JSON and AST data only. Notices revalidate source identity
against the frozen transferred observer. Missing/malformed diagnostics are
omitted while the original outcome remains intact. Raw messages, paths,
credentials and guest trees are not uploaded.

Independent controls passed:19 driver,13 diagnostic helper,33 session and3 host
groups. Review found no remaining blocker. These diagnostic controls do not
establish the actual host cause or successful native cleanup; both earlier runs
remain failed until separate new execution is recorded.

## Third actual profile: effective namespace admission refused

At **f7d6853**, [run45935023462](https://github.com/TomasDelon/programmable-notes/actions/runs/45935023462)
**failed**. The [validated annotation summary](native-profile-45935023462.json)
now identifies the actual boundary: `host_stage=start_failed`,
`start_failure=network_not_isolated`, host exit1 while the observer was still
running. Its original session reason was `observer_failed`; teardown then
interrupted the observer in `run`→`_wait`→`interrupted`, producing the secondary
`observer_error`. The exception metadata is validated against the frozen source.

The unchanged supervisor rejected actual network-namespace isolation before its
input write. Requested PrivateNetwork alone was not accepted as evidence. No
React input, native Stop or expiry ran, and application cleanup remained
unconfirmed/failed. OS admission and normal VM shutdown passed independently.
This is a real fail-closed namespace observation, not successful native product
acceptance. Earlier failures retain their original unknown causes.

The OS policy reason for the missing namespace is not directly established by
these notices. Existing ADR004 documents Ubuntu's possible AppArmor/systemd
silent-skip behavior; that is supporting context, not a new kernel-log diagnosis.
No global namespace sysctl, executor exemption, isolation property or resource
limit is changed. Further work must use an actually suitable environment or a
separately reviewed secure backend; compilation or a weaker assertion cannot
clear this blocker.

## First sealed Debian native diagnostic — failed

[Run45940249067](https://github.com/TomasDelon/programmable-notes/actions/runs/45940249067)
on fd6f7f2 passed same-lifecycle Debian OS admission and the unchanged effective
namespace/UID/no-new-privileges/cgroup admission before document input. The
embedding bridge passed, but React readiness hit its original deadline.
Pointer and keyboard observations did not run. Stop termination and trusted-host
input passed individually; the entire case failed and expiry did not run.
Session cleanup also failed. Neither partial observations nor VM admission
establish product application acceptance. The cause of missing React readiness
and failed host teardown is under investigation; neither is yet attributed to
WebKit, rendering, policy or window-manager behavior.

[Bounded annotation receipt](native-profile-45940249067.json). Existing Ubuntu
namespace failures remain failed. No isolation setting or deadline was relaxed.

## Test-driver close protocol correction

The session used `xdotool windowclose`, whose
[pinned upstream implementation](https://github.com/jordansissel/xdotool/blob/v3.20160805.1/xdo.c#L1838-L1841)
uses `XDestroyWindow`. The fixed host exits its GTK loop in its delete-event
handler; server-side window destruction bypasses that close-request protocol.
This is a concrete source mismatch, not proof that it caused every previous
cleanup failure. The driver now sends `WM_PROTOCOLS` / `WM_DELETE_WINDOW` to
the host PID/XID-verified owned window, using the existing bounded tool path.
There is no destroy fallback, relaxed exit check or changed cleanup deadline.

Thirty-eight session controls pass, including execution of the fixed client
message against a mocked Xlib boundary, a destructive negative control and
foreign/noncanonical window refusal. These are protocol/source controls, not
real X11/GTK or native shutdown evidence. A fresh guest run remains required.

## Readiness failure diagnostic

A failed ready-phase observation can now export the last already-read STATE
property as a fixed category: missing/empty, native bridge only, bootstrap
pending, initial/noninitial React, known fixed error category or invalid data.
It performs no additional native property read, JavaScript evaluation or wait.
The existing strict title validator and failure behavior are preserved.
The host accepts this optional category only for the failed ready phase and
revalidates the exact frozen observer hash. Raw titles, field contents and
exception text are never exported. Missing/invalid diagnostics are omitted;
they cannot change case status, cleanup authority or the original deadline.

This is a discriminating probe for the next fresh guest run. It does not establish
why run45940249067 lacked React readiness, or claim that rendering is repaired.
