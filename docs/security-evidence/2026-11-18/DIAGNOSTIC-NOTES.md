# Production engine/AT-SPI diagnosis

The timed comparison below used installed binary
`00529e28690c01834c63b96fa420bc7958162710ba14f9cb19aac527725d2e90`
and the original unminified 705408-byte trusted MDX Counter artifact. No package,
sysctl, AppArmor profile, resource limit or supervisor lifetime was changed during
the comparison. The fixed 60-second lifetime includes startup before the IPC reply.

## Valid timed results

- `supervised-counter-deferred-clicks.log`: after a 35-second external wait and
  independent screenshot, actual external AT-SPI clicked Count0 at 49540 ms after
  start_preview reply, clicked Count1 at 51414 ms, and found Count2 at 53042 ms.
  Backend startup/reply took 3710 ms. `deferred-count2.png` shows actual Count2.
- `supervised-counter-early55.log`: original early polling with only the external
  Python readiness deadline raised to 55 seconds and caller timeout to 65 seconds
  clicked Count0 at 50622 ms after reply, clicked Count1 at 52387 ms, and found
  Count2 at 53999 ms. Backend reply took 3845 ms. `early55-count2.png` is retained.
- Both targets were exact supervisor MainPIDs and both completed Stop and WebDriver
  close. Thus the original 45-second readiness deadline was insufficient under
  QEMU TCG with the newly enabled engine sandbox. No early-query deadlock or PID
  selection defect was established. The outer GTK accessible application reports
  the host MainPID; nested content nodes report the sandbox's DBus proxy PID.
- A trusted GTK/WebKit raw-HTML probe reached LOAD_FINISHED under PrivateNetwork,
  NoNewPrivileges, CPUQuota25%, MemoryMax512M, TasksMax128 and a clean environment.
  No general HOME/environment failure was established. During the stable Counter
  failure pids.current was44 and pids.events max0, excluding thread-limit exhaustion.

## Invalid attempts: do not use as application or optimization evidence

- `supervised-counter-debug.log`: initial controller invoked backend Stop without
  setting the frontend's stopped state. Automatic compilation replaced its target
  unit, invalidating the chosen PID. Later timed runs use the real UI Stop first.
- `supervised-counter-minified.log`: diagnostic String.replace interpreted dollar
  sequences in replacement JavaScript, producing an expanded invalid artifact.
  This is a diagnostic-script mistake, not an application failure or valid
  minification comparison. Corrected callback replacement creates a 224926-byte
  artifact offline (`minified-artifact-shape.log`), but no valid runtime optimized
  comparison was completed by this subtask.
- `direct-preview-cleanenv.log`: clearing the direct WebDriver probe's environment
  also removed its inspector transport; this is not valid DOM evidence against
  production clean-environment startup.
- `strict-supervisor-denial-aborted-fuse.log`: this stopped before profile removal
  or helper execution because root cannot stat the portal's FUSE mount. It is not
  negative-backend evidence. The corrected strict-supervisor-denial.log records
  actual exit2, no payload sentinels, namespace rejection and trap restoration.

The later optimized package and full application suites belong to the parent
task and must be reported separately from these pre-optimization diagnostics.
