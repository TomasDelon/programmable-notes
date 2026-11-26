# Native inline runtime feasibility, 26 November 2026

Scope: PRODUCT-01, REACT-01, SECURITY-01 and acceptance A01/A09–A11.
Source inspected: `dc60a3d69913d8e30ae66e1a55591a82d3526a38`.
This is research, not an implementation decision or native acceptance pass.
No product code, permissions, resource policies or retained VM state changed
during the initial investigation.

## Finding

The current separate-window runtime does not satisfy the product contract.
There is a concrete, narrow **X11-only embedding hypothesis** worth testing before
replacing the host: create Wry's child X11 window from the supervised process,
using a trusted parent-window XID supplied by the editor. Unlike constructing a
WebView in the editor, this could retain the current launch-before-author-payload
verification and complete child process ownership. It has not yet been shown to
provide correct focus, clipping, scrolling or even reliable cross-process GTK
behavior. Native parity remains blocked.

The outer shell cannot directly validate GTK/WebKit or cgroup containment. A
cached disposable VM toolchain is available through Docker, so lack of an outer
desktop is **not** evidence that a fresh VM experiment is impossible. The
remaining work includes an executable embedding experiment and then the full
security matrix against its actual artifact. Neither an iframe nor successful
embedding alone would establish resource security.

## Observations proved by local source inspection

- `src-tauri/src/main.rs` launches the current executable as a separate
  `--preview-child`, reads bounded HTML from stdin before GTK starts, creates a
  `WebviewWindowBuilder` with label `preview`, and uses an incognito context.
  The preview has no document store/dialog plugin; command handlers repeat
  caller-label and child-mode authorization. Downloads are explicitly denied.
- `native-policy/src/lib.rs` verifies actual cgroup controller files, distinct
  network namespace, non-root matching UID and `NoNewPrivs` before delivering
  author HTML. Its aggregate child policy is 512 MiB RAM, zero swap, 25% CPU,
  128 tasks and 60 seconds, with `KillMode=control-group`, OOM group termination
  and an independently enforced lifetime. Stop owns the unit, not just a view.
- Vendored Wry 0.57.2 `src/webkitgtk/mod.rs::new_as_child/new_x11` obtains an Xlib
  parent handle, calls `XCreateSimpleWindow(display, parent, ...)`, and wraps the
  created window with `gdk_x11_window_foreign_new_for_display`. The code does not
  check that the parent belongs to the same OS process. This is an actual
  implementation path, **not proof** that passing another process's parent XID
  works correctly. `WebViewBuilder::build_as_child` explicitly excludes Wayland.
- Wry's `build_gtk` and `reparent` instead take live GTK container objects.
  `reparent` removes a WebView from its current container and adds that same GTK
  object to another. These APIs do not export a remote process's GTK widget.
  The multi-WebView and reparent examples therefore do not prove this boundary.
- Creating native overlay WebViews in the editor through `build_gtk` can solve
  positioning, but does not place their WebKit descendants in the existing
  supervised unit. Separate ephemeral profiles/process models do not establish
  pre-execution cgroup or namespace enforcement. No such pre-execution launch
  hook was found in the inspected pinned Wry interface. Moving an observed PID
  later would leave an execution race and miss shared/future processes.
- The pinned WebKitGTK Rust bindings expose process-model/count settings,
  context sandbox settings, native snapshot capture and extension messages.
  Those are not a demonstrated external compositor or an atomic launch into
  the verified preview unit. Snapshot capture alone is not interactive input,
  focus, accessibility or editable document integration.
- Both runtime entry points require adaptation: `WebApp` uses `WebPreview` for
  whole-document execution, while
  `src/editor/rendered/RenderedRuntime.tsx` directly imports `useWebPreview` and
  `WebPreview` for each inline island. Changing only the full preview leaves the
  islands on the browser runtime. The current singleton supervisor stops its
  previous unit at every start; it cannot independently serve several islands.

## Candidate comparison: hypotheses, not validated implementations

