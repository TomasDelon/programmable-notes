# Mixed-case automatic recovery and explicit Save As

Base `3a8a036`; this changes only the external acceptance observer and tests,
not the application, package, snapshot schema, authority, JIT or resource policy.
The installed production ELF remains
`ff7d4babb1f63bf2973d1bc6f6ae18652164bace5c5d7ae440260b76be220fbf`,
Debian SHA256 `3c0b8347e5fbd558b925990fadfd0008993cf1c36c67fcae37681e073ba1afd2`.
The prior source-extension evidence records that exact binary's successful
ordinary uppercase, complete lowercase and independent IPC checks alongside two
failed fully primed uppercase renderer runs. None is relabelled here.

## Observer and regression checks

The observer now accepts at most one of `--new-notes` and `--extension-case`.
Typos, unknown/positional/duplicate arguments and their misleading combination
fail before prerequisites or fixture creation. Both modes cannot run together:
new untitled notes would not exercise an opened mixed-case filename.

The real subprocess guard test first failed with old exit2 instead of explicit
exit1, then all five diagnostic tests passed. Valid ordinary/new-notes/extension
modes retain the missing-prerequisite exit2 boundary. In the live Ubuntu desktop,
prerequisites were positively checked before deliberately passing both modes;
the inner command refused with exit1, no launcher PID and neither automatic
fixture. The outer verifier exited0 only after those refusal checks.

The mixed-case mode verifies original metadata names/baseline hashes, independent
histories and bounded retention, exact BOM/Unicode/CRLF content, restart discovery,
restoration as an unsaved buffer, actual Save As cancellation and acknowledged
saving to a mixed-case new filename. Original mode0640 and new-file mode0600 are
checked. Review caught that create mode obeys umask; an explicit chmod now
establishes the synthetic original permission fixture. No application permissions
were relaxed. Every earlier ordinary/new-note gate remains.

Each launched Root records PID, start tick, executable and observer hashes before
UI work. Intentional SIGKILL first verifies continuity. Ownership relies on the
trusted external launcher's PID file; this is not an independent hostile-process
attestation and retains the usual small check-to-signal race.

## Native execution

The actual command exited0 in the ordinary disposable Ubuntu24.04/WebKitGTK2.52.6
QEMU systemd desktop, with the shell umask0077 and the documented software-rendering
flags. Observer SHA256
`c4895d47eb862e35289bb35d8b55ec95b2c83a6224f21de11a9e32217da93267`
matches host, guest and both launch records. The production application is unchanged.

Two real picker-authorized buffers of `automatic-original.MdX` produced independent
snapshot identities. Metadata retained the mixed-case name and exact original
baseline SHA; each restored version matched its BOM/Unicode/CRLF source. Retention
kept five versions of the second history without deleting the first history.
Root43681 was identity-checked and intentionally SIGKILLed. New Root43817 discovered
the retained collection after a real process restart. Explicit restoration was
unsaved and unbound; Cancelled Save As wrote no original changes, then actual
Save As produced `automatic-restored.MdX` with acknowledged Saved status, exact
bytes and mode0600. The original remained exact with mode0640. Every owned version
was explicitly deleted and the second Root exited cleanly.

Final `npm run check` passed formatting/lint/strict types/fresh production build,
**96 unit tests and37 matching Chromium tests**. The review found no Critical or
Important issue. These observer changes do not require a new application build;
prior39 ordinary Rust document tests and7 policy tests retain their source/binary
scope, rather than being claimed as rerun in this milestone.

Use the ordinary disposable Ubuntu/WebKitGTK session in Linux testing, with a
fresh synthetic fixture and empty recovery collection:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 NATIVE_CRASH_RESTART=1 node scripts/native-auto-recovery.mjs --extension-case
```

Root is intentionally killed only after verified committed snapshots. Restart
restoration still requires the user's explicit choice; original files are never
automatically saved. Process-kill/restart is not storage power-loss proof.

## Remaining limits

The two earlier primed native renderer failures, older long-document SIGSEGV,
startup/blank behavior and the previous additional memory-page OOM gate remain
unresolved. No new complete hostile resource-matrix run or production security
readiness is implied. CI run44566378334 on base3a8a036 again refused both jobs
before runner steps for account billing/spending limits. Physical GPU/Wayland
compatibility is separate. PR#1 stays draft; no merge or public release.
