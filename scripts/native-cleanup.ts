/** Bounded test observation; never a production process or authorization API. */
export interface ProcessIdentity {
  start: string;
  state: string;
  rawStat: string;
}
export function parseProcessIdentity(rawStat: string): ProcessIdentity {
  const end = rawStat.lastIndexOf(') ');
  const fields = rawStat
    .slice(end + 2)
    .trim()
    .split(/\s+/);
  if (
    end < 3 ||
    !/^[1-9][0-9]* \(/.test(rawStat) ||
    !/^[A-Za-z]$/.test(fields[0] ?? '') ||
    !/^[0-9]+$/.test(fields[19] ?? '')
  ) {
    throw Error(
      'Malformed process identity; termination cannot be established',
    );
  }
  return { rawStat, start: fields[19]!, state: fields[0]! };
}
export interface CleanupSample {
  members: Record<string, { start: string; state: string }>;
  'cgroup.procs'?: string;
  observerTransient?: boolean;
}
interface CleanupOptions {
  milliseconds: number;
  initial: CleanupSample['members'];
  now: () => number;
  pause: () => Promise<void>;
  sample: () => Promise<CleanupSample>;
  identity: (pid: string) => Promise<ProcessIdentity | undefined>;
  observeLive: (pid: string, identity: ProcessIdentity) => Promise<void>;
}
export async function waitForCleanup(options: CleanupOptions): Promise<void> {
  if (
    !Number.isFinite(options.milliseconds) ||
    options.milliseconds <= 0 ||
    options.milliseconds > 75000
  ) {
    throw RangeError(
      'Cleanup observation requires a finite bound of at most 75 seconds',
    );
  }
  const deadline = options.now() + options.milliseconds;
  const known = new Map(Object.entries(options.initial));
  while (options.now() < deadline) {
    const row = await options.sample();
    for (const [pid, identity] of Object.entries(row.members))
      known.set(pid, identity);
    if (options.now() >= deadline) break;
    if (!row.observerTransient && !row['cgroup.procs']?.trim()) {
      let terminated = true;
      for (const [pid, expected] of known) {
        const identity = await options.identity(pid);
        if (
          identity &&
          identity.start === expected.start &&
          identity.state !== 'Z'
        ) {
          terminated = false;
          await options.observeLive(pid, identity);
        }
      }
      // Slow IO cannot establish cleanup retrospectively. PF_EXITING is never
      // termination: a matching non-zombie identity must actually disappear.
      if (options.now() >= deadline) break;
      if (terminated) {
        const confirmation = await options.sample();
        let discovered = false;
        for (const [pid, identity] of Object.entries(confirmation.members)) {
          if (known.get(pid)?.start !== identity.start) discovered = true;
          known.set(pid, identity);
        }
        if (options.now() >= deadline) break;
        if (
          !discovered &&
          !confirmation.observerTransient &&
          !confirmation['cgroup.procs']?.trim()
        )
          return;
      }
    }
    await options.pause();
  }
  throw Error(
    'Cleanup deadline exceeded: group or historical process still unverified',
  );
}

interface StartupCleanupOptions {
  requested: number;
  initial: CleanupSample['members'];
  now: () => number;
  pause: () => Promise<void>;
  sample: () => Promise<
    CleanupSample & { transient?: boolean; groupGone?: boolean }
  >;
  identity: (pid: string) => Promise<ProcessIdentity | undefined>;
}

/** Diagnostic-only Stop attribution, bounded by cleanup AND service expiry. */
export async function waitForStartupCleanup(options: StartupCleanupOptions) {
  const remaining = 60000 - (options.now() - options.requested);
  if (!Number.isFinite(remaining) || remaining <= 0)
    throw Error(
      'Cleanup overlaps earliest expiry; cannot attribute it to Stop',
    );
  await waitForCleanup({
    ...options,
    milliseconds: Math.min(5000, remaining),
    sample: async () => {
      const row = await options.sample();
      return {
        ...row,
        observerTransient: Boolean(
          row.observerTransient ||
          row.transient ||
          (!row.groupGone && row['cgroup.procs'] === undefined),
        ),
      };
    },
    observeLive: async () => undefined,
  });
  const cleanupMs = options.now() - options.requested;
  if (cleanupMs >= 60000)
    throw Error(
      'Cleanup overlaps earliest expiry; cannot attribute it to Stop',
    );
  return { cleanupMs, noKnownLiveDescendants: true };
}
