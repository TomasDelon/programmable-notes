# Next P0 validation: original-document Save interruption

Do not start product changes while the preview lifecycle/resource diagnostic is
pending. Inspect existing Store/AuthorizedFile and recovery crash tests first.
Recovery publication has actual process-kill coverage; ordinary document Save
currently lacks equivalent syscall-boundary crash evidence.

Add the smallest external validation writer using public Store APIs and a fresh
synthetic directory, never an application failpoint or native permission. An
own-child Linux x86_64 ptrace observer should SIGKILL that writer after actual
successful temporary write, temporary fsync, rename and parent-directory fsync.
Use exact BOM/Unicode/mixed LF+CRLF MDX with opaque JSX, original mode0640 and an
untouched sibling. Before publication the target must equal the complete old
source; after publication it must equal the complete new source, never partial.
Reopen through a new Store and explicitly save again to verify usable recovery.
Record process identities, observed syscall/stage, exact bytes/modes and exit.

Use owned child guards and an outer timeout. A prerequisite denial is NOT RUN,
not a pass. Any orphan temporary remains an explicitly documented limitation;
never delete unknown user-directory files or silently promote a temporary.
This is process-interruption evidence, not power-loss proof. Start with existing
Save only; absent-destination Save As and injected sync errors can follow when
the preceding gates pass. Keep separate from recovery snapshot publication.

First write the failing regression, then the external writer. Run meaningful
ordinary Rust tests, the explicit ignored disposable ptrace gate and formatting;
add a reproducible bounded CI command without claiming hosted execution while
billing is blocked. Preserve current shipping source, native grants, filesystem
checks and security policy. Update status/evidence/progress, review, full check,
commit/push and keep PR1 draft. No rewrite/worktree/public release.
