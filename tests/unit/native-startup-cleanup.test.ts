import { expect, it } from 'vitest';
import {
  waitForStartupCleanup,
  type CleanupSample,
} from '../../scripts/native-cleanup';

function fixture() {
  let clock = 0;
  const options: Parameters<typeof waitForStartupCleanup>[0] = {
    requested: 0,
    initial: { '7': { start: '123', state: 'R' } },
    now: () => clock,
    pause: async () => {
      clock += 100;
    },
    sample: async () => ({ members: {}, 'cgroup.procs': '' }),
    identity: async () => undefined,
  };
  return {
    options,
    advance: (ms: number) => {
      clock += ms;
    },
  };
}

it('allows a matching historical process to terminate within the unchanged startup cleanup budget', async () => {
  const f = fixture();
  let reads = 0;
  f.options.identity = async () =>
    ++reads === 1
      ? { start: '123', state: 'R', rawStat: 'still exiting' }
      : undefined;
  await expect(waitForStartupCleanup(f.options)).resolves.toMatchObject({
    cleanupMs: 100,
    noKnownLiveDescendants: true,
  });
});

it('refuses a group which repopulates during historical identity verification', async () => {
  const f = fixture();
  let samples = 0;
  f.options.sample = async (): Promise<CleanupSample> =>
    ++samples === 1
      ? { members: {}, 'cgroup.procs': '' }
      : { members: { '8': { start: 'new', state: 'R' } }, 'cgroup.procs': '8' };
  await expect(waitForStartupCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline',
  );
  expect(f.options.now()).toBe(5000);
});

it('refuses identity evidence arriving after the five-second cleanup deadline', async () => {
  const f = fixture();
  f.options.identity = async () => {
    f.advance(5001);
    return undefined;
  };
  await expect(waitForStartupCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline',
  );
});

it('waits through the original deadline but never accepts a persistent live identity', async () => {
  const f = fixture();
  f.options.identity = async () => ({
    start: '123',
    state: 'R',
    rawStat: 'live',
  });
  await expect(waitForStartupCleanup(f.options)).rejects.toThrow();
  expect(f.options.now()).toBe(5000);
});

it('cannot attribute cleanup arriving at or after the earliest service expiry to Stop', async () => {
  const f = fixture();
  f.advance(59900);
  f.options.identity = async () => {
    f.advance(100);
    return undefined;
  };
  await expect(waitForStartupCleanup(f.options)).rejects.toThrow();
});

it('does not treat transient or missing membership evidence as an empty group', async () => {
  for (const sample of [
    { members: {}, transient: true, 'cgroup.procs': '' },
    { members: {} },
  ]) {
    const f = fixture();
    f.options.sample = async () => sample;
    await expect(waitForStartupCleanup(f.options)).rejects.toThrow();
  }
});

it('shortens observation to the remaining service lifetime instead of extending it by five seconds', async () => {
  const f = fixture();
  f.advance(58900);
  f.options.identity = async () => ({
    start: '123',
    state: 'R',
    rawStat: 'live',
  });
  await expect(waitForStartupCleanup(f.options)).rejects.toThrow(
    'Cleanup deadline',
  );
  expect(f.options.now()).toBe(60000);
});

it('accepts a disappeared controller only after every known identity is terminal', async () => {
  const f = fixture();
  f.options.sample = async () => ({ members: {}, groupGone: true });
  f.options.identity = async () => ({
    start: '123',
    state: 'Z',
    rawStat: 'zombie',
  });
  await expect(waitForStartupCleanup(f.options)).resolves.toMatchObject({
    cleanupMs: 0,
    noKnownLiveDescendants: true,
  });
});
