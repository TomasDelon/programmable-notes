# Native redistribution notices

Linux installer creation is gated on `npm run native:notices`. This is a
redistribution inventory, not a project license or a production security claim.
The generated text and its machine-readable provenance are installed alongside
the application. Do not distribute an older inventory after this gate fails.

## Scope and exact sources

`scripts/native-notices.mjs` reads the locked Linux x86_64 Cargo resolve graph
with the production `custom-protocol` feature. It deliberately includes reachable
build and development dependencies: a conservative source inventory rather than
an assertion that every listed component is linked. The four project-owned crates
are identified by exact repository path and package name; no license is inferred
for them. Every other path dependency needs explicit review.

For registry crates the compressed `.crate` SHA256 must equal `Cargo.lock`.
Installed package manifests and every selected legal file must match bytes in that
exact archive. Legal files in nested source directories are included too. Missing
archives, unknown license declarations, missing legal texts, invalid UTF-8,
unsafe paths, symlinks, changed manifests and changed license bytes fail the gate.
The inventory preserves complete original text rather than substituting generic
license templates. Exact crate source archive links and checksums accompany the
texts, including source availability for MPL components.

Several published crates omit their license files. Their reviewed exceptions in
`licenses/native/provenance.json` bind the package checksum, archived
`.cargo_vcs_info.json` revision and repository subdirectory to verbatim sidecars
from an exact upstream commit. The `selectors` crate explicitly directs readers
from its archived source header to Mozilla's MPL 2.0 text; its sidecar is the
complete official text pinned to an exact Mozilla website repository commit.
These exceptions must not be reused for a different release without review.

The Wry fork's original version, manifest, original archive checksum and legal
texts are pinned separately. Its modified source and change description remain
in `src-tauri/vendor/wry`; `scripts/verify-wry.mjs` checks the sanctioned patch.
The existing frontend/npm/WASM inventory is embedded in full, including its own
embedded runtime notices and conservative build-tool coverage.

Cargo does not inventory statically linked Rust standard-library code. The
pinned Rust 1.100.0 compiler commit is therefore checked separately. The verbatim
`COPYRIGHT-library.html`, complete `COPYRIGHT.html`, root legal texts and all
legal resources from the official rustc distribution are preserved as deterministic
gzip sidecars (17 resources). Their provenance records the verified official
archive SHA256 and exact member names. Both compressed and decompressed hashes
are checked; installed compiler legal resources must match as well. The complete
compiler inventory intentionally exceeds the standard-library components linked
into the executable. The HTML is preserved as legal text in the `.txt` output,
not executed or rewritten. A compiler update requires a fresh reviewed inventory.

GTK, WebKitGTK and other dynamically linked system libraries are package-manager
prerequisites supplied by the operating system. Their binaries are not copied
into this `.deb`; this inventory does not pretend to cover redistribution of a
Linux distribution or a future self-contained AppImage. A different package
format or additional bundled native binaries requires another review.

## Reproduction and updating

Use Linux x86_64, the repository-pinned Rust toolchain and `npm ci`. Fetch the
locked Cargo sources before generation if the registry cache is empty:

```sh
cargo fetch --locked --manifest-path src-tauri/Cargo.toml --target x86_64-unknown-linux-gnu
npm run native:notices
node --test tests/tooling/native-notices.test.mjs
```

Outputs (ignored):

- `.cache/native-notices/NATIVE_THIRD_PARTY_NOTICES.txt`
- `.cache/native-notices/metadata.json`

Metadata contains public relative paths, identities, original public source URLs,
checksums, the target and command, and the final notice hash. It contains no
absolute registry/sysroot/workspace paths. The CLI first invalidates prior
metadata and only marks a complete generation `verified: true` after all checks.
Packaging must additionally compare the final text and current Cargo inputs with
these hashes, rather than trusting the presence of an output file.

On dependency/toolchain changes, regenerate against the exact locked source,
review all new declarations and actual upstream legal files, preserve missing
texts from pinned upstream commits (never a guessed license), and extend the
provenance only after verifying original bytes. For Rust, verify the official
compiler archive against the release manifest, copy its legal resources verbatim
and record both archive and resource hashes. Do not relax the gate to make a
package available. Keep the installer withheld if any required source or legal
text cannot be verified.

## Executed validation

On 2026-11-26 the current locked graph produced 346 third-party Cargo package
entries (including vendored Wry), four excluded project-owned crates, 227 embedded
npm entries and 17 Rust distribution legal resources. All seven targeted tooling
tests passed, including changed/missing texts, source/archive mismatches, unknown
registry/declarations, duplicate identities, unsafe paths, symlink escape,
unreviewed compiler, altered installed Rust texts, and altered upstream sidecars.
These checks validate notice provenance; they do not replace native runtime,
security, package installation or legal review of redistribution obligations.
