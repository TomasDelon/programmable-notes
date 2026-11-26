# Native vault adapter evidence — 26 November 2026

Scope: editor-only service foundation, not installed application acceptance.
See [ADR030](../../decisions/ADR-030-editor-vault-service.md) and
[packet plan](../../plans/native-vault-adapter.md).

Executed observations:

- Tests-first missing frontend methods failed before implementation.
- **25 targeted TypeScript tests passed**, including adapter transport and exact
  capability policy checks. Transport is mocked; no native permission proof.
- **8 application Rust tests passed**, with the custom-protocol app compiled in
  the approved clean Ubuntu image and a separate target. Two new cases verify
  cancellation/replacement/captured scope/grant preservation and reservation
  lifetime/close/update refusal. Eight existing vendored-Wry warnings remain.
- **79 native document tests passed, 7 existing ignored slots**. Existing
  contention helper and dedicated ptrace/ENOSPC cases retain their prior scope.
- Actual Store/autosave harness passed; accepted source was observed on disk in
  12 ms in this backend run, not GUI latency or a timing guarantee.
- Independent structural security review found no concrete code blocker and ran
  5 targeted tests. It identified missing command-specific editor controls.
- The corrected WebDriver editor phase requires the exact forged-token domain
  error for inventory/open/create before the explicit fixture start/preview-denial phase. **4 tooling tests
  failed before those controls and passed after**, exercising the actual probe
  with a mocked transport, including injected unknown-command and ACL failures.
- Rust formatting, targeted lint/types/format and whitespace checks passed.

Actual OS picker cancellation/replacement, registered Tauri ACL denial and native
GUI use were **not executed for this change**. The outer environment lacks
`tauri-driver`, DISPLAY, a user bus and `/dev/kvm`; WebKitGTK headers are supplied
only in the clean build image. Running the native probe locally exited **2,
NOT RUN**, at its first prerequisite: the default debug executable is absent
(the compiled test target lives in private build scratch). Independent probes
also confirmed the missing driver/display/user bus/KVM/development package.
A Docker compilation environment is not the
required systemd/cgroup Linux desktop. Separate native embedding fixtures do not
exercise these commands. No application autosave or shared product acceptance is
claimed. The final whole-project check exited 0: **676 unit, 96 tooling/zero skips,
150 Chromium, 9 Pages and 4 inactive-cloud tests passed**, plus format/lint/types/
build. It covers the captured adapter commit inputs, before subsequent optional
editor-witness changes. Hosted results are recorded separately in the draft PR.

Reproduce backend checks from a clean supported Linux development environment:

```sh
npm ci
npm run build
npm test -- tests/unit/native-vault-adapter.test.ts tests/unit/native-policy.test.ts tests/unit/native-documents.test.ts tests/unit/native-notes-folder.test.ts
node --test tests/tooling/native-vault-registration.test.mjs
cargo test --manifest-path native-documents/Cargo.toml --locked
cargo test --manifest-path src-tauri/Cargo.toml --locked --features custom-protocol
npm run native:autosave:test
npm run check
```

For actual registered-command validation, prepare the disposable systemd/X11/
WebKitGTK environment and security-test build exactly as described in
[NATIVE_SECURITY](../../NATIVE_SECURITY.md), then run `npm run native:test`.
The editor registration controls must pass before preview denial. Separately
exercise the real chooser: cancel preserves the active session, selecting a
second vault denies the old token for new requests, and already opened documents
remain readable/saveable under their existing grants. Use synthetic owned files;
do not treat this unexecuted procedure as evidence. Production namespace/seccomp
validation remains separate from WebDriver automation, as documented there.
