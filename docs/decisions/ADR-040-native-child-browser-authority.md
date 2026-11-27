# ADR-040: Native child browser authority before document publication

Status: implemented; native runtime validation pending.

## Context

SECURITY-01 requires document rendering to remain unprivileged. An opaque iframe
and denied Tauri IPC do not themselves decide native WebKit file chooser, browser
permission, print, fullscreen or script-dialog behavior. Review of WebKitGTK
APIs and upstream default handlers found these must be governed independently.
This review did not demonstrate arbitrary filesystem access or an actual exploit.

## Decision

Install child-native handlers on the exact trusted preview shell's Finished load
before publishing any authored srcdoc. File chooser requests are cancelled, every
permission subclass denied, print/fullscreen suppressed and dialogs synchronously
handled with negative confirmation and no retained borrowed object. WebKit closes
the unretained script dialog after signal dispatch; closing it inside its own
handler can invalidate WebKit's current-dialog state. Disable fullscreen in
settings and verify that setting. Install renderer termination handling once.

A native-owned one-shot admission is consumed even by failed installation.
Unrelated load events cannot consume it. Probe children without authored HTML
receive the same guards. No renderer message may authorize publication. Exact
trusted location and iframe sandbox are checked again during actual JavaScript
execution to reject a navigation race. Failure emits fixed categories and exits
the child; it never logs document contents or URLs.

No capabilities, IPC commands or author filesystem/network permissions are added.
This applies to the Tauri child path; the experimental inline Wry host remains a
separate path requiring its own validation. It does not activate native React in
the shared editor or permit a separate-window fallback to satisfy REACT-01.

## Verification and remaining gates

The combined check passed966 unit,143 tooling without skips,153 Chromium,9 Pages
and4 disposable local cloud cases. Three tooling cases execute the fixed script
template with hostile content, changed location and missing/changed sandbox. Six
direct Rust activation cases passed, and Rust formatting passed. The same six
Rust cases are part of normal hosted production-profile Tauri tests.

Hosted CI run46016023081 on41091f3 passed both required jobs, including actual
GTK compilation, production package inspection and production-profile headless
Tauri tests. These remain logic/template/compilation tests; real
chooser/permission/dialog signals, dialog continuation, repeated React input,
Stop, expiry and child cleanup require disposable Linux runtime validation. No
production security readiness or fixed installed application is claimed.
