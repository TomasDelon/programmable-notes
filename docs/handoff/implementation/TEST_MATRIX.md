# Regression Matrix

| Concern | Fixture / test | Required invariant |
|---|---|---|
| MDX Markdown | `counter.mdx` | Headings/text display with React control |
| JSX + hooks | `counter.mdx` | Interactive button updates state |
| Local TSX import | `imported-counter.mdx` | Module resolves from workspace and hooks work |
| Invalid MDX | `invalid.mdx` | Diagnostics visible; editor and original source preserved |
| Prevented network | `security-attempt.mdx` | External + loopback fetch denied in default sandbox |
| Source fidelity | `mixed-source.mdx` | No-op preserves bytes; one patch changes only requested span |
| React state vs source | `counter.mdx` | Clicking button does not rewrite .mdx source |
| Editing opaque JSX | `mixed-source.mdx` | No accidental deletion/reformatting |
| Safe import resolution | Workspace escape attempt (test-generated) | Denied |
| Versioning | Git repository fixture | Autosave != commit; no destructive push |
| Offline | lockfile dependencies preinstalled | No hidden network requirements during editing/preview |
| Platform | Chromium, Linux Tauri/WebKitGTK | Record actual outcomes separately |

Where no fixture exists yet, add one with the smallest reproducible input and a targeted test. Browser screenshots alone are not proof of security; native passes require native runtime tests.
