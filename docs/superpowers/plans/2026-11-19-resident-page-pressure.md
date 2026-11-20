# Additional resident-page memory containment workload

Base368dd95; optimized installed6878294f…/ELF6e301bce… passed full current editor/
recovery/IPC. Earlier full stress matrix's original16MiB-full-fill memory case
expired before its requiredOOMcause. Do not replace, relabel or remove that case.

Add distinct memory-pages acceptance to the real native stress runner: retain
128MiB Uint8Array blocks and dirty one byte per4096-byte page, recording the exact
fixture identity separately. This demands actual resident pages while avoiding a
full write of each byte under25%CPU/TCG startup cost. Keep512MiB/0swap/25%CPU/128tasks/
60s, mandatorysandbox/network restrictions and requiredOOMjournal cause, complete
cleanup, editor responsiveness and actualCounter recovery. No fake native APIs,
additional app privilege, deadline extension or test-feature binary.

TDD: existing runner rejects new case before launch; add real integration case
alongside all five existing cases. Run only new selectedcase initially in the
owned disposable VM, retain exactbinary/fixture/observer/resource/journal results
and all failures. Full ordinaryrepositorycheck for testscript changes, read-only
review, docs/evidence/commit/push/draftPR. A new success is not a full matrix pass;
originalmemoryexpiry/rendererSIGSEGV/blank/startup gates remain distinct.

Review found the prior broad OOM text predicate could confuse engine diagnostics
with kernel enforcement. Strengthen both memory cases to trusted structured
journald sender metadata + systemd unit-failure MESSAGE_ID, matching USER_UNIT,
_UID and UNIT_RESULT=oom-kill. Retain JSON even on missing-cause failure. Unit
negatives reject authored OOM/RangeError, wrong sender/unit/UID/result/transport.
The preceding broad predicate adapter fails these tests; the strict helper passes.
Then run the complete6case matrix against unchanged installed production binary;
keep failed cases and do not infer a full pass from the earlier selected workload.
