Build a working MDX/React editor with unsaved CodeMirror buffers, real hooks/events/JSX and explicitly selected TSX modules. Linux now adds native picker-authorized document open/save/Save As/reopen, atomic conflict-checked writes, metadata preservation and dirty-buffer recovery.

Production review fixes systemd's silent PrivateNetwork fallback, requires WebKit's process sandbox in the documented two-file Wry fork, and sanitizes service environment before delivering document code. The optimized Debian testing package preserves the preview's denied capabilities and fixed CPU/memory/task/lifetime limits. CI tests the native store/app, verifies Wry provenance and inspects a production package; compilation is kept distinct from runtime validation.

Validation: 20 Vitest tests, 5 Chromium integration tests and 25 Rust tests passed. The installed production binary without test features passed real Ubuntu/WebKitGTK IPC denial, filesystem/lifecycle, environment poisoning, CPU/OOM/Stop/expiry/crash/close recovery, and actual disk saving under CPU and confirmed growing-heap attacks. Normal desktop launch without WebDriver and a stricter AppArmor desktop run passed namespace/seccomp checks, `Count: 2` and active-preview shutdown.

Exact artifact hashes, source inputs, failed attempts and runtime evidence: docs/security-evidence/2026-11-18/README.md. Default rendering on QEMU/Xvfb fails with Mesa llvmpipe segfaults; the documented supported software-rendering variables pass. Physical GPU/Wayland and tighter distro integration remain next gates. No autosave/crash draft recovery or arbitrary compromised-native-code containment is claimed.

Keep this PR draft. No merge, public release or visual editing.
