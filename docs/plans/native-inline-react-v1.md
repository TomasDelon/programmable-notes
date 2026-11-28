# Fixed inline React diagnostic v1

27 November 2026. REACT-01 / SECURITY-01; next diagnostic engineering gates.
The owner's autonomous development authorization covers implementation and
runtime testing once these gates pass; this plan grants no application acceptance
or release approval. Preserve the [26 November result](../security-evidence/2026-11-26-wry-react-pointer/README.md),
including its share deviation and unproven Stop result.

- **Outcome:** observe actual pinned MDX/React pointer and normal keyboard input
  inside the existing GtkSocket/Plug diagnostic, followed by bounded trusted Stop
  and an independently observed fixed lifetime expiry.
- **Invariants:** unchanged Supervisor, sandbox and resource policy; no IPC,
  devtools, forced focus, JavaScript input injection, host shares, owner data or
  generic remote command API. The diagnostic host is not the application UI.
- **Witness:** native sentinel, React state/focus receipts, real OS input,
  verified live process identities and effective policy, bounded cleanup and
  trusted expiry cause, with source/artifact/environment hashes.
- **Done:** independently reviewed sources and negative controls, then actual
  runtime observations. Failed or unperformed phases remain explicit.

## Latest checkpoint and next gates

Current execution is strictly inline-react-guarded-v2; historical path names remain.
Canonical prepublication native guards compiled, but actual46072990136 on25041e7
failed readiness before pointer/keyboard or expiry. Termination, host input and
cleanup passed. Historical v1 success below is not transferred. Exact schema2
passive milestones are the next first-load observation; they do not grant
readiness or weaken any gate. See ADR043 and the dated evidence.

On2ad5910, sealed Debian13 run46057753337 passed this fixed helper's input/Stop
and natural-expiry cases. See the [dated evidence](../security-evidence/2026-11-27-shared-product/README.md).
Earlier startup failures remain retained; one pass does not prove repeatability
or a causal startup repair. This diagnostic is not the packaged application.

Independent review identifies the next application gates:

1. Integrate the existing DocumentRuntime/RenderedRuntime platform seams using
   read-only snapshots of explicitly loaded, authorized buffers, including
   imports. Keep one lifecycle/resource owner, not multiplied limits per island.
   Current native enabled:false and selected-file-only inputs are deliberate
   gaps; changing a toggle alone is insufficient.
2. Before arbitrary source publication, apply and test the native browser
   chooser/permission/dialog/print/fullscreen/download/navigation restrictions on
   the inline Wry path. Shared guards are now installed there, but actual handler
   denial witnesses remain unverified.
   Require real editor-positive and preview-negative IPC tests.
3. Reuse Supervisor and existing stress/editor/lifecycle fixtures for actual
   integrated CPU, both memory workloads, trusted OOM/expiry attribution, Stop,
   crash cleanup and interactive recovery. Shared-editor typing and real-file
   autosave must remain usable under attack. WebDriver ACL probes and normal
   production namespace/seccomp verification are separate observations.
4. Validate the actual packaged product: unsaved MDX imports/hooks/events,
   in-document geometry/scroll/resize/focus, multiple islands, switching, source
   fidelity/history, stale-build/session disposal, plugin disable and close.
   Establish repeatable startup on this candidate rather than looping unchanged
   diagnostic retries.

Arbitrary native React remains disabled until these gates pass. Physical GPU and
Wayland coverage is separate compatibility work; unsupported embedding must fail
closed. Independent editor/recovery development can proceed on the verified
platform without waiting for unavailable hardware.

## Admission before payload

Actual [share-free OS admission](native-vm-provisioning.md) must pass using the
reviewed public provisioner and the relevant image/launcher inputs before this
profile can run. Source tests, image packing and mocked SSH are insufficient.
Recheck admission in each fresh runtime before transferring or executing payload.

Keep controller private keys host-only, outside images, Docker contexts, payload
and evidence. Transfer only fixed allowlisted files over authenticated SSH/SFTP,
with the existing dedicated identity, strict pinned host key, no user SSH config
and no agent forwarding. Verify actual mounts and credential scope; reject any
host share. Run as `fixture`, UID 1001; root SSH stays disabled. Evidence and
artifacts live under a fixed guest-local directory in `/home/fixture`.

Before author input, verify the ordinary user manager, delegated controllers,
authenticated X11 and WebKit sandbox prerequisites. Stock Ubuntu namespace policy
is an open infrastructure gate: require actual distinct network namespaces and
NoNewPrivs, not a successful systemd request alone. Refuse before payload if the
unchanged Supervisor cannot verify them. Do not change namespace sysctls, install
an unconfined systemd-executor exception or weaken the service properties.

## Small implementation packet to review first

1. Add one `scripts/native-inline-react-v1/` profile containing the fixed MDX,
   compile script, Rust host/manifest/lock, observer and session entry. Adapt the
   archived templates in new files; remove historical `/repo`, `/mnt` and UID 1000
   assumptions. Keep actual vendored Wry `build_gtk`, GtkSocket/Plug and bounded
   own-window `_PN_FIXTURE_STATE` transport. No new product UI.
