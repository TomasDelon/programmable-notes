# Fail closed on unknown native fidelity options

Base77dedad. App/source selection is verified and pushed; production ELF4c0ab980
unchanged. The acceptance runner currently ignores unknown options, so a typo can
silently skip a requested optional gate. Fix only external test CLI handling.

TDD: invalid flags and multiline-without-quotes must fail before preflight or
fixture creation; recognized full flag set must reach prerequisite checking.
Centralize the six allowed flags, preserve their behavior/dependency. Run unit
negative/positive controls and a live native-prerequisite negative showing no
launcher PID/fixture writes. Full repository checks and read-only review; retain
prior native core execution scope instead of relabelling a CLI-only negative as
another complete acceptance pass. Commit/push/docs/draftPR, continue core work.
