# Captured-vault directory operation

This is backend filesystem evidence for DATA-02, not an installed editor or
new preview capability. No IPC command, Store grant, inventory schema or UI was
activated. Source path validation retains its existing behavior.

`Vault::create_directory` validates relative components and existing real
parents, then calls descriptor-relative mkdirat with private mode requested. It
never overwrites an entry or opens the destination to manufacture a capability.
The retained descriptor protects against symlink/display-path redirection; it
is not a transactional live ancestry guarantee against external directory moves.

Eight new real-file tests passed under UID1000, including exact names/mode,
nested creation, collisions, competing creators, payload no-open observation,
invalid/missing/symlink/special parents and captured-root rename behavior. A
separate reviewer repeated all eight successfully using the existing Rust1.100
toolchain. The full crate command passed91 tests, failed0 and left7 pre-existing
ignores; the targeted affected regression command passed70 without ignores.

Two private cfg(test) adapters substitute error replies after actual mkdir or
sync calls. They verify uncertainty/no rollback and acknowledged creation with a
durability warning. They do not demonstrate physical EIO or power-loss behavior.
No test control is present in normal packaging or exposed as IPC.

Reproduce on Linux with the repository toolchain:

```sh
cargo test --manifest-path native-documents/Cargo.toml --locked --test vault_directory
cargo test --manifest-path native-documents/Cargo.toml --locked
```

The current inventory lists source files, so empty-folder discovery is still
unimplemented. A lost response/crash may leave a directory without a receipt;
callers must reconcile rather than retry automatically. Relocation, Trash,
references and actual native editor interaction remain separate gates.
