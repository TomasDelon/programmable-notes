# Bounded native long-document transition diagnostic

Base705caee. The actual packaged source navigation/recovery/IPC suite passed.
Long-document Visual SIGSEGV remains a genuine unresolved native blocker.

Extend the existing installed-app observer, not application/security behavior:

1. Add a failing guard test: invalid/unknown cycle arguments are refused before
   driver access or synthetic fixture/evidence creation.
2. Optional --visual-cycles integer1..20; default1 retains normal acceptance.
   Record requested/completed cycles and each current phase before native actions,
   so renderer/driver failure retains the last verified transition. No retry of a
   failed transition, no JIT/environment/policy/timeout change, no success after
   missing renderer observation. Keep exact disk/history/reopen/shutdown gates.
3. Run invalid controls and full repository checks. Execute a bounded normal-
   environment actual packaged cycle run, keep failures/report/native kernel
   observations, and distinguish successful later runs from a crash fix.
4. Read-only review, document exact package/observer identity and results,
   commit/push/update draftPR; continue the highest-value independently testable task.
