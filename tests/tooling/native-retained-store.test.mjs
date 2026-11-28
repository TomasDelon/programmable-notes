import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, readFile, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import { guardRetainedRecoveryStore } from '../../scripts/native-recovery-record.mjs';

async function store() {
  const path = await mkdtemp('/tmp/pn-retained-guard-');
  await chmod(path, 0o700);
  await writeFile(join(path, '.lock'), '', { flag: 'wx', mode: 0o600 });
  return path;
}
function record(generation) {
  const source = 'Synthetic retained source.';
  const metadata = {
    schema: 1,
    documentId: 'a'.repeat(32),
    name: 'note.md',
    baseline: null,
    parent: null,
    generation,
    createdAtMs: 1,
    sourceBytes: Buffer.byteLength(source),
  };
  const magic = Buffer.from('PNRECOVERY1\n');
  const digest = createHash('sha256')
    .update(magic)
    .update(JSON.stringify(metadata))
    .update(Buffer.from([0]))
    .update(source)
    .digest('hex');
  return {
    file: `${metadata.documentId}-${String(generation).padStart(20, '0')}-${digest}.pnrec`,
    bytes: Buffer.concat([
      magic,
      Buffer.from(JSON.stringify({ metadata, digest }) + '\n' + source),
    ]),
  };
}

test('retained guard preserves valid and opaque invalid siblings and detects modification', async () => {
  const path = await store();
  const valid = record(1);
  const invalid = `${'b'.repeat(32)}-00000000000000000001-${'0'.repeat(64)}.pnrec`;
  await writeFile(join(path, valid.file), valid.bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  await writeFile(join(path, invalid), 'retained invalid sibling', {
    flag: 'wx',
    mode: 0o600,
  });
  const guard = await guardRetainedRecoveryStore(path);
  assert.equal(guard.entries, 3);
  assert.equal(guard.invalidRecords, 1);
  await guard.assertPreserved();
  await writeFile(join(path, invalid), 'modified');
  await assert.rejects(guard.assertPreserved());
  assert.deepEqual(await readFile(join(path, valid.file)), valid.bytes);
});

test('retained guard refuses pending maintenance and excess old versions without repair', async () => {
  const pendingStore = await store();
  const pending = join(pendingStore, '.pending-' + 'c'.repeat(32));
  await writeFile(pending, 'retain pending', { flag: 'wx', mode: 0o600 });
  await assert.rejects(guardRetainedRecoveryStore(pendingStore));
  assert.equal(await readFile(pending, 'utf8'), 'retain pending');
  const crowded = await store();
  for (let i = 1; i <= 6; i++) {
    const item = record(i);
    await writeFile(join(crowded, item.file), item.bytes, {
      flag: 'wx',
      mode: 0o600,
    });
  }
  await assert.rejects(guardRetainedRecoveryStore(crowded));
  assert.deepEqual(
    await readFile(join(crowded, record(1).file)),
    record(1).bytes,
  );
});

test('retained guard reserves capacity without deleting a valid existing record', async () => {
  const path = await store();
  const item = record(1);
  await writeFile(join(path, item.file), item.bytes, {
    flag: 'wx',
    mode: 0o600,
  });
  await assert.rejects(
    guardRetainedRecoveryStore(path, { reservedRecords: 64 }),
  );
  await assert.rejects(
    guardRetainedRecoveryStore(path, { reservedBytes: 8 * 1024 * 1024 }),
  );
  assert.deepEqual(await readFile(join(path, item.file)), item.bytes);
});
