# Preview creation preserves source keyboard focus

A real installed-package test reproduced an input-focus defect: after the editor
(PID 9433) was explicitly active and its source focused, the automatically created
preview (PID 9507) became active. This interrupts source typing on live rebuilds.
The child window now starts unfocused. The editor's initial focus is unchanged;
normal user activation/focusability remains available. No capability, CSP,
namespace, environment or resource policy changed.

## Executed red/green native validation

The negative run failed the active-window PID assertion after the actual Counter
rendered. The optimized corrected production package was built and installed:

- deb SHA-256: `4654d62f6d3c8e1dc60cd4f0261c5720558e1aaf93f05d4162f9fa4f5b326eea`
- ELF SHA-256: `72e89298e1289f667fb1c0c6a6e5176379ad594631cc4e19ee930a6648d4406d`

The corrected run verified editor PID 9716 stayed active after preview PID 9790
rendered. Without reactivating/refocusing the editor, actual X keyboard input still
reached its source. The driver then explicitly activated the preview, focused its
real accessible button and sent a real Space key: React changed Count: 0 to Count: 1.
Returning to the editor and Undo restored the prior source textbox text. This
focus-specific comparison is DOM text; exact raw disk-byte preservation has its
separate persistence gates. Automatic recovery was paused before the positive
input test so the synthetic marker did not leave draft history.

The original production child had automation disabled and remained under the
unchanged supervisor. Full local checks passed 45 unit / 23 Chromium tests, and
the Rust app navigation/boundary test passed. The current package also passed
real native registered-command/recovery-action denial, private profile, distinct
network namespace, effective limits, Counter 2, parent DOM/storage and HTTP/file
denial. The automation-attached ACL probe does not substitute for ordinary-child
network/sandbox observations. Read-only review found no important issue.

Some successful xdotool activations emitted XGetWindowProperty diagnostics; active
PIDs and actual keyboard results were asserted independently. Logs retain them.
No physical GPU/Wayland or complete fresh crash/resource-matrix pass is claimed.
The earlier blank-startup failure remains unresolved; initial focus correction
must not be presented as resolving it.

Reproduce with the documented installed-app fixture environment and disposable
profile:

```sh
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-focus.mjs
```

The preview remains a separate native window. Select it explicitly to interact;
opening/rebuilding output should leave the source keyboard focus alone.
