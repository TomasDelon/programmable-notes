# Unified workspace: installed Linux acceptance

Source: `e0689a9` on `feat/mdx-react-engine`. Actual optimized `custom-protocol`
Debian build, without `security-test`, installed with dpkg in a disposable
Ubuntu 24.04.5 / WebKitGTK 2.52.6 full-system VM. Xvfb/Openbox and the previously
documented software-rendering flags were used. No capability or sandbox change
was made for the new interface. The browser suite uses Chromium separately.

Package SHA-256: `2c1c710d841c80c32aa671aa84f8e06c879f898d821b39e434a57a50fe512958`.
Installed ELF SHA-256: `931df52adc311012dda3c358337723322d21b864d527904f93dbfa017b830814`.
Raw source hashes, build/install output and test logs are retained in `raw/`.
The external test runner was updated after the package build; it is not embedded
in the application and grants no application capabilities.

## Actual results

`native-acceptance.log` records passing Source/Split/Visual mode changes, inline
heading and multiline paragraph edits using real WebDriver/xdotool input,
punctuation, exact UTF-8/CRLF disk saves, mode 0640 preservation, undo/redo,
dirty-close cancellation, actual root-process exit and restart, saved-file
reopen, explicit recovery into a new unsaved buffer, collision refusal, invalid
UTF-8 recovery rejection and explicit deletion. The original disk document
remained unchanged by recovery. Stop preview is used for this document-UI suite;
it does not claim native React interaction or resource pressure from that run.

`raw/native-ipc.log` records a separate passing installed-binary suite: editor
positive IPC control; preview denial of all 11 editor commands, including draft
recovery; absence of privileged plugins; real WebKitGTK Counter interaction to 2;
DOM/storage isolation; file/HTTP fetch denial; private profile; production child
automation disabled; distinct actual network namespace and NoNewPrivileges;
512 MiB memory, zero swap, CPU 25%, pids 128; and full-group Stop. This suite
observes effective limits, not CPU/OOM/expiry stress.

The local repository check passed 26 unit tests and 18 production Chromium tests,
including existing browser sandbox probes. See `raw/check.log`. Two overlapping
local check invocations initially collided in Playwright's output directory;
those runs were discarded and this retained check ran alone and exited zero.

## Scope and reproduction

Use the prerequisites and administrator opt-in scope in `docs/NATIVE_SECURITY.md`
and `docs/LINUX_DESKTOP_TESTING.md`. Install the production Debian package in a
disposable desktop profile; start tauri-driver as that ordinary desktop user.
Then, from the checkout:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-acceptance.mjs
```

Use a fresh fixture directory for each run. The recovery slot must initially be
empty; the harness intentionally refuses to overwrite an existing recovery copy.
The native dialog tests need Python AT-SPI support, xdotool and the actual
matching graphical session. WebDriver's networking configuration differs from
normal production startup; these observations do not replace the historical
namespace/seccomp/resource evidence. CPU/OOM/expiry pressure was not repeated for
this UI-only change. Physical GPU, Wayland, native React state across mode
changes, and touch/IME behavior remain untested. This is not a claim of production
security readiness.
