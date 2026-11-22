# Bounded long-document transition diagnostic

Base705caee, installed production ELF46f65e87…. No application, packaging,
permission, JIT, sandbox, resource limit or deadline changed in this milestone.
The unresolved native Visual-transition renderer SIGSEGV needs reproducible
phase observations, not a guessed production workaround.

The existing installed-app observer accepts optional `--visual-cycles N`, with
integer1..20 and default1. Invalid/unknown arguments fail before driver access or
fixture/evidence creation. Each Source/Visual transition records its requested
phase before acting and counts completion only after the exact rendered text is
observed. Failure remains failure; there is no retry that changes its outcome.
All existing exact input/geometry/disk/history/reopen/shutdown gates and
PID/start-tick/executable-scoped cleanup remain. Phase JSON uses ordinary
`writeFile`: it is best-effort progress logging, not atomic/fsynced storage or
power-loss/observer-crash durability evidence.

## Executed observations

The ordinary previous observer passed on current installed ELF
`46f65e87ad853e0147fcbce28037b16a671e4f31d75f123b5a9a49f2e8794846`.
The bounded observer then passed five actual Visual transitions and four Source
returns in the disposable Ubuntu24.04/WebKitGTK2.52.6 software-rendered QEMU
systemd desktop, followed by all ordinary acceptance gates. Both used the same
31,935-byte BOM/mixed-ending fixture. Input measured360px with27000px scroll
height; full value, actual keyboard tail edit, exact saves, Undo/Redo, mode0640,
positive reopen acknowledgment and clean exit passed. The captured kernel window
has no entries. This is **not** a fix or root-cause explanation for earlier crashes.

Argument-guard unit test first failed with old preflight exit2, then passed new
explicit exit1/message plus no fixture/evidence writes for five invalid commands.
Read-only review found no Important/Critical issues and confirmed no lost old gate.

Full `npm run check` passed formatting/lint/types/fresh build, **78 unit /32
Chromium tests**, before the following browser-import milestone began.

An external negative-control observer deliberately replaced only the second
transition's required observation with `false`, without mutating application DOM,
source or policy. It exited1 at the original wait deadline, retained
completedVisualCycles1/visual-2-requested/outcomeFail and never entered the editing
gates. Independent checks verified original fixture bytes/mode0640 and absence of
its owned Root after cleanup. The actual Visual DOM still contained the paragraph;
this is a reporter-refusal control, not a reproduced renderer crash. Exact variant
source, hashes, failed command and separate successful refusal verification are
retained. A subsequent observation cannot turn that failed command into a pass.

## Reproduce

Use a disposable profile, install the optimized package and run the external native
WebDriver with the prerequisites in `docs/LINUX_DESKTOP_TESTING.md`:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-long-paragraph.mjs --visual-cycles 5
```

The default argument-free command still performs one transition and all original
acceptance. Inspect its JSON on failure; a requested phase is not a verified one.
The package/source parity and native IPC evidence are in the preceding
`2026-11-19-opaque-source-navigation` directory. This milestone does not repeat
that binary build, IPC suite or a complete malicious-pressure matrix.

Prior native SIGSEGV, blank/startup and missing memory-OOM-before-expiry acceptance
remain unresolved. Physical GPU/Wayland/IME coverage remains absent. Hosted CI at
705caee run44537378889 was refused with zero steps for account billing; raw actual
annotation retained. The existing downloadable review continues to bind34dc906.
No production security readiness is claimed.
