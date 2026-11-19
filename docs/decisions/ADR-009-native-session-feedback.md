# ADR-009 — Native session connection feedback

Status: implemented; installed expiry/rebuild/interaction and UI Stop verified.
Independent boundary/fidelity regressions are recorded in dated evidence.

The installed baseline rendered an interactive counter, then naturally expired
at systemd's unchanged 60-second limit. The editor still displayed “Compiled —
requesting isolated native preview” and no dynamic session state. Compilation
success and a live native runtime need separate descriptions.

Add one editor-only, argument-free `preview_connection_active` read command. It
repeats native authorization and asks the supervisor's owned `systemd-run --wait`
child handle whether that connection is still alive. A false result means the
connection ended or was lost; it does **not** establish an empty cgroup, expiry,
OOM or renderer health. Preserve both the unit identity and owned child handle
for the existing Stop/replacement cleanup. Never infer termination from a frontend
timer or silently discard a unit on a status read.

The trusted NativePreview polls this boolean serially once per second after a
successful start. It displays starting, connected, ended/disconnected or unknown.
Reject non-boolean responses. Stop polling on end/error/cleanup and ignore replies
belonging to an older effect. One shared in-flight gate prevents overlapping reads even across rebuilds; execution
Stop/start does not wait on that gate. No automatic restart, execution
extension, source change or filesystem operation follows from a status response.
Manual Rebuild retains the existing verified Stop-before-start path.

Alternatives: a frontend timer cannot know when systemd started or why a session
ended; querying systemctl every second adds processes and still needs unknown
handling. The owned wait handle supplies the smallest bounded connection signal.
It deliberately does not promise a healthy renderer or enforcement verification.
All 25% CPU, 512MiB memory, zero swap, 128 tasks and 60-second restrictions remain.

Native acceptance must retain actual expiry journal evidence, UI transition,
manual rebuild/interaction and Stop, unchanged source, new command denial from
preview, and all existing native boundary/fidelity regressions. Browser/mocked
transport tests are separate from installed runtime proof.
