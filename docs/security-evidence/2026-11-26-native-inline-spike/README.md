# Native X11 embedding diagnostic, 26 November 2026

**Result: NOT PROVEN.** Neither cold nor warm-cache execution rendered the fixed
button/input fixture before the unchanged 60-second unit lifetime. No native
inline React, input/focus, clipping, Stop or security acceptance passed.

This is a Python GTK/WebKitGTK diagnostic, **not the pinned Wry implementation
or Programmable Notes**. The fixture is plain fixed HTML/JavaScript, not React
or compiled MDX. It tests the underlying X11/GTK sequence discovered in Wry:
create a native child window under another process's XID, wrap it in a foreign
GDK window, then realize a GTK/WebKit view there. It does not reproduce all Wry
initialization or the production artifact/IPC/CSP boundary.

The tested repository source was `dc60a3d69913d8e30ae66e1a55591a82d3526a38`.
The disposable environment was a freshly built Ubuntu 24.04 guest with kernel
6.8.0-149-generic, GTK 3.24.41 and WebKitGTK 2.52.6, running through QEMU TCG with
4 virtual CPUs and 8 GiB RAM. No old guest disk or application profile was booted.
Missing dependencies were fetched from official Ubuntu repositories after the
cached-only installation failed. The outer container's cgroup driver is `none`;
measurements below came from the guest's own cgroup2 mount.

The diagnostic guest used the documented disposable administrator opt-in for
systemd-executor user namespaces. Global namespace restrictions were not disabled.
Its exported container rootfs retained `.dockerenv`, causing systemd to omit
securityfs mounting; the failed profile load was retained and securityfs was
explicitly mounted before retry. This image is unsuitable as final security
acceptance infrastructure. Future image construction must remove container
markers and revalidate the complete environment before production tests.

| Observation                                   | Cold attempt           | Warm-cache control         |
| --------------------------------------------- | ---------------------- | -------------------------- |
| Trusted host PID                              | 505                    | 645                        |
| Supervised Python child PID                   | 513                    | 651                        |
| Host/child parent XID reported by harness     | 4194318                | 4194318                    |
| Native child XID reported by harness          | 8388609                | 8388609                    |
| Host marker time (UTC)                        | 17:21:32               | 17:23:10                   |
| WebView setup marker, sandbox flag true       | 17:22:12               | 17:24:06                   |
| First observed WebKit load event              | LOAD_STARTED, 17:22:32 | No completed load observed |
| Rendered fixture / successful component input | Not observed           | Not observed               |

The initial namespace positive control read `net:[4026531840]` outside the
private service and `net:[4026532253]` within it. During the warm control, actual
controller files read `cpu.max=25000 100000`, `memory.max=536870912`,
`memory.swap.max=0`, `pids.max=128`. These are sampled controller values, not a
proof of every descendant's ownership, enforcement under attack or cleanup.

Both attempts emitted EGL DRI3 warnings and a GDK frame-clock assertion. AT-SPI
bus services were missing. The cold DOM observer received null-field errors
before the document loaded. The first external input observer failed because
`xwininfo` was absent; its replacement used installed `xdotool`. The warm
observer sent clicks/type but the screenshot shows `hello` in the **trusted host
entry**, while the reserved component region stayed blank. No successful
component focus/input observation can be inferred from that attempt.

The warm unit journal reported its 60-second runtime limit, then a one-second
stop timeout, SIGKILL and `Failed to kill control group ... Invalid argument`.
A later sample found the unit cgroup absent and none of PIDs 651/681/690 listed.
That late sample is not the existing bounded cleanup oracle, a Stop attribution
pass, or an explanation of the kill warning. No CPU/memory attack tests ran.
The fresh guest was shut down with `systemctl poweroff`; its console reached
`reboot: Power down` and a subsequent container process listing found no QEMU.

The two synthetic screenshots are retained here. They establish only the
visible host/blank region and the unintended host input. They do not establish
rendered child clipping. Source hashes and measured observations are in
[receipt.json](receipt.json). Exact tested diagnostic source is in `repro/`;
no guest credentials, raw SSH logs, rootfs or disks are committed.

## Reproduction on a fresh disposable Linux desktop/VM

Use the normal prerequisites in [NATIVE_SECURITY](../../NATIVE_SECURITY.md): a
non-root desktop user, delegated user systemd cpu/memory/pids controllers,
functioning private network namespaces, enabled WebKit process sandbox and
authenticated X11. Install `python3-gi`, `gir1.2-gtk-3.0`,
`gir1.2-webkit2-4.1`, `xvfb`, `xauth`, `xdotool` and a window manager. This
diagnostic cannot run as a security proof in an undelegated Docker container.

As the disposable VM administrator, install the fixed fixture source:

```sh
install -d -m 755 /probe
install -m 644 repro/embedding.py /probe/embedding.py
install -m 644 repro/observe.py /probe/observe.py
```

The following paths match the exact diagnostic's log/screenshot paths. Use only
a disposable machine: `/mnt` must be a writable evidence directory for the
ordinary test user. From that user's authenticated X11 session, preserve
`DISPLAY`, `XAUTHORITY`, `XDG_RUNTIME_DIR` and `DBUS_SESSION_BUS_ADDRESS`:

```sh
readlink /proc/self/ns/net
systemd-run --user --wait --pipe --property=PrivateNetwork=yes \
  --property=NoNewPrivileges=yes /usr/bin/readlink /proc/self/ns/net
python3 /probe/embedding.py > /mnt/host.log 2>&1
```

Run the observer from a second terminal while the host is alive:

```sh
python3 /probe/observe.py > /mnt/observer.log 2>&1
journalctl --user -u pn-inline-child.service --no-pager
systemctl --user show pn-inline-child.service \
  -p MainPID -p ControlGroup -p RuntimeMaxUSec -p KillMode -p OOMPolicy
```

Use the returned `ControlGroup` to read `cpu.max`, `memory.max`,
`memory.swap.max`, `pids.max` and `cgroup.events` under `/sys/fs/cgroup` while
the child exists. Capture PID/start identities and namespace/seccomp metadata
independently before claiming security. This fixture's native setup does not
perform the application's verify-before-author-payload handshake and its unit
environment is not the production clean allowlist. It must remain limited to
the supplied trusted HTML. Do not put arbitrary notes or attack fixtures in it.

The probe sets the existing 512 MiB/zero-swap/25% CPU/128-task/60-second policy;
do not increase those limits or disable WebKit isolation to get a screenshot.
The parent expires after 65 seconds. Normal cold/warm attempts need separate log
files; retain failures and do not interpret a blank rectangle as success.

The next useful experiment is a minimal **actual vendored-Wry** executable on
an adequately provisioned disposable native desktop, with independent native
parent-tree, input and clipping observation and the same launch policy. The
current diagnostic cannot distinguish a foreign-window lifecycle defect from
software-rendering/startup cost. It supplies no reason to select a new host or
weaken the contract.
