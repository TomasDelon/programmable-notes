# Trusted editor keyboard saving

Base 181d2d4. Real Ctrl+S previously produced no source download; the focused
browser regression failed waiting for it. The trusted editor now supports
Ctrl/Cmd+S through the existing Save flow and Shift for native Save As. Focus
Source, Visual or the editor toolbar. Browser Save exports MDX; native saving
retains explicit picker/grant authorization and atomic writes.

The handler belongs to the privileged editor's own main element. It prevents the
browser page-save default, requires a trusted keyboard event, and ignores repeat,
composition and Alt-modified input. Pending visual edits and active file operations
retain their guards. No iframe keyboard-message relay or preview permission was
added. Native preview never mounts the editor App. Shortcuts have visible toolbar
titles and accessibility metadata. Read-only review found no important issue.

## Executed browser regression

Formatting, lint, strict TypeScript, 56 unit and 26 Chromium tests passed. Actual
keys exported exact BOM/CRLF/JSX source. Synthetic events did not save; a held-key
repeat produced one download; unapplied visual text stayed pending and was not
saved. Escape re-enabled saving. A deliberately deferred File.arrayBuffer read
kept Save blocked while Source remained usable. Text typed during that read was
retained after the incoming document opened and exact export of the old buffer.
The deferred boundary eventually calls the real File method; application state,
source editing and downloads are real browser interactions.

## Actual production Linux package

Optimized Debian package, no test feature, installed in the disposable Ubuntu
24.04.5/WebKitGTK 2.52.6/QEMU TCG/Xvfb desktop using documented software rendering:

- Debian SHA-256: `ee4b4e3f8eef1cf2f31d94c6e9af1af52bd0dcf735b65c3dcb79c8acf61ff271`.
- ELF SHA-256: `886285a41426b8d1d66a3c432139e057f7bf6a31cc823fd5831a30112cfccb5e`.
- Builder/source hash matched the checkout (`raw/source.sha256`).

Real xdotool Ctrl+S with pending visual text left it and disk unchanged. Native
close/Cancel retained the draft. After Escape and a fresh applied edit, actual
Ctrl+S saved exact bytes through the authorized grant. Undo/Redo, reopening and
mode 0640 passed. Actual Ctrl+Shift+S opened the native chooser: cancellation kept
the original, then choosing a separate new path saved an exact copy without
changing the original. The app exited cleanly. One completed chooser emitted an
X_QueryTree/BadWindow diagnostic; chosen output and complete source were checked
independently afterward. The successful raw log retains it.

With installed native prerequisites, a disposable empty profile and fresh fixture
environment:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-pending-edit.mjs --leading-bom --shortcuts
```

This runner stops preview and pauses automatic recovery to isolate keyboard/file
acceptance; it does not claim a fresh native security/resource matrix. The prior
installed-package IPC/policy test retains its own binary hash. No native capability,
resource, namespace, CSP, recovery format or permission policy changed. Real IME,
physical Cmd-key platforms, GPU/Wayland and prior blank-preview recovery remain
unvalidated. Hosted jobs are still blocked before runner startup by account billing.
