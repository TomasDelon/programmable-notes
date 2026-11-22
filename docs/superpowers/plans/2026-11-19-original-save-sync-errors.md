# Next P0 gate: original Save sync-error reporting

After committing the four-stage process-crash gate, inspect production
AuthorizedFile.write/Store.save and existing recovery-sync injection tests.
Add the smallest own-child external syscall-error test for original Save.
Do not add production failpoints or touch personal files.

First write a failing test. Extend the restricted validation writer only with a
test-result reporting mode: serialize the actual public Store Save result and
exit. The tracer injects EIO on the selected successful fsync exit, once. This is
explicit external error injection, not a real physical storage error. File-fsync
failure must return an error and preserve exact original bytes/metadata. Parent
-directory fsync failure after actual publication must report a new saved revision
with durable=false and the exact complete new file, never pretend nothing wrote.
In both cases the sibling remains unchanged and fresh Store recovery/saving works.

Keep writer PID/start/executable identity and exact file/dir descriptor matching,
absolute observation deadlines, owned-child cleanup and mandatory outer timeout.
Require matched publication before directory sync. Do not accept an unrelated
fsync or unexecuted injection. Keep all failed controls and distinguish this from
power-loss, ENOSPC, and packaged UI tests. Add a bounded reproducible CI gate,
ordinary Rust and full Node checks, review/docs/evidence, commit/push/update draftPR.

Only implement a product correction if the actual new regression exposes one.
Inspect existing real-ENOSPC coverage afterward before choosing another P0 gate.
No merge, public release, readiness promotion, policy or permission changes.
