# Wry 0.57.2 private-context automation and Linux sandbox policy

Upstream crate: https://static.crates.io/crates/wry/wry-0.57.2.crate
Original SHA-256 (verified before extraction): `a490119196d02a51d0871df7b9119a1f3e46d75b7e90053a801454d5c6b3491c`.
Original licenses and source are preserved. Cargo.lock inside the dependency archive is omitted; the application lockfile controls resolution. This is a declared source fork, not a modified registry checksum or a verification bypass.

The only modified upstream source files are src/webkitgtk/mod.rs and src/webkitgtk/web_context.rs. They transfer an explicitly enabled automation setting from an unused caller context to the new ephemeral context. WebKitGTK permits only one automation context, so the original is disabled first; an already registered view/session is never displaced. Wry previously discarded that setting when incognito was true. A real tauri-driver session then failed to create a browsing context, blocking the native IPC tests. The ephemeral context, sandbox, CSP, native ACL and resource limits remain unchanged. Tauri enables automation only when its trusted launcher sets TAURI_WEBVIEW_AUTOMATION=true; the preview supervisor explicitly forces TAURI_WEBVIEW_AUTOMATION=false even if the user manager has imported a true value. Normal preview children therefore continue with automation off.

Keep this patch until upstream supports automation for incognito contexts; do not replace the ephemeral profile with a shared or persistent test profile. Upstream reference: https://github.com/tauri-apps/wry/blob/wry-v0.57.2/src/webkitgtk/mod.rs

Milestone 3 adds an explicit Linux process-sandbox requirement in the same
`src/webkitgtk/mod.rs` creation path: default and ephemeral GTK contexts are set
to sandbox-enabled before any WebView is created, the setting is verified, and
a sandbox-disabling environment is rejected. Real Ubuntu WebKitGTK 2.52.6
contexts were observed defaulting to false; pre-fix WebKit processes had no
seccomp filter. The corrected release must demonstrate actual WebKit process
seccomp/namespaces, not just this API setting. The distro's bubblewrap and
xdg-dbus-proxy are required. AppArmor namespace opt-ins are explicit policy;
no fallback to an unsandboxed WebView is permitted. No third upstream source
file is modified by this extension.
