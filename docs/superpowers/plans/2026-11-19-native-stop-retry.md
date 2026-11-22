Next bounded reliability milestone: explicit native Stop retry.

Observed on actual d74850a5…: injected systemctl spawn EIO leaves backend unit
identity/live connection intact, while App clears html and labels Preview stopped.
Pressing Stop again with empty html does not remount/unmount NativePreview and
therefore sends no new Stop. Existing sixty-second systemd expiry remains intact;
manual Rebuild still stops before starting. This is misleading recovery UX, not
new execution authority or a demonstrated sandbox escape.

Smallest change: extract existing serialized queue to a small native-only
operation helper shared by NativePreview and the trusted toolbar. First Stop with
an artifact continues using component cleanup (exactly one operation). Empty-
artifact Stop explicitly enqueues a retry. Report Stopping preview until cleanup
confirms; expose failure and keep retry available. Guard confirmations by latest
stop intent so old results cannot relabel a rebuilt session. No automatic retries,
new IPC command, arbitrary arguments, preview permission or resource changes.

Rejected: call direct native Stop on every click plus existing cleanup, because a
second automatic call could hide failure; disabling Stop on error, because that
removes recovery; redesigning preview process ownership, unnecessary scope.

Tests: actual toolbar click with deferred transport does not claim stopped; failed
first Stop surfaces, second click causes a fresh serialized request; delayed old
result cannot overwrite Rebuild/compiling status; repeated pending clicks ordered,
source/filesystem untouched; existing NativePreview lifecycle tests still pass.
Actual packaged externally injected EIO must show failure then user-clicked retry,
live connection before retry, group gone within three seconds before expiry.

Implementation plan (existing checkout, user's autonomous approval opt-out):

1. Add actual App transport tests in tests/unit/native-stop.test.tsx. Expect RED
   for immediate false stopped label and missing retry after artifact removal.
2. Extract existing queue unchanged into src/preview/native-operations.ts. Use it
   from NativePreview cleanup/start and empty-artifact trusted Stop retry.
3. Add optional cleanup-result callback; stable App callback reports only current
   Stop intent. Rebuild invalidates that intent before starting compilation.
   Preserve existing component ordering/status/security tests.
4. Run focused/full local checks, build/inspect/install optimized package, run
   real injected Stop failure then actual trusted retry before fixed expiry.
   Preserve exact binary/source/observer identities and all failures. Run ordinary
   session/IPC/fidelity regression as relevant to the changed native toolbar.
5. Obtain read-only review, fix important findings, commit/push/update draft PR.
   Update implementation status, ADR009 and AGENT_PROGRESS; continue roadmap.

The first Stop with a mounted artifact continues using existing cleanup exactly
once. When no artifact is mounted, a user click enqueues an explicit Stop. It must
not be merged with a hidden automatic retry. Native supervisor policy/capabilities
and document source/save/recovery behavior are unchanged.

Verification checkpoint: implementation, TDD/fresh-review fix pass, 74-unit/
30-browser system and pinned-browser checks, actual injected fault/UI retry,
ordinary installed session/IPC and repeated complete fidelity checks are done.
First fidelity startup failure and ineffective monitor remain preserved. Commit,
push and draft-PR update follow; no pressure/hardware readiness claim.
