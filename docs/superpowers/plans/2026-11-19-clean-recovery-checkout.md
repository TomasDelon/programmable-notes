# Clean committed checkout verification

Verify pushed a40ea74 from a new local clone, not a worktree or the active feature
checkout. Establish exact commit, tool versions, clean tracked state and absence
of node_modules, dist and .cache/runtime.js. Install exact locked dependencies with
npm ci using the existing package cache (no copied dependencies/generated output).
If offline cache is incomplete, retain that infrastructure failure and use the
normal authorized registry install. Confirm no runtime exists after install.
Run npm run check directly from that state: its ordinary npm test/pretest hooks
must create the runtime before importing compiler-deadline tests. Retain the
actual ordered command output, without manually preparing generated files.
Run full formatting/lint/types/unit/fresh build/Chromium suite with the matching
installed browser. Confirm post-check generated runtime and clean tracked state.

Do not change source/test commands to bypass failures. Record exact revision,
command outputs, lockfile/runtime hashes and limitations. Hosted billing refusal
remains separate. No new native runtime/package claim: the app source is unchanged
from the preceding production ELF. Update progress/status/evidence, commit/push
verification docs and keep PR draft. Then choose the next bounded native renderer
investigation or core reliability task supported by actual evidence.
