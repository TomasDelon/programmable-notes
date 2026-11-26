# Next milestone: direct hosted Linux acceptance

Status: infrastructure preflight implemented; actual installed-application validation remains open. Hosted run receipts are maintained in draft PR #9.

The current QEMU TCG guest can run the installed application, but startup jitter
can exhaust the fixed resource-test window. On the same installed ELF, the CPU
fixture was armed at 43.90s in a passing Stop case and at 52.51s in a later failing
attribution case. Keep the latter failure: sampling plus Stop then overlaps the
60s service lifetime. Physical GPU testing is a separate compatibility task.

Investigate a manually dispatched native-runtime job on a standard public-repo
Ubuntu GitHub-hosted VM, without nested QEMU. The manual infrastructure probe
now targets standard x64 Ubuntu 26.04; mandatory package CI remains on Ubuntu 24.04. Do not assume it supports the
required backend until its real preflight and application assertions pass.
No larger runner, paid service, token-scope change or billing change is needed.

1. Verify PID1/systemd, cgroupv2, cpu/memory/pids delegation, namespace support and
   an ordinary dedicated validation user. Fail closed if infrastructure cannot
   supply these. Do not change global namespace restrictions to zero.
2. Build/install the optimized package without `security-test`, inspect it and
   bind installed/running executable hashes. Preserve Wry verification and all
   existing mandatory compilation/backend checks.
3. Use a fresh dedicated XDG profile, authenticated Xvfb, Openbox, user DBus and
   accessibility. Keep external editor automation distinct from supervised child
   automation=false. Pass only the required graphical environment; never dump
   the runner environment or authentication data into artifacts.
4. Test the distribution namespace negative control before any optional
   administrator executor opt-in. The package must refuse before author payload
   when actual PrivateNetwork is absent. An executor AppArmor exception affects
   other systemd-service descendants; record its exact scope and use it only on
   this disposable runner. Never add it to the distributed package or describe
   its unconfined profile as a filesystem sandbox.
5. Run current source-whitespace, full fidelity, versioned recovery, persistence,
   IPC and six-case stress probes. Preserve per-case resource/cleanup/expiry/OOM
   assertions unchanged. A connected handle is not proof of rendered content;
   require real counter interactions, exact disk bytes and actual restart.
6. Retain atomic per-case checkpoints, final marker, controller exit status,
   package/observer/helper identities and sanitized test evidence. A partial
   report or five passing cases must not be presented as complete acceptance.
   Keep installers private until the native redistribution inventory and owner
   licensing decisions are settled.
7. Keep this an opt-in manual job initially; no duplicate native GUI build on
   ordinary PRs. Contents-read permission and pinned workflow actions suffice.
   Execute the actual hosted job and fix ordinary setup problems; if it cannot
   run safely, preserve the exact blocker and the already working disposable-VM
   procedure rather than weakening isolation.

Current evidence and interrupted/failed attempts are retained in
[24 November package validation](../security-evidence/2026-11-24-current-package/README.md).
A future successful hosted run would narrow the infrastructure uncertainty; it
would not explain historical JSC crashes, grant publication rights or establish
arbitrary native-compromise resistance. No permanent tabs, UI redesign or new
editing grammar is part of this milestone.

## Run the stock-runner infrastructure preflight

The existing registered CI workflow now has a separate manual mode; no main-branch
merge or new paid runner is needed to test the development branch:

```sh
gh workflow run ci.yml --repo TomasDelon/programmable-notes \
  --ref fix/preview-markdown-input -f native_preflight=true
```

Leave every other dispatch input at its default. Mixed requests fail before
checkout and use an isolated concurrency group, so they cannot cancel a valid
preflight. Ordinary PR checks, package inspection, fault injection and browser
gates remain required and retain their existing routes. This manual mode runs
only the standard `ubuntu-26.04` infrastructure probe; it does not build or certify
the application package.

The probe requires stock restricted Ubuntu AppArmor, creates one disposable
ordinary validation user and checks actual cgroup values, NoNewPrivileges, trusted
user-journal access and network namespace identity. Missing isolation must remain a
nonzero blocked result. If systemd silently skips PrivateNetwork, the existing Rust
supervisor must refuse before payload delivery; the probe records its cause and
checks cleanup. It never disables a namespace restriction or grants document code
filesystem/IPC authority. A supported namespace proceeds to authenticated Xvfb,
window-manager, accessibility and WebKit-driver prerequisites. These observations
are preparation for the full package matrix above, not that matrix's substitute.

Fixed reason codes distinguish limit, startup and observer failures. An EXIT trap
stops and verifies the dedicated user's owned probe units after unexpected helper
exit or timeout, preserving the primary failure and separately flagging cleanup
failure. Public output contains fixed diagnostics, not raw environments, journal
records or credentials. No installer or evidence artifact is uploaded by this
preflight. The cloud shell refuses this runner-only command before privileged
operations; local mocked routing/cleanup tests are separate from hosted execution.

The [26 November hosted record](../security-evidence/2026-11-26-hosted-preflight/README.md)
retains both the invalid cross-UID socket observation and the corrected stock
Ubuntu 24 supervisor refusal. The Ubuntu 26 probe preserves every isolation check
and does not load an unconfined executor profile. A supported image label or
successful package build cannot satisfy installed-runtime acceptance.
