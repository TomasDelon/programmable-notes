# Long-paragraph editor viewport — 2026-11-19

A supported 1000-line literal paragraph opened a 27189.5px input in an 800px
browser viewport and a 600px native viewport. Input bytes were intact, but the
editing control was impractical. The bounded change adds `max-height:60vh` and
internal scrolling to the editor-owned textarea. No parser, source patch, history,
privileged operation, preview process or security policy changes.

## Executed observations

- Actual Chromium regression failed on uncapped geometry, then passed focus,
  full value, bounded height, scrolling to the end, actual text insertion, exact
  export and undo/redo. Full repository check passed 63 unit / 29 Chromium tests.
- Installed previous ELF 7d315faa… reproduced 27189.5px input height and failed
  before editing or writing the fixture.
- Capped installed ELF d37cf787… measured 360px height, 358px client height and
  27000px scroll height. One run passed real keyboard insertion, exact disk saves,
  undo/redo, mode 0640 and clean exit. That initial observer called Reopen without
  positively checking its acknowledgment; its pass does not prove reopening.
- Strengthened observer requires `Reopened from disk.`, absence of file errors
  and exact rendered paragraph text, in addition to exact disk bytes. The final
  ordinary observer run passed all gates with no debugger attached. A separate
  debugger-attached run passed these assertions and clean exit. The debugger
  observed normal renderer SIGTERM at shutdown, not SIGSEGV.
- **Two other native attempts failed at switching to Visual, before activating
  the textarea.** Kernel logs confirm WebKit renderer SIGSEGV. Driver session
  deletion left Rust roots alive; only the two verified owned roots were
  terminated. The new observer captures PID/start tick/executable and cleans up
  only that identity after session deletion. ENOENT/ESRCH mean disappearance,
  not a cleanup failure. A subsequent pass does not establish a crash fix.

Pure production-JSC diagnostics succeeded for 50 Unicode regex matches each on
narrow and widened strings, and for actual editable-range/block analysis and
patching of the same full source without DOM rendering. These narrow the search;
they do not exclude a JIT, DOM, driver, native rendering or emulation issue. A subsequent debugger run intended to cycle modes failed on its first Visual
transition (zero completed cycles) and captured actual SIGSEGV at an unresolved
indirect-call instruction. The debugger warned about PID namespace stack
reliability; no symbolic JavaScript stack or engine root cause is established.
The updated cleanup terminated its verified surviving Rust root. Thus debugger
attachment does not prevent the fault. The cause remains unknown. No JIT or sandbox switch, resource limit or deadline was
changed. Native long-document reliability remains blocked, distinct from optional
physical GPU/Wayland compatibility.

## Exact package and environment

- Debian SHA256: `ae7b10ad4ada38aa34dce01a71ce0ce9385c133e06d722db0131fc0dfedff3d6`.
- Installed ELF: `d37cf787536f68f3fa808c2695d3a539765987d134c3b23b33ba296cef38fbe6`.
- Optimized custom-protocol package, no security-test feature. Source hashes and
  package build/inspection/install results are retained. Native backend unchanged.
- Disposable Ubuntu 24.04 QEMU TCG 4 vCPU / 8 GB, authenticated Xvfb/Openbox,
  WebKitGTK 2.52.6, real systemd/cgroup v2 and documented software-rendering flags.
  Root WebDriver automation is external; production preview remains unprivileged.
- Installing debugger dependencies inside the VM first stalled on guest network
  downloads. Repository-authenticated packages downloaded in the existing Ubuntu
  builder and transferred to the disposable VM allowed diagnostic attachment.
  No core dumps, user files or process-memory snapshots are included.

## Reproduce

Build/install with `npm run native:package` and follow
[Linux desktop prerequisites](../../LINUX_DESKTOP_TESTING.md). Use a disposable
profile and the external tauri-driver/WebKitWebDriver service. From the repo:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-long-paragraph.mjs
```

The synthetic fixture is created exclusively, original bytes are checked while
input is pending, and actual OS keyboard Save is separate from source patching.
The ordinary successful observer SHA256 is
`312af19b84f0fba4752ba0cff8c48a0fcabc21c025bb7e478bea91c7d21a13ee`;
its exact source is retained. The checked-in observer subsequently moved lifecycle
cleanup into a separate function to satisfy the finally-block lint rule; that
cleanup was executed in the crashing debugger-cycle variant (its own SHA in JSON).
Each attempt writes a JSON report even on failure. Failed cases and observer
variants are retained in raw evidence. This is not a new full pressure/isolation
matrix or a production-readiness claim. Hosted CI is separately blocked before
runners by the account billing annotation.
