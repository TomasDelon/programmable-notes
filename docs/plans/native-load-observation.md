# Passive native WebView lifecycle observation

Outcome: SECURITY-01/REACT-01 gain a discriminating observation for the actual
190dbf0 fresh-guest sequence: two fixed-helper passes and one native-only React
ready timeout. Establish where construction/loading/termination stops before
attempting a behavioral repair. This does not implement another retry.

Invariants: original effective isolation/resource checks, strict STATE/title and
BRIDGE validation, Stop before unit age50, five-second cleanup, expiry and case
outcomes remain. No reload, eval, inspector, IPC, arbitrary URI/error strings,
filesystem authority, sandbox relaxation or longer test deadline.

Witness: a separate fixed native property records sticky lifecycle facts; strict
bounded parser/control tests reject malformed, late or unsafe data. A fresh guest
runs only after hosted compilation and the reviewed sealed infrastructure gates.
The observation is advisory and cannot turn a failure into a pass.

Done: meaningful focused controls and independent review, frozen-source full
checks/scans, hosted compile, one discriminating actual guest run, retained exact
results and next hypothesis. Native application readiness remains out of scope.

## Native property and limitations

Write only the child's own Plug property `_PN_FIXTURE_NATIVE` as UTF8_STRING/8,
at most256 bytes, with exactly these seven JSON keys:

- `version`: integer1.
- `built`, `committed`, `finished`, `navigation_denied`, `load_failed`: booleans.
- `termination`: `none`, `crashed`, `memory_limit`, `api_terminated` or `unknown`.

Publish initial false/none before WebKit construction. `built` means the WebView
constructor returned. Flags and the first termination are sticky. Preserve the
existing about:blank navigation predicate and download decision exactly. Record
typed WebKit **Committed** and Finished events, not request start. Finished is
not JavaScript success, and a failure may be followed by Finished.

Use the already locked WebKit2GTK2.0.2 typed load-changed, load-failure and
termination hooks;
return false from load-failed and do not reload on termination. Hooks attached
post-construction can miss earlier signals: false/none does not prove that no
such event occurred. Discard callback URI and error strings. Avoid the Wry
builder page-hook wrapper: it unwraps an optional URI internally; passive
instrumentation must not introduce that potential panic. No vendor change is needed.

## Bounded read

Only a failed ready phase whose cached title category is `native_only` or
`missing` may attempt the optional fixed xprop subprocess, against its previously
verified child XID and authenticated existing display. x11-utils is already in
both sealed recipes; add no package or arbitrary selector.

Reuse the existing process helper unchanged with a normal deadline of the minimum
of now+0.5s, unit-start+45s and the absolute deadline. Its existing kill/reap may
add up to1s: describe this honestly as1.5s nominal, not a hard real-time promise.
Skip if unit age is already44.5s; discard late results at age46 or the absolute
deadline. Original mandatory Stop-before50s remains enforced independently.
Never block on a new unbounded Xlib read.

Accept at most1024 bytes of exact xprop quoted-ASCII output, then at most256 bytes
of duplicate-key-free exact-schema JSON. Omit absent, malformed, injected,
overflow, late or stale-payload diagnostics. No raw output is published. Fixed
summary fields are revalidated against the frozen payload before annotations;
they confer no process, source, file or cleanup authority.

## Verification and ownership

- Native actor: fixed host Rust/Cargo files and small actual serializer/state
  controls where useful. No local GTK-build claim without dependencies.
- Observer actor: Python observer/parser/driver and directly affected controls,
  including timeout kill/reap, malformed data, headroom omission and unchanged
  Stop/core outcomes. No global command-helper changes.
- Independent reviewer: authority, exact schema, signal meaning, timing and
  source/payload binding. Root owns production browser checks and dispatches.

The next result may narrow a cause; it cannot by itself establish a WebKit bug,
CSP/JavaScript failure, OOM, hostile-document safety or stable application startup.

## Independent prompt/capability preflight (not this startup probe)

Source review found no explicit raw script-dialog, file-chooser, print or
fullscreen denial handlers in the fixed direct Wry host or the legacy preview.
The legacy page uses an allow-scripts-only iframe: modal/popup/fullscreen browser
policy must not be assumed for a future direct WebView. File input is a separate
negative case; iframe sandboxing alone does not imply it cannot offer a chooser.
No chooser execution or file disclosure was demonstrated by this read-only audit,
and the fixed counter does not accept arbitrary authored payloads.

Before arbitrary inline MDX activation, add and actually validate native denial
for dialog/print, file chooser and fullscreen surfaces. Use real user input, a
fresh document realm and a synthetic sentinel. Require no dialog/chooser or
selected-file receipt, retained trusted controls/focus and responsive Stop.
Do not substitute replaceable JavaScript wrappers or infer denial from Tauri ACLs.
Exact WebKit default UI/portal behavior remains unverified; this is a documented
activation gate, not a verified current exploit or startup-cause diagnosis.
