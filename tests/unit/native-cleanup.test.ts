import { expect, it } from 'vitest';
import {
  parseProcessIdentity,
  waitForCleanup,
  type CleanupSample,
  type ProcessIdentity,
} from '../../scripts/native-cleanup';

function fixture() {
  let clock = 0;
  const observations: ProcessIdentity[] = [];
  const options: Parameters<typeof waitForCleanup>[0] = {
    milliseconds: 300,
    initial: { '7': { start: 'old', state: 'R' } },
    now: () => clock,
    pause: async () => {
      clock += 100;
    },
    sample: async (): Promise<CleanupSample> => ({
      members: {},
      'cgroup.procs': '',
    }),
    identity: async (): Promise<ProcessIdentity | undefined> => undefined,
    observeLive: async (_pid: string, identity: ProcessIdentity) => {
      observations.push(identity);
    },
  };
  return {
    options,
    observations,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

it('waits for the seeded matching live identity after group emptiness without treating PF_EXITING as dead', async () => {
  const f = fixture();
  let reads = 0;
  f.options.identity = async () =>
    ++reads === 1
      ? { start: 'old', state: 'R', rawStat: 'flags=PF_EXITING' }
      : undefined;
  await waitForCleanup(f.options);
  expect(reads).toBe(2);
  expect(f.observations).toHaveLength(1);
});

it('fails if a matching live identity persists through the original deadline', async () => {
  const f = fixture();
  f.options.identity = async () => ({
    start: 'old',
    state: 'R',
    rawStat: 'live',
  });
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
  expect(f.observations).toHaveLength(3);
});

it('accepts a replaced historical PID while retaining newly observed group identities', async () => {
  const f = fixture();
  let samples = 0;
  f.options.sample = async (): Promise<CleanupSample> =>
    ++samples === 1
      ? {
          members: { '8': { start: 'new-child', state: 'R' } },
          'cgroup.procs': '8',
        }
      : { members: {}, 'cgroup.procs': '' };
  const lookedUp: string[] = [];
  f.options.identity = async (pid) => {
    lookedUp.push(pid);
    return { start: 'reused', state: 'R', rawStat: 'different identity' };
  };
  await waitForCleanup(f.options);
  expect(lookedUp.sort()).toEqual(['7', '8']);
});

it('never treats an indeterminate controller read as empty', async () => {
  const f = fixture();
  f.options.sample = async () => ({ members: {}, observerTransient: true });
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});

it('does not accept an empty snapshot while the group is populated again', async () => {
  const f = fixture();
  f.options.sample = async () => ({ members: {}, 'cgroup.procs': '8' });
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});

it('propagates unexpected identity and controller errors', async () => {
  for (const field of ['identity', 'sample'] as const) {
    const f = fixture();
    f.options[field] = async () => {
      throw Error('Permission denied');
    };
    await expect(waitForCleanup(f.options)).rejects.toThrow(
      'Permission denied',
    );
  }
});

it('rejects empty/terminated evidence that finishes after the absolute deadline', async () => {
  const f = fixture();
  f.options.identity = async () => {
    f.advance(301);
    return undefined;
  };
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});

it('does not reset the deadline after observing a new child', async () => {
  const f = fixture();
  let n = 0;
  f.options.sample = async () => ({
    members: { [String(++n)]: { start: 'child', state: 'R' } },
    'cgroup.procs': String(n),
  });
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
  expect(n).toBe(3);
});

it('accepts a zombie only when the group is also empty', async () => {
  const f = fixture();
  f.options.identity = async () => ({
    start: 'old',
    state: 'Z',
    rawStat: 'zombie',
  });
  await waitForCleanup(f.options);
  expect(f.observations).toHaveLength(0);
});

it('rejects a late empty controller read even with no historical identities', async () => {
  const f = fixture();
  f.options.initial = {};
  f.options.sample = async () => {
    f.advance(301);
    return { members: {}, 'cgroup.procs': '' };
  };
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});

it('refuses absent or enlarged observation bounds before IO', async () => {
  for (const milliseconds of [NaN, Infinity, 0, -1, 75001]) {
    const f = fixture();
    f.options.milliseconds = milliseconds;
    f.options.sample = async () => {
      throw Error('IO must not start');
    };
    await expect(waitForCleanup(f.options)).rejects.toThrow('finite bound');
  }
});

it('confirms the group again when it repopulates during historical PID reads', async () => {
  const f = fixture();
  let repopulated = false;
  f.options.identity = async () => {
    repopulated = true;
    return undefined;
  };
  f.options.sample = async () => ({
    members: {},
    'cgroup.procs': repopulated ? '8' : '',
  });
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});

it('parses kernel identity despite spaces and closing parentheses in comm', () => {
  const raw =
    '7 (name ) with spaces) ' +
    ['R', ...Array<string>(18).fill('0'), '42'].join(' ');
  expect(parseProcessIdentity(raw)).toEqual({
    rawStat: raw,
    start: '42',
    state: 'R',
  });
});

it('never treats malformed procfs identity as PID reuse or termination', () => {
  for (const raw of [
    '',
    '7 (truncated) R',
    'missing fields',
    '7 (bad) ?? ' + Array<string>(19).fill('0').join(' '),
  ]) {
    expect(() => parseProcessIdentity(raw)).toThrow(
      'Malformed process identity',
    );
  }
});

it('rejects late group confirmation after otherwise successful PID reads', async () => {
  const f = fixture();
  let calls = 0;
  f.options.sample = async () => {
    if (++calls === 2) f.advance(301);
    return { members: {}, 'cgroup.procs': '' };
  };
  await expect(waitForCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline exceeded',
  );
});
