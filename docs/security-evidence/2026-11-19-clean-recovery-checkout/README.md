# Fresh committed checkout verification

Verified source `a40ea74cdaa2fe97c889b552e188062402b8b75c` in a new local Git
clone, separate from the development checkout. This was a clone, not a worktree.
No `node_modules`, `dist` or `.cache/runtime.js` existed initially. Node24.22.1,
npm11.9.0 and Rust/Cargo1.100.0 versions are retained in the receipt.

## Actual commands and results

`npm ci --offline --cache /workspace/programmable-notes/.cache/npm --no-audit --no-fund`
installed all372 locked packages without copying dependencies or generated output.
The runtime was still absent after installation. The first ordinary
`npm run check` then passed formatting, lint, strict types, **96 unit tests**, a
fresh production build and **37 matching Chromium tests**. Its recorded sequence
shows the ordinary pretest runtime prerequisite before Vitest; no manual runtime
preparation or skipped compiler-deadline test was needed.

Both standalone Rust crates built new local target directories from the clean
clone with `--locked`: **39 ordinary native document tests and7 policy tests
passed**. Four infrastructure-only document cases remain ignored by that command;
no new ENOSPC/power-loss/process-kill result is inferred from their compilation.
The previous actual installed-app SIGKILL/recovery evidence retains its own scope.

Generated runtime SHA256:
`1ac6b2ea8eb455e25f5f03116a2bc7c6403a834eafb4c9b5593cc73dbf40f300`.
The fresh frontend bundle SHA256
`c41526e55f1a476fde3b66ee32c1e8b1ab94b757176c107073bc66e9cf8965e9`
matches the preceding production builder exactly. This is a specific Linux/tool
comparison, not a hermetic or cross-platform reproducibility claim. Tracked Git
status remained clean after checks and after fork verification.

The default Wry verification attempt failed DNS resolution for `static.crates.io`.
An elevated retry was requested, but no execution receipt or output file was
available after the tool runtime reset; it is not reported as executed or passed.
The verifier's existing `WRY_UPSTREAM_ARCHIVE` input then passed against the
preexisting local Cargo archive, whose required SHA256 is
`a490119196d02a51d0871df7b9119a1f3e46d75b7e90053a801454d5c6b3491c`.
Every compared upstream file matched except the two explicitly declared WebKit
sandbox patches; omitted Cargo.lock is the verifier's existing declared policy.
No checksum, file comparison or network restriction was bypassed. This offline
pass does not establish that a new upstream download currently works.

## Reproduction

Clone the exact source into an empty directory. Use the pinned Node/npm versions
and matching Playwright browser from the normal onboarding/CI procedure:

```sh
npm ci
# Confirm .cache/runtime.js is still absent before this first check.
npm run check
cargo test --manifest-path native-documents/Cargo.toml --locked
cargo test --manifest-path native-policy/Cargo.toml --locked
npm run native:wry:verify
```

When the registry endpoint is unavailable and an archive is already present,
`WRY_UPSTREAM_ARCHIVE=/path/to/wry-0.57.2.crate npm run native:wry:verify` keeps the
same mandatory pinned hash and file comparisons. It is an explicit offline input.

## Scope and remaining blockers

This does not repeat a clean Tauri package build or native GUI/security matrix.
Those prior exact-binary results are in the source-extension and uppercase
recovery evidence. Two fully primed native renderer crashes, older SIGSEGV,
startup/blank behavior and the additional resident-page OOM gate remain unresolved.
Physical GPU/Wayland testing is separate. No production security readiness claim.

GitHub run44568476206 for this exact source refused both jobs before any steps
for account billing/spending limits. Those real annotations are retained. Local
success is not hosted CI success. PR#1 remains draft; no merge or public release.