| Candidate                                                                         | Whole document                                             | Inline islands                                                                           | Security/engineering implication                                                                                                                                               |
| --------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Supervised Wry process with raw X11 child-parent handle                           | One clipped document rectangle is the smallest experiment. | Several surfaces in one supervised process/unit; trusted editor supplies each rectangle. | Most direct reuse of the current boundary. Requires focus, lifecycle and clipping proof. X11 only; existing authenticated-X11 residual risk remains.                           |
| GTK WebViews created by trusted editor                                            | GTK placement is available.                                | GTK fixed placement is available.                                                        | Existing supervisor is not inherited. New process-launch isolation proof would be required before author code; profile separation alone is insufficient.                       |
| Web iframe inside editor WebView                                                  | DOM integration is straightforward.                        | Existing web islands demonstrate presentation.                                           | No independent native aggregate CPU/memory/Stop proof. Cannot satisfy A11 by itself.                                                                                           |
| Separate child rendered into bounded pixel surfaces, input routed by trusted host | Potentially possible.                                      | Potentially possible with a surface per island.                                          | Larger protocol/compositor implementation. Wry offers no proven turnkey path here; keyboard/IME/a11y and host memory/message amplification become explicit obligations.        |
| Private nested Wayland compositor/surface broker                                  | A possible future replacement presentation adapter.        | Requires real surface-to-document composition and input routing.                         | Not an available pinned implementation. Must avoid giving the child editor desktop/portal authority. Do not substitute this speculative project for the narrow X11 experiment. |

X11 window parenting does not create DOM membership. To count as inline, the
surface must occupy the component's actual document position, clip at the
document viewport, track scrolling/zoom/resizing, respect trusted UI stacking and
move with surrounding paragraphs. A floating child window following approximate
coordinates would fail acceptance. Whole-document embedding alone also fails the
inline-island requirement.

## Smallest next spike

Use an isolated harness, not another application route. Start with a trusted GTK
parent containing text above/below one reserved rectangle. A separate supervised
Wry harness uses the actual pinned `build_as_child` Xlib implementation and
receives the trusted rectangle parent XID. Keep its explicit ephemeral context,
WebKit sandbox, download/navigation denial and absence of author-callable native
IPC. Initially load only a fixed Counter/input fixture, then the real compiled
Counter artifact. A Python GTK/X11 equivalent can cheaply test underlying native
parenting first, but must be labelled an API feasibility observation, not proof
of the actual Wry integration.

1. Prove the rendered child has a different process identity, its X11 parent is
   the reserved host child window, and there is no independent managed top-level
   preview. Record screenshot, window tree, PID/start identities and artifact
   hashes. A painted rectangle alone does not prove input.
2. Click twice; type non-ASCII text; verify Tab/Shift-Tab entry and exit, Escape,
   pointer capture, IME/composition and focus preservation across source edits.
   Native focus selection may need a trusted focus handoff; do not silently add
   editor IPC exposed to authored JavaScript. Record any unsupported interaction.
3. Scroll the parent document past all rectangle edges, resize, change display
   scale/zoom, open a trusted overlay, and hide/switch documents. Prove clipping
   and hit testing; no child may obscure or intercept the trusted toolbar.
   Test selection and accessibility traversal across document/surface boundaries.
4. Add a second island to the **same** supervised unit, not another independent
   512 MiB/25% budget. Repeat interaction while the other island is offscreen.
   Compare native descendant identities and effective aggregate controller files.
5. Stop via the trusted host before expiry; require the existing bounded
   cleanup oracle for all tracked descendants. Rebuild an interactive Counter.
   Separately test host crash, surface destruction, runtime renderer crash,
   document switch, natural expiry and stale surface/build replies.
6. Only after presentation works, run both unchanged memory fixtures and the
   CPU loop, real editor source input and disk persistence, trusted OOM/expiry
   journal predicates and negative IPC/network/file/download probes. Re-run the
   complete A11 matrix against the actual selected host artifact.

