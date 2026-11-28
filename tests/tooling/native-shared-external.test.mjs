import assert from 'node:assert/strict';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  readFile,
  symlink,
  writeFile,
} from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import * as externalWriter from '../../scripts/native-shared-external.mjs';
const { publishExternalSource } = externalWriter;

async function fixture() {
  const root = await mkdtemp('/tmp/pn-native-shared-');
  await chmod(root, 0o700);
  await mkdir(join(root, 'vault'), { mode: 0o700 });
  const file = join(root, 'vault', 'primary.mdx');
  const original = '\uFEFF# Original\r\nCafé 🌱\n<Opaque />\r\n';
  await writeFile(file, original, { flag: 'wx', mode: 0o640 });
  await chmod(file, 0o640);
  return { root, file, original };
}

test('independent writer changes exact source directly and by rename while preserving fixture mode', async () => {
  const f = await fixture();
  const direct = f.original.replace('Original', 'External');
  const before = await lstat(f.file);
  const one = await publishExternalSource(f.root, f.original, direct, 'direct');
  assert.deepEqual(await readFile(f.file), Buffer.from(direct));
  assert.equal((await lstat(f.file)).ino, before.ino);
  assert.equal(one.mode, 0o640);
  const atomic = direct + '\r\n{/* independent atomic 🌱 */}\n';
  const two = await publishExternalSource(f.root, direct, atomic, 'rename');
  assert.deepEqual(await readFile(f.file), Buffer.from(atomic));
  assert.notEqual((await lstat(f.file)).ino, before.ino);
  assert.equal(two.mode, 0o640);
  assert.equal(two.sourceSha256.length, 64);
  assert.equal(two.kind, 'rename');
});

test('writer refuses a stale source, unequal-length direct write and foreign fixture scope before modifying bytes', async () => {
  const f = await fixture();
  await assert.rejects(
    publishExternalSource(f.root, 'stale', f.original, 'rename'),
  );
  await assert.rejects(
    publishExternalSource(f.root, f.original, 'short', 'direct'),
  );
  await assert.rejects(
    publishExternalSource('/tmp', f.original, f.original, 'rename'),
  );
  assert.deepEqual(await readFile(f.file), Buffer.from(f.original));
});

test('writer refuses symlink redirection and leaves its unrelated target unchanged', async () => {
  const root = await mkdtemp('/tmp/pn-native-shared-');
  await chmod(root, 0o700);
  await mkdir(join(root, 'vault'), { mode: 0o700 });
  const target = join(root, 'unrelated.md');
  await writeFile(target, 'unchanged', { flag: 'wx', mode: 0o600 });
  await symlink(target, join(root, 'vault', 'primary.mdx'));
  await assert.rejects(
    publishExternalSource(root, 'unchanged', 'new bytes', 'rename'),
  );
  assert.equal(await readFile(target, 'utf8'), 'unchanged');
});

test('no-echo witness detects a same-byte app rewrite before visible-source acknowledgement', async () => {
  const f = await fixture();
  const source = f.original.replace('Original', 'External');
  const publication = await publishExternalSource(
    f.root,
    f.original,
    source,
    'direct',
  );
  await externalWriter.assertExternalPublication(f.root, source, publication);
  await publishExternalSource(f.root, source, source, 'rename');
  await assert.rejects(
    externalWriter.assertExternalPublication(f.root, source, publication),
  );
  assert.deepEqual(await readFile(f.file), Buffer.from(source));
});

for (const scenario of ['ordered', 'collapsed', 'cross-document'])
  test(`background installed witness verifies ${scenario} history behavior`, async () => {
    const collapsed = scenario === 'collapsed';
    const f = await fixture();
    const previous = '\uFEFF# Writer editor\r\nBody 🌱.\n';
    const base = previous + 'Typed.';
    const other = '# Background witness\n';
    await writeFile(f.file, base);
    await writeFile(join(f.root, 'vault', 'other.mdx'), other, {
      flag: 'wx',
      mode: 0o640,
    });
    await chmod(join(f.root, 'vault', 'other.mdx'), 0o640);
    let selected = 'primary',
      index = 1;
    let history = [previous, base];
    const ctx = {
      setStage: () => {},
      checkpoint: async () => {},
      screenshot: async () => {},
      source: async () => {},
      clickButton: async (name) => {
        if (name === 'Open other.mdx') selected = 'other';
        if (name === 'Open primary.mdx') {
          selected = 'primary';
          if (collapsed) {
            history = [previous, base, history.at(-1)];
            index = history.length - 1;
          }
        }
      },
      sourceShows: async (expected) =>
        assert.equal(selected === 'other' ? other : history[index], expected),
      pause: async () => {
        assert.equal(selected, 'other');
        history.push(await readFile(f.file, 'utf8'));
        index++;
      },
      chord: async (key, redo) => {
        assert.equal(key, 'z');
        index += redo ? 1 : -1;
        await writeFile(f.file, history[index]);
        if (
          scenario === 'cross-document' &&
          redo &&
          index === history.length - 1
        )
          await writeFile(
            join(f.root, 'vault', 'other.mdx'),
            'accidental unrelated write',
          );
      },
      bytes: async (expected) =>
        assert.deepEqual(await readFile(f.file), Buffer.from(expected)),
    };
    const job = externalWriter.verifyBackgroundExternalHistory({
      fixture: f.root,
      base,
      previous,
      ctx,
    });
    if (collapsed) await assert.rejects(job);
    else if (scenario === 'cross-document')
      await assert.rejects(job, {
        code: 'ERR_ASSERTION',
        message: /Other document bytes preserved/,
      });
    else {
      const result = await job;
      assert.equal(result.checkpoints, 3);
      assert.equal(result.noEchoChecks, 3);
      assert.equal(result.observations.length, 3);
    }
  });
