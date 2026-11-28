# Explicit inline runtime boundary

Requirements: PRODUCT-01, REACT-01, SECURITY-01. This is an incremental
architecture correction, not activation of the shared native application.

- **Outcome:** the existing inline editor receives its execution renderer from
  its trusted platform bootstrap instead of importing browser execution itself.
- **Invariants:** preserve web React interaction, opaque JSX, source/history,
  runtime lifecycle and sandbox policy. Missing native runtime support must not
  silently instantiate a browser iframe or the rejected native shell.
- **Witness:** without an adapter the shared runtime creates no iframe; an
  explicit web adapter preserves existing island lifecycle and browser tests.
- **Done:** targeted boundary/lifecycle tests, independent review, full required
  checks and updated architecture/status. No native runtime acceptance claim.

Move the existing web island implementation without redesign into a web-owned
component. Keep shared context/types and an explicit optional trusted component
in the shared editor. The web bootstrap supplies that component; absence is
fail-closed and visibly unavailable. Test the default, explicit adapter, source
inputs, pause and error cleanup. Keep whole-document WebApp execution unchanged
in this slice; its extraction remains a separate shared-workspace prerequisite.

This seam supplies rendering only. It grants no document mutation, filesystem,
IPC or shell capability and is never chosen by untrusted document messages.
