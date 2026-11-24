import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { once } from 'node:events';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';

test(
  'Linux concurrent evidence replacements survive observer termination',
  { timeout: 15000, skip: process.platform !== 'linux' },
  async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pn-evidence-checkpoint-'));
    const file = join(directory, 'report.json');
    const writer = spawn(
      process.execPath,
      [
        '--input-type=module',
        '--eval',
        `
    const { checkpointEvidence } = await import(process.argv[1]);
    const payload = 'x'.repeat(1024 * 1024);
    for (let generation = 0; ; generation++) {
      await checkpointEvidence(process.argv[2], { generation, payload });
      if (!generation) process.stdout.write('ready');
    }
  `,
        new URL('../../scripts/evidence-checkpoint.mjs', import.meta.url).href,
        file,
      ],
      { stdio: ['ignore', 'pipe', 'pipe'] },
    );
    const exited = once(writer, 'exit');
    try {
      await Promise.race([
        once(writer.stdout, 'data', { signal: AbortSignal.timeout(10000) }),
        exited.then(() => {
          throw Error('Observer exited before its first checkpoint');
        }),
      ]);
      const generations = new Set();
      async function complete() {
        const value = JSON.parse(await readFile(file, 'utf8'));
        assert.ok(
          Number.isSafeInteger(value.generation) && value.generation >= 0,
        );
        assert.equal(value.payload, 'x'.repeat(1024 * 1024));
        generations.add(value.generation);
      }
      // Reads race real replacements. A truncate/write implementation can expose
      // empty or partial JSON; the final SIGKILL must retain one complete report.
      for (let index = 0; index < 25; index++) await complete();
      assert.ok(generations.size > 1, 'No actual replacement was observed');
      assert.equal(writer.kill('SIGKILL'), true);
      assert.deepEqual(await exited, [null, 'SIGKILL']);
      await complete();
    } finally {
      writer.kill('SIGKILL');
      await exited;
      await rm(directory, { recursive: true, force: true });
    }
  },
);
