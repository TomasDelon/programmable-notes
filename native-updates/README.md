# Native Linux update transport

This crate provides bounded fixed-origin HTTPS downloads, version-bound Minisign
verification, opaque one-use grants and a GUI-only PackageKit 1 transaction.
The Tauri adapter in `src-tauri/src/updates.rs` additionally uses the official
`tauri-plugin-updater` 2.14.1 verifier with mandatory signed-version restoration.
It never invokes that plugin's password/terminal-fallback installer.

The channel is disabled unless a future owner-authorized build supplies
`PN_UPDATE_PUBLIC_KEY`. No production signing key or public feed is configured.
Tests contain public keys/signatures for synthetic non-installer bytes, generated
with the repository's Tauri CLI 2.12.5. Their temporary private keys were discarded;
they are not production trust roots or an updater activation mechanism.

Run `cargo test --manifest-path native-updates/Cargo.toml --locked`.
These tests prove policy/signature/grant behavior, not real PackageKit/Polkit GUI
installation, native sandbox enforcement, full package rollback or power-loss
safety. Real desktop acceptance of the exact Debian package remains required.
