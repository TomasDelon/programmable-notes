# P0 native recovery integration

Actual production `custom-protocol` Debian package, without test features, built
from the P0 integration source whose exact hashes are in `raw/runtime-source.sha256`.
Disposable Ubuntu 24.04.5 / WebKitGTK 2.52.6 VM, Xvfb/Openbox, supported software
rendering flags; unchanged preview sandbox, capabilities and resource policy.

Package SHA-256: `7eb562ebf91ec7b157027d5986f01cb8e3e0f954a72c063c68c729c691634f39`.
Installed ELF SHA-256: `57fcde07f1319acc7f41906a7b040bcd4a9743ac01a3fe01262a7831fc7b8414`.

`native-recovery.log` records actual installed-app results: two exact BOM/CRLF
versions; no original-file write; dirty-close cancellation; actual root-process
exit and restart with a different PID; discovery without a manual refresh;
explicit restore; Save As cancellation proving no inherited native grant; exact
save to a separate picker-selected file; corrupt-record refusal; older valid
recovery; and explicit deletion. The select is changed through WebDriver's
editor-side DOM bridge, with button handlers and real native file dialogs.
The test neither calls a privileged API from document code nor bypasses dialogs
for disk saving. The original document remains unchanged throughout.

The first harness attempt did not run: the copied test script was mode 0600 and
unreadable by the ordinary desktop user. Only that script was changed to 0644;
application/recovery permissions and isolation were not relaxed. The failed
attempt is retained separately. Synthetic temporary fixtures only.

Reproduce after installing the production package and starting tauri-driver in
the disposable graphical user session:

```sh
pn_env=$(NATIVE_INSTALLED_BINARY=/usr/bin/programmable-notes node scripts/native-test-setup.mjs)
. "$pn_env"
NATIVE_DISPOSABLE_PROFILE=1 node scripts/native-recovery.mjs
```

The recovery profile must initially contain no version records. The runner
refuses to erase an existing recovery collection and deletes only versions it
created after verifying their recovery behavior. CPU/OOM/expiry stress and
physical GPU/Wayland testing are separate; they are not claimed by this run.

A separate `raw/native-ipc.log` run passed against the same installed executable:
all 11 editor commands denied from preview, plus explicit list/append/restore/
delete/migrate recovery-action probes; absent privileged plugins; real Counter
interaction; file/HTTP fetch denial; private profile/network namespace; effective
cgroup limits and full-group Stop. This is not fresh CPU/OOM/expiry stress proof.