Minimum future control protocol: editor-owned document/session/build/surface
identities; bounded artifact and surface counts; bounded latest-only geometry
updates; resize/visibility/input operations only; and no filesystem path or
document-mutation command. The existing EOF-terminated stdin artifact mechanism
would need a separately reviewed persistent framing/control adapter for resizing
and multiple surfaces. Renderer reports remain untrusted presentation data and
cannot authorize editing, file writes or unlimited host allocation. Bound pixel
dimensions, native resources and processing frequency; presentation work outside
the preview cgroup must not become an unbounded escape from its budget.

Initial harness rebuilds may reset all state explicitly. Product implementation
must subsequently preserve unaffected component instances where code/dependency
witnesses permit, and document resets when that cannot be done safely. No stale
frame or callback may regain focus or attach to a newly selected document.

The existing 60-second expiry remains in force, including while surfaces are
hidden or inactive. No automatic endless restart or offscreen suspension may
silently extend execution. Linux-first does not mean Wayland has been validated;
if only X11 passes, record that concrete compatibility limit.

## Current infrastructure: observed 26 November

Read-only checks in the outer shell found PID1 `tail`, user systemd state
`offline`, no configured user bus/runtime directory/display, no installed GTK3
or WebKitGTK pkg-config metadata, and a read-only cgroup mount. `/dev/kvm` is
absent. Those facts prevent direct native security validation in that shell.

However `docker ps -a` found the retained `pn-m3-build` container running, with
cached `ubuntu:24.04` image `7da97f743f39`; Docker's cgroup driver is `none` and
storage driver `vfs`. Read-only inspection found QEMU and qemu-img inside it,
`/vm/guest.ext4` (24 GiB logical, about 6.2 GiB allocated), a 15 MiB kernel and
63 MiB initrd, and no QEMU process. Retained provisioning scripts use a full
4-vCPU/8-GiB TCG VM, not host cgroup enforcement. `/tmp/pn-accept-debs` holds
about 1.1 GiB/545 cached packages including QEMU, the Ubuntu kernel, GTK and
WebKitGTK. `/tmp/pn-m3-infra` holds provisioning/delegation recipes, toolchain
and private task-local credentials; do not publish or copy credentials into this
research document. Its small reproducibility archive is scripts, not a VM image.

At inspection, the shared overlay had 21 GiB free and the machine reported
approximately 32 GiB available RAM. A fresh disposable TCG experiment is therefore
plausible within these observed resources. Cached assets do not prove all fresh
dependency resolution or provisioning will work. Use a separate uniquely named
container, disk, profile, key and logs; never boot or modify the retained guest
to manufacture current evidence. A full fresh build should budget roughly
8 GiB guest RAM plus host overhead, at least the previous documented 15 GiB
free-space working budget, and TCG startup latency under unchanged child limits.
The historical 24 November package matrix failed its CPU Stop attribution case;
retained older guest logs cannot certify this new embedding design.

## Reproduction and evidence limits

Initial commands, all source/read-only observations:

```sh
git rev-parse HEAD
rg -n 'new_as_child|new_x11|XCreateSimpleWindow|reparent' src-tauri/vendor/wry/src/webkitgtk/mod.rs
rg -n 'build_as_child|build_gtk|with_related_view' src-tauri/vendor/wry/src/lib.rs
cat native-policy/src/lib.rs
cat src/editor/rendered/RenderedRuntime.tsx
pkg-config --modversion gtk+-3.0 webkit2gtk-4.1
systemctl --user is-system-running
systemctl --user show-environment
findmnt -no OPTIONS /sys/fs/cgroup
docker ps -a --format '{{.Names}} {{.Status}}'
docker info --format '{{.CgroupDriver}} {{.Driver}}'
docker exec pn-m3-build qemu-img info /vm/guest.ext4
docker exec pn-m3-build ps -eo comm
df -h /tmp
free -h
```

The missing-package/user-bus results are failed prerequisite probes, not tests
that passed by skipping native execution. No embedding, focus, clipping, memory,
CPU, Stop or runtime privilege assertion passed during this initial inspection.
Safe native inline execution cannot yet be claimed from this evidence. A fresh
VM experiment is an executable next step; the milestone stays blocked until its
presentation and security obligations are both demonstrated.

## Fresh executable experiment: partial, not a pass

