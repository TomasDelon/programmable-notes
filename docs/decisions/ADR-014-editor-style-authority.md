# ADR 014: Authorize editor styles with the host's existing CSP nonce

Status: implemented; browser regression passed. Packaged native revalidation is
recorded separately in the dated security evidence.

## Problem

The packaged Tauri editor saved a physical trailing ASCII space as NBSP during
the exact same-name document acceptance test. Both the keyboard event and
`beforeinput.data` contained ASCII space. Runtime inspection showed CodeMirror's
computed whitespace was `normal`: its dynamically injected stylesheet had no
nonce and was blocked, while the inline boot stylesheet had an authorized nonce.

Tauri's nonce authorizes its inline stylesheet. Once a nonce appears in a style
policy, browsers ignore `unsafe-inline`. A successful application launch and
interactive counter therefore did not establish that source editing was correct.

## Decision

Supply the existing trusted host style's `.nonce` through the supported
`EditorView.cspNonce` facet when constructing SourceEditor. Read from the editor's
owner document, using the nonce property rather than its hidden attribute value.
If no nonce exists, retain CodeMirror's normal empty-nonce behavior.

Keep CSP directives, preview restrictions, native permissions and resource limits
unchanged. Do not normalize NBSP or rewrite source to compensate for a display /
input-layer defect. Explicit NBSP, BOM, CRLF, unrelated bytes, revisions and
history remain authoritative source data.

This supplies style authority only to trusted CodeMirror CSS in its own document.
It introduces no preview message, source-writing or filesystem authorization.
User JSX/React remains opaque in the host and executes in its existing isolated
runtime. The trusted boot style must remain an authorized nonce-bearing element;
a mismatched nonce fails closed rather than relaxing the policy.

## Verification

The actual installed Linux failure and event/style probes are retained. A browser
test reproduces the nonce policy and fails before correction because whitespace
is collapsing. It then verifies preformatted editor whitespace, continued denial
of a style without a nonce, exact typed ASCII space beside explicit NBSP, BOM and
CRLF, undo/redo, export and reopen. Native package acceptance must be rerun on the
corrected executable before claiming a native fidelity pass.
