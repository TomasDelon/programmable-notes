import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { readFile } from 'node:fs/promises';
import { performance } from 'node:perf_hooks';
import test from 'node:test';
import {
  parseProcessIdentity,
  waitForStartupCleanup,
} from '../../scripts/native-cleanup.ts';

test(
  'startup cleanup verifies a real owned Linux process exits after an initially live identity',
  { skip: process.platform !== 'linux', timeout: 10000 },
  async () => {
    const child = spawn(
      process.execPath,
      ['-e', 'setInterval(() => {}, 1000)'],
      {
        stdio: 'ignore',
        env: {},
      },
    );
    const closed = once(child, 'close');
    await once(child, 'spawn');
    try {
      const initial = parseProcessIdentity(
        await readFile(`/proc/${child.pid}/stat`, 'utf8'),
      );
      assert.notEqual(initial.state, 'Z');
      let reads = 0;
      const result = await waitForStartupCleanup({
        requested: performance.now(),
        initial: { [String(child.pid)]: initial },
        now: () => performance.now(),
        pause: () => new Promise((resolve) => setTimeout(resolve, 10)),
        // Controller emptiness is a fixture here. This tests actual /proc
        // identity/termination, not a real systemd/cgroup or Tauri boundary.
        sample: async () => ({ members: {}, 'cgroup.procs': '' }),
        identity: async (pid) => {
          reads++;
          try {
            const identity = parseProcessIdentity(
              await readFile(`/proc/${pid}/stat`, 'utf8'),
            );
            if (reads === 1) {
              assert.equal(identity.start, initial.start);
              assert.notEqual(identity.state, 'Z');
              assert.equal(child.kill('SIGTERM'), true);
            }
            return identity;
          } catch (error) {
            if (error.code === 'ENOENT' || error.code === 'ESRCH')
              return undefined;
            throw error;
          }
        },
      });
      assert.ok(
        reads >= 2,
        'An initially live identity cannot establish termination',
      );
      assert.equal(result.noKnownLiveDescendants, true);
      await closed;
      assert.equal(child.signalCode, 'SIGTERM');
    } finally {
      if (child.exitCode === null && child.signalCode === null)
        child.kill('SIGKILL');
      await closed;
    }
  },
);