2. Build only on the trusted Ubuntu runner with pinned Node/Rust dependencies and
   current vendored Wry/native-policy. Compile MDX and bundle React without
   evaluating generated code in the host. Produce a fixed artifact manifest with
   source, lockfile, compiler, dependency, bundle and binary hashes. The guest
   receives binaries and fixed observer inputs, never a repository or compiler
   cache. Verify runtime ABI dependencies; explicitly supply the Gdk typelib
   (`gir1.2-gtk-3.0`) if absent from the current guest recipe.
3. Add a dedicated `scripts/native-vm-inline-react.py --run ABS_PACKED_ROOT` driver
   reusing reviewed smoke identity/process helpers. It accepts no caller command,
   payload, destination or executable. Its fixed transfer/run/collection protocol
   bounds bytes, filenames, output and time; no generic SSH payload service.
   Keep packing and the fixed QEMU guard unchanged. Add manual CI wiring only
   after source review and actual OS admission pass.
4. Add targeted tooling/profile controls before payload: altered identity/pin,
   share/mount, UID and manifest refusal; archive/path/size contamination;
   missing namespace/delegation refusal; signal/timeout cleanup; observer PID
   reuse, migration, non-zombie survivor, ESRCH and indeterminate cgroup races.
   Mocks establish control behavior only. Independently review this packet.

## Two bounded cases

The new MDX uses real React hooks, a stateful counter and a normal input field.
Publish bounded ready/count/field/focus receipts and sticky errors through the
existing native property callback. Prove the pre-JS sentinel before admitting
React readiness. Freeze and hash sources before execution; no automatic retry.

For **input and Stop**, retain readiness by unit age 44s, input by 49s, Stop begun
before 50s and a single 5s cleanup bound. Query the actual child XID, click the
counter twice and require React Count 0→Count 2. Click the field, wait for its
explicit focus receipt, then send one real typing sequence and require the exact
value. Do not force focus, invoke DOM click/focus or extend deadlines for startup.
Slow startup makes input not run; reserve the original Stop window. After Stop,
require real host keyboard input to remain usable.

Immediately before the trusted Stop click, verify live MainPID, start time,
non-root unit cgroup, membership and effective 512 MiB/zero-swap/25% CPU/128-task/60s
policy. Track descendants recursively by PID plus start identity. Pass cleanup
only within the original bound after a confirmed empty/removed group and no
matching live non-zombie historical identities; retain migration evidence.
Reuse `native-cleanup.ts` predicates and `native-stress.mjs` process-read rules:
ENOENT/ESRCH may describe a raced process exit, never prove group emptiness.
Indeterminate cgroup reads require another valid sample. Unexpected observer
errors retain phase/traceback and fail the witness; later checks cannot repair it.

For **expiry**, use one separate fresh supervised unit with the same fixed policy
and no Stop action. Establish its live identity before expiry, observe cleanup
by unit age 75s, and require the trusted user-manager
runtime-timeout cause. Group disappearance alone does not attribute termination
to expiry. Collect actual namespace, NoNewPrivs, renderer seccomp and controller
observations separately from the input result.

Retain bounded sanitized receipts, hashes, screenshots and failures; clean only
new owned runtime resources and keys through reviewed lifecycle handling. This
profile cannot establish application ACLs, arbitrary document geometry, hostile
CPU/memory denial or the full security matrix. Those remain separate gates.

## Fixed execution interface and evidence scope

The manual CI opt-in is `native_vm=true` together with
`native_inline_react=true`; every unrelated input retains its default. Inline
mode alone is rejected before checkout. Ordinary PR jobs remain mandatory and
are not duplicated by this optional diagnostic. OS-only admission remains the
default `native_vm=true` mode.

The fixed driver owns one guest lifecycle: it freezes only the compiled helper,
versioned session, observer and generated integrity manifest before launch;
performs the existing OS admission and bracketed SSH negative controls; transfers
the four files; and runs Stop followed by expiry. It accepts no executable,
command, destination or payload argument. Controller private keys remain on the
host. File transfers use one directly owned pinned SSH subsystem process with
bounded SFTP-v3 packets; collection uses fixed no-follow descriptor traversal,
not archive extraction or unrestricted download.

The helper embeds its exact compiler manifest in an unambiguous bounded frame.
The driver inspects bytes without executing the helper, validates current source,
lock and installed package metadata, and records compiler/dependency/bundle and
binary identities. This assumes the reviewed trusted build producer; it is not
an independent supply-chain attestation. The native bridge property is separate
from title state, so fast React startup cannot erase the pre-WebKit sentinel.

Only strict enum-based aggregate/case summaries and public hashes are uploaded.
Raw host logs, authentication files and guest trees are excluded. Each upload
requires a receipt copied during that run. The helper is **not the production
application**: `native_app_tested` stays false even if both fixed diagnostic cases
pass. Pointer/keyboard, termination and host responsiveness are separate fields;
an OS pass, compilation, screenshot or spoofable title cannot stand in for them.

Implementation and control-test evidence precede runtime execution. Until an
actual completed run is recorded, all native diagnostic observations remain
unexecuted; no changed deadline, forced focus or relaxed namespace policy is an
acceptable workaround.

## Current admission blocker

Run45935023462 on f7d6853 reached the real effective network-namespace check and
refused startup before input. Its host failure and teardown interruption are
recorded separately from earlier unknown causes. Application cleanup remains
unproven. Do not launch another identical Ubuntu case or change the observer to
accept the shared namespace. Investigate a stock suitable environment and record
its separate OS/namespace admission before any new payload. Distribution-specific
compatibility and the full production matrix remain separate gates.
