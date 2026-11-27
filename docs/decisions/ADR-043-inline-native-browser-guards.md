# ADR-043: Native browser guards before experimental inline publication

Status: development candidate; GTK compilation and runtime denial evidence pending.

## Context

SECURITY-01 requires unprivileged same-window React. ADR040's native browser
authority handlers protected the Tauri preview path, but the experimental inline
Wry host loaded its authored fixture during construction before those handlers
existed. One successful fixed v1 input/Stop/expiry run cannot cover that gap.

## Decision

One canonical GTK module supplies the existing file chooser cancellation,
catch-all permission denial, print/fullscreen suppression and synchronous negative
script-dialog handling. Tauri imports that same source without moving its exact
trusted-shell eligibility, native activation or final assignment checks. Borrowed
dialogs remain unretained and are not explicitly closed during signal dispatch.

The experimental host constructs Wry with neither URL nor HTML. The inspected
pinned GTK constructor performs no authored load in that case. Existing APIs then
provide the native WebView, install the canonical guards and load the fixed HTML;
no Wry fork or new generic execution interface is necessary. Shared native-owned
Activation consumes its admission before guard installation and publication, even
when either fails. Author readiness/title messages cannot permit publication.
Failure and renderer-termination hooks now exist before authored code loads.

The host additionally denies popups and cancels downloads immediately through its
own incognito context. This context hook must not affect the trusted editor's
context or authorized exports. Supervisor, resource limits, GtkSocket/Plug,
normal input, clocks, transport keys and share-free provisioning stay unchanged.

## Profile and evidence identity

The execution profile is now strictly inline-react-guarded-v2. Compiler framing,
embedded build evidence, fixed driver/session/observer validation and title
receipts bind that exact profile and hashes of both canonical guard and Activation
sources. Historical directory/binary names remain to avoid unrelated path churn;
JSON structural version1 is not the execution profile. Current validators reject
legacy v1 proof rather than relabelling or accepting it as v2 evidence.

Historical v1 observations remain retained at their source commits. This security
publication-order change is not a demonstrated causal startup fix. General native
React stays disabled; the helper remains fixed-diagnostic-only, not application
acceptance.

## Validation and unresolved gates

Targeted tooling controls and six production Activation state tests passed.
Independent source review found no blocker for this limited foundation. Source
order, mocked protocols and passive native snapshots do not prove GTK handler
execution. Actual GTK compilation, dialog continuation/denial, permission, print,
fullscreen, download and navigation witnesses remain required. Authored receipts
cannot satisfy native-handler or privileged-operation denial oracles.

The existing exact about:blank allowlist remains: it does not deny author-initiated
navigation to the same URL. Tightening it needs actual load_html policy-event
observations; silently guessing that sequence risks blocking the initial document.
Do not describe navigation as fully denied or activate arbitrary source on this
basis. Integrated editor/preview IPC, geometry/lifecycle, hostile CPU and both
memory workloads, Stop/expiry/recovery and packaged acceptance remain separate
gates. Physical GPU/Wayland compatibility cannot substitute for any of them.
