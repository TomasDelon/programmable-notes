# Current installed release: ordinary desktop observations

Installed binary SHA256:
`b3b1e05f4b76be83ff5c5c144f5aff98ccdfb0c9a059ffd29b3b334c97f19b83`.
Corresponding parent-inspected DEB SHA256:
`e2d382f0e84a6b84098d8cca2ac94cab26dd1b7725d076fb3764a833c85779d7`.

Both cases used the installed desktop entry through `gio launch` as UID1000,
authenticated Xvfb:99/Openbox, and explicit ordinary desktop HOME/USER/DBus/X11
environment. No WebDriver launch, session, inspector endpoint or app test feature
was used. Commands and the complete selected environment observations are retained.

## Software-rendering baseline: PASS

`final-desktop-baseline-complete/result.json` records `passed:true`. Both editor
and production child passed the unchanged strict WebProcess observer: effective
UID1000, NoNewPrivs1, Seccomp2/filter count1, and separate mount/network/PID/user
namespaces. Both editor and child had no inspector endpoint or enabled automation.
Both supported rendering switches were exactly1 in both processes.

The default browser-WASM MDX build launched real supervised child16602 in
`programmable-notes-preview-16469-1794967878052194050.service`. External accessibility
clicked Count0, clicked Count1, and found Count2. `counter-two.png` visibly shows
the actual MDX heading, paragraph and Count2 button. The preview remained active
immediately before normal editor WM_DELETE_WINDOW. Editor, service group and all
known WebProcesses then exited without forced cleanup. Total controller time was
73964ms; the preview's actual fixed lifetime remained60seconds throughout.

Effective policy files were cpu.max=`25000 100000`, memory.max=`536870912`,
memory.swap.max=`0`, pids.max=`128`; pids.events reported max0.

The first baseline attempt (`final-desktop-baseline/`) is retained as an unsuccessful
controller attempt: its64s whole-controller work budget included desktop compilation
before child launch and cut the external readiness call short. It still passed
both observers and clean-close cleanup. The successful retry only enlarged the
operator's whole-controller allowance and captured the final screenshot directly
in the already initialized Gdk observer, leaving every child policy unchanged.

## No rendering switches: bounded FAIL

`final-desktop-no-renderer-flags/result.json` records `passed:false`, elapsed66801ms.
Both switches were absent from the editor, as were inspector/automation variables.
The editor initially passed the strict engine observer, but its page remained
blank; no governed default Counter service was reached. `failure.png` shows the
blank native editor. App stderr records DRI3/EGL device warnings. Kernel journal
records llvmpipe-0 and llvmpipe-2 segfaults at2026-11-18 02:08:03UTC.

The ordinary editor closed normally and known WebProcesses exited. No child was
launched, so child switch omission and Counter behavior were not observed in this
case. This is a real rendering failure in this software QEMU/Xvfb environment,
not an engine-sandbox assertion failure or a physical-GPU/Wayland result.

## Exact environment and retained files

Ubuntu24.04.5; QEMU TCG4vCPU/8GiB; kernel6.8.0-149-generic; systemd255.4-1ubuntu8.18;
GTK3.24.41-4ubuntu1.3; WebKitGTK/WebKitWebDriver2.52.6-0ubuntu0.24.04.2;
bubblewrap0.9.0-1ubuntu0.3; xdg-dbus-proxy0.1.5-1ubuntu0.2. Both measured namespace
restriction sysctls remained1. No profile/sysctl/resource policy was modified.

Each result directory contains result.json, commands.log, application.log,
desktop-entry.txt, screenshots, user/kernel journals and SHA256SUMS. The harness
and exact external UI helpers remain under /tmp/pn-m3-infra. No SSH key or
Xauthority cookie content is present in these result directories.

The final postcheck found no installed-app/WebKit processes or preview units;
the graphical session and VM were left intact for parent evidence collection.
Physical GPU and Wayland were not run.
