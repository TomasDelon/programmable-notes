# ADR-004: Authorized documents and Linux production boundary

Status: implemented; production runtime validation is recorded separately from compilation in the [Milestone 3 evidence](../security-evidence/2026-11-18/README.md).

The existing compiler, source editor and separate preview supervisor remain. No visual editing or new source grammar is introduced.

## Native document authority

Only the editor can invoke the seven document commands. They repeat native caller-label/child-mode authorization before accessing state or opening a dialog. The child receives no document state or dialog plugin. Generic filesystem, shell and dialog IPC permissions remain absent. Renderer arguments contain source and opaque grants/revisions, never a filesystem path to authorize. Native pickers are the source of authorization; cancellation creates no grant. Display paths returned to the trusted editor are informational.

The Rust store anchors an explicitly selected regular file to an open parent-directory descriptor, refuses symlinks/FIFOs, bounds UTF-8 source to 500,000 bytes per file, 32 grants and 8 MiB total, and generates unpredictable 128-bit grants/revisions. Files selected together form one compiler module group; neighbors and unrelated selections are not loaded automatically. Save As permits only supported source extensions. The file chooser is not a permission for arbitrary future paths.

Saving requires the current grant and revision plus unchanged inode/device/content. A same-directory exclusive temporary file preserves mode, group and extended attributes, including POSIX ACLs, before file fsync and atomic rename. A new Save As target uses RENAME_NOREPLACE; existing targets are captured before overwrite confirmation and checked again on commit. Parent renames cannot redirect the anchored write. Directory fsync follows commit; if it fails, the new revision is returned with an explicit durability warning rather than pretending the committed bytes were rolled back. Foreign-owned and read-only files are refused. Concurrent readers see complete old or new bytes.

There is no mandatory lock against a noncooperating process running as the same desktop user: another writer can race the final conflict check and rename. This is documented, not claimed solved by atomic replacement. A crash before rename can leave a bounded random temporary file; there is no draft journal or autosave. Unsaved buffers therefore require explicit save before crash recovery. Separate hard-link aliases continue to refer to the old inode.

The UI retains snapshots and revisions separately: editing while save/reopen is in flight never marks newer text saved or overwrites it. Native close waits for file operations and asks before discarding dirty text. The browser path continues to use explicit import/download rather than receiving native permissions.

## Actual Linux isolation

Requested systemd properties are insufficient evidence. Ubuntu can silently skip PrivateNetwork when AppArmor prevents unprivileged namespace creation and still return a successful unit. Before sending author HTML, the supervisor verifies a different actual network namespace, the same non-root effective UID and NoNewPrivs=1, in addition to bounded actual cgroup controller files. It refuses otherwise. The existing 25% CPU, 512 MiB memory, zero swap, 128 tasks and 60-second lifetime remain fixed.

The service executes `/usr/bin/env -i` with a graphical/locale allowlist and automation disabled. systemd's pre-exec injection variables are explicitly removed; core dumps are disabled and umask is 0077. Supported software-rendering switches are restricted to value 1. This does not remove native desktop session access through the allowed display and DBus endpoints.

Real WebKitGTK 2.52.6 normal and ephemeral contexts defaulted to process sandbox disabled. The declared two-file Wry fork now explicitly enables and checks sandboxing before WebView creation and refuses a sandbox-disable environment. Actual WebProcess seccomp and namespace inspection is required; a true API setting alone is not an enforcement test. The upstream archive is checked by hash and every extracted source file is compared automatically.

External WebDriver automation is a distinct trust configuration. WebKitGTK's inspector transport preserves the application's network namespace when WEBKIT_INSPECTOR_SERVER is nonempty. Therefore automated direct ACL probes cannot prove the normal production network sandbox. The preview supervisor removes that variable before exec, forces automation false, and actual supervised WebProcess namespace/seccomp observations are required separately. The unchanged observer rejects a network-sharing automated editor; normal desktop launch is tested without that transport.

The Debian package installs an AppArmor 4 namespace opt-in attached only to `/usr/bin/programmable-notes`. This permits WebKit bubblewrap; its unconfined profile is not a general MAC filesystem sandbox. Hooks never change global sysctls or grant systemd namespace permission. On hardened Ubuntu, enabling systemd's own PrivateNetwork can additionally require an administrator-reviewed executor namespace policy. That policy affects descendants of other systemd services and is deliberately not installed by this application. Without a working backend preview fails closed.

## Scope and residual risk

Document JavaScript is contained by iframe/CSP, Tauri ACL/handler checks, WebKit's process sandbox, and the supervised service. This is not a complete hostile-native-code sandbox: same-user DBus and authenticated X11, WebKit NetworkProcess privileges, native/browser vulnerabilities, device/GPU access and cgroup migration after a native compromise remain risks. No claim of arbitrary native escape resistance is made. Production testing is a prerequisite for serious desktop testing, not approval to ship hostile-document execution broadly. Physical GPU, Wayland, other distributions and non-Linux resource backends require separate validation.

## Browser import encoding

Browser imports decode file bytes as strict UTF-8 and retain a leading byte order mark in the source buffer. Malformed files reject the entire selection before workspace mutation. This matches the native source store's UTF-8 policy and preserves bytes for no-op downloads and future source range patches.

## Source extension spelling

Native grants and versioned snapshot names accept ASCII case variants of the same
six existing source formats. Open/Save As picker filters enumerate only those
spellings. Paths, logical module identities, names, revisions and source bytes
retain their exact case; unsupported formats remain rejected. This changes no
caller authorization, path-taking IPC, capability or original-file write policy.
Older application versions may reject newly created uppercase-named recovery
records; no record migration or rewriting is performed. Keep the newer binary
available when testing a downgrade.