A new `pn-inline-20261126` container and newly built guest disk were provisioned
without booting or modifying the retained guest. Cached packages alone failed
dependency closure; the failed `dpkg` and offline-recovery logs remain retained.
Official Ubuntu repositories subsequently supplied missing dependencies. The
guest booted kernel 6.8.0-149 with its own running systemd and writable cgroup2;
the outer Docker cgroup driver remains unsuitable for containment testing.

The fixed diagnostic is Python GTK/WebKitGTK 2.52.6, not Wry or the application.
It reproduces the relevant native API sequence: trusted GTK EventBox parent,
separate process `XCreateSimpleWindow` using that parent XID, foreign GDK window,
GTK window realization and ephemeral explicitly sandboxed WebKit context.
Only fixed trusted Counter/input HTML is used. There is no hostile-code safety
claim, no production change and no product behavior acceptance from this harness.

Initial executable observations:

- The new guest's namespace positive control observed different actual network
  namespace IDs. The disposable guest uses the previously documented explicit
  systemd-executor AppArmor namespace opt-in; no global restriction was disabled.
  The exported container rootfs retained its Docker detection marker, so guest
  systemd initially omitted securityfs mounting. Explicitly mounting securityfs
  restored profile loading; both failed startup attempts are retained. A cleaner
  future image must remove that marker before boot. This rough diagnostic image
  is not a production validation environment.
- First host PID505/XID4194318 and child PID513/XID8388609 were observed.
  The child reported parent XID4194318 and sandbox flag true. Actual cgroup files
  during the repeated run read `cpu.max=25000 100000`,
  `memory.max=536870912`, `memory.swap.max=0`, `pids.max=128`.
  These samples do not replace descendant ownership/cleanup or attack tests.
- The first child needed about 40 seconds to reach WebView setup. Its first
  `LOAD_STARTED` event appeared at the fixed 60-second unit boundary. No Counter
  render or interaction was established. The screenshot showed the trusted host
  and a blank reserved rectangle; that is not an inline React success.
- The first input observer stopped before sending input because `xwininfo` was
  absent. Its traceback is retained; a second observer uses installed `xdotool`.
  AT-SPI bus services are also absent, and EGL/GDK warnings occurred. Focus,
  accessibility and clipping cannot be accepted from these initial observations.
- The single warm-cache control also failed to render before expiry. ChildPID651
  reported WebView setup at17:24:06 after hostPID645 started at17:23:10; the unit
  reached its unchanged runtime limit at17:24:12. Input sent by the replacement
  observer appeared in the trusted host entry, with the component rectangle
  blank. No component interaction or child clipping was demonstrated.
- The journal recorded a stop timeout/SIGKILL and a kill-control-group
  `Invalid argument` warning. Later samples found the cgroup and sampled PIDs
  absent; this was not the existing bounded cleanup oracle and is not a Stop
  pass. The new guest then shut down cleanly, with QEMU absent afterward.

The diagnostic uses plain fixed HTML/JavaScript, not React or compiled MDX.
It does not establish that foreign-window lifecycle behavior, software-rendering
cost or incomplete diagnostic initialization caused the failures. Do not infer
that an increased resource budget would fix them. The next useful narrow test
is the actual pinned-Wry path on disposable desktop infrastructure with
independent parent-tree/input/clipping observation, retaining the same policy.

The [sanitized evidence packet](../security-evidence/2026-11-26-native-inline-spike/README.md)
retains exact synthetic probe sources, hashes, commands, failed observations and
two screenshots. It explicitly distinguishes this partial native API experiment
from the application's required same-document React and security acceptance.

Diagnostic scripts, provisioning failures, console/journal samples and screenshots
are retained under ignored `.cache/native-inline-spike/2026-11-26/`. Restricted
rootfs extraction was moved outside the repository after it caused a formatter
traversal error; permissions were not relaxed to hide that error. Future scripts
extract into the new container's `/tmp`, outside repository traversal. Raw guest
keys, images and rootfs files must not be committed. The repository research
document is the reviewable result; ignored artifacts are task-local evidence.
