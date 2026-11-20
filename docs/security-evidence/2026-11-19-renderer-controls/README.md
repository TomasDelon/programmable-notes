# Native renderer narrowing controls — 2026-11-19

The installed package's intermittent first-Visual SIGSEGV remains unresolved
([actual debugger fault and exact package](../2026-11-19-long-inline/README.md)).
These diagnostics do not change the production configuration or claim a fix.

An external synthetic launcher attempted to disable only the root JSC DFG tier.
It stalled before Visual at File operation in progress, never reaching its
environment-report/cycle gates. The result is inconclusive, not a successful JIT
workaround. Its cleanup raced process disappearance at /proc/PID/exe; the shared
observer now treats ENOENT/ESRCH at that lifecycle read as gone. All identity and
executable checks remain; it never signals a mismatched root.

Separate native MiniBrowser 2.52.6 sessions loaded the exact current browser
build through an owned loopback HTTP server, with the same 31,935-byte fixture.
The observer verifies absence of the Tauri bridge and checks literal paragraph
text on every Visual transition. Two retained complete sessions passed 20
Visual/Source cycles each. A third completed 7 cycles, then lost its connection
when the external driver/server reached their deliberate 300-second service
lifetimes. The journal confirms those timeouts; that incomplete case is not a
pass or an attributed renderer fault. No sandbox was disabled.

This does not identify Tauri as the cause or rule out JSC/heap/timing/emulation
issues. MiniBrowser lacks native IPC, uses a different document-load path and
changes heap/timing. Parser-only probes, MiniBrowser controls and the installed
application are deliberately separate evidence scopes. No engine option is
shipped. The current issue is native reliability, not an optional GPU enhancement.
No source/file/recovery authorization escape has been demonstrated by these tests.

## Reproduce the MiniBrowser control

In the disposable Ubuntu/WebKitGTK desktop described in Linux testing, build
with `npm run build`. Serve dist on 127.0.0.1:9556. Start a separate stock
`WebKitWebDriver --port=9555` in the authenticated graphical user session.
Copy raw/mini-observer.txt to a temporary .mjs file and execute it with Node 24
in that same session. It loads the production frontend, verifies no Tauri
bridge, inserts the synthetic source through the ordinary file-input event,
and checks 20 mode cycles. Its sole output document is a synthetic JSON report
at /tmp/pn-mini-browser-control.json. Keep a separate report per run.

Our helper services used RuntimeMaxSec=300 and both expired as intended. An
uninterrupted longer study needs a newly owned service lifespan selected before
testing, not a retrospectively relabeled incomplete result. The installed
production reproduction remains scripts/native-long-paragraph.mjs; MiniBrowser
is a diagnostic control, not native persistence/security acceptance.
