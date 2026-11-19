# ADR-011: Native editor renderer termination

Status: implemented and validated on the recorded optimized Linux package; underlying JSC failures
remain unresolved. This is recovery feedback, not a crash fix or security-readiness claim.

Real installed WebKit renderer deaths left the Rust editor process alive with a
blank view. A stale frontend busy hint could then block normal closing even after
all native work finished. Automatic reload would discard document buffers and
leave frontend/native grants inconsistent, so it is not part of this change.

Connect the native WebKitGTK process-termination signal only on the trusted editor
window. Ignore deliberate API termination. Warn that recent unsaved changes may
be unavailable, and offer Quit editor / Keep window open. Quit is an explicit
force-quit after that warning; completed snapshot restoration remains a separate
user choice after reopening. Previously authorized native writes may complete
before exit, or be interrupted under the existing atomic-write/recovery rules.
The notice itself performs no document operation or authorization.

Native termination invalidates frontend busy hints, including late queued hints.
Actual Rust operation counts still block ordinary closing, and dirty confirmation
remains. Keeping the failed window open therefore does not trap the user behind
an impossible frontend busy state. Only the native signal sets this private flag;
there is no new IPC, capability or document-controlled event path.

The notice must participate in the existing Documents dialog guard. If a native
picker/confirmation is open, one background task per failed window waits200ms
between attempts, without cancelling that dialog. After the guard is available,
show the notice on the main thread and hold the guard until its callback returns.
Check window existence before acquiring and again before display; drop the guard
if the window has already gone. Existing native commands complete without needing
the dead renderer to consume their responses. The task can wait while the user
keeps a dialog open; its count/memory are bounded per failed window.

This explicitly serializes modal behavior rather than relying on a backend queue.
The initial unguarded implementation produced both picker and failure dialogs
in a real crash-during-picker test; that failed intermediate package is evidence,
not a delivered release. A per-window notification guard prevents duplicate
termination notices. The already-pinned Linux GTK dependency becomes an ordinary
target dependency; preview mode never installs this callback or gains a dialog
plugin. Browser/native preview lifecycle and resource policy remain unchanged.

This does not detect a live but hung renderer, automatically recover workspace
module graphs, prove power-loss durability or resolve engine/GPU issues. Other
native platforms retain their existing behavior until separately implemented and
tested. Native test results and package hashes belong in dated evidence.
