# Authorized vault directory creation

Status: bounded backend packet; no native command or UI activation.

**Outcome:** DATA-02 gains a real, collision-safe directory operation within an already authorized captured Vault.

**Invariants:** no overwrite, symlink following, recursive parent creation, document grant/revision changes, rollback, automatic retry or display-path authority. Existing source-path behavior stays unchanged.

**Witness:** actual Linux temporary files/directories, no-open payload controls, root-rename and competing-target cases. A metadata-only folder must fail the witness.

**Done:** independently reviewed Rust code and real-file tests, existing native-document regressions and root checks. Empty-folder discovery and installed UI acceptance remain separate.

## Interface and implementation boundary

Add `Vault::create_directory(&self, relative: &str) -> Result<CreatedDirectory, Error>` and export `CreatedDirectory { logical_path: String, durability_warning: bool }`. No Store state, new grant, dependency or generic filesystem interface is needed.

Own `native-documents/src/vault.rs`, the narrow public export/error documentation in `lib.rs`, and `native-documents/tests/vault_directory.rs`. Reuse the retained root descriptor and existing secure parent walker. Factor only common relative-component validation; retain source-extension checks for existing source operations.

Directory paths have at most16 components and4096 UTF-8 bytes. Reject absolute paths, empty/dot/dot-dot components, NUL, backslash and the existing reserved exact directory names. Do not require a source extension. Parents must already be real directories; do not create them implicitly. Preserve the existing ownership/read-only policy and do not rely on privileged test execution bypassing it.

Prepare names and receipt allocations before `mkdirat(parent_fd, leaf, 0700)`. Existing entries of any kind are conflicts; never open them or call existence success. Other failed publication attempts conservatively return existing `PublicationUncertain`. Successful creation plus failed parent sync returns the acknowledged relative path with a durability warning. Never delete the directory to hide a sync error. No post-create pathname open or invented child identity/capability.

Requested private mode remains subject to process umask and filesystem inheritance; do not change global umask or chmod a possibly replaced pathname. Retained parents are captured capabilities, not a live transactional ancestry guarantee.

## TDD and review sequence

- [x] Add failing real-file tests for successful simple/nested creation, exact name/private permissions, collisions including broken symlinks, concurrent creators and existing payloads never opened.
- [x] Cover invalid names/depth/byte limits, reserved names, missing/symlink/FIFO parents, read-only policy and unchanged source-extension validation. Root rename/replaced display spelling must not redirect writes.
- [x] Implement the minimal descriptor-relative operation; test uncertainty and post-publication sync failure through private compile-time test adapters, never production flags/IPC switches. Distinguish injection from actual filesystem success.
- [ ] Run Rust formatting and affected native-document tests with the existing pinned toolchain; independent review then root final checks/scans/commit/push.

Existing inventory reports source files, so this method does not make empty folders appear in a tree. Do not silently widen its protocol in this packet. A crash or lost reply may leave a created directory without an acknowledgement; future callers must inspect/reconcile rather than automatically retry. Relocation, Trash, references and mutation of unrelated notes are outside scope.
