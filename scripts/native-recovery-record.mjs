/** Independent external-witness reader for native-documents' immutable records. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { lstat, open, readdir, realpath } from 'node:fs/promises';
import { basename, join } from 'node:path';

const magic = Buffer.from('PNRECOVERY1\n');
const limit = 500000 + 2048;
const hex = (value, length) =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
function exactKeys(object, keys) {
  assert(
    object && typeof object === 'object' && !Array.isArray(object),
    'Recovery object required',
  );
  assert.deepEqual(
    Object.keys(object).sort(),
    [...keys].sort(),
    'Closed recovery fields',
  );
}
export function decodeRecoveryRecord(bytes, file) {
  assert(
    Buffer.isBuffer(bytes) && bytes.length <= limit,
    'Recovery record bounded',
  );
  assert(bytes.subarray(0, magic.length).equals(magic), 'Recovery magic');
  const split = bytes.indexOf(10, magic.length);
  assert(
    split >= magic.length && split - magic.length <= 2048,
    'Recovery header bounded',
  );
  const decoder = new TextDecoder('utf-8', { fatal: true, ignoreBOM: true });
  const encodedHeader = decoder.decode(bytes.subarray(magic.length, split));
  const header = JSON.parse(encodedHeader);
  exactKeys(header, ['metadata', 'digest']);
  const m = header.metadata;
  exactKeys(m, [
    'schema',
    'documentId',
    'name',
    'baseline',
    'parent',
    'generation',
    'createdAtMs',
    'sourceBytes',
  ]);
  // Native writers emit compact JSON. Reject duplicate-key or alternate-header
  // interpretations rather than accepting a differently parsed witness.
  assert.equal(
    JSON.stringify(header),
    encodedHeader,
    'Canonical recovery header',
  );
  assert.equal(m.schema, 1, 'Recovery schema');
  assert(hex(m.documentId, 32), 'Recovery document identity');
  assert.equal(typeof m.name, 'string', 'Recovery source name');
  const dot = m.name.lastIndexOf('.');
  assert(
    m.name.isWellFormed() &&
      Buffer.byteLength(m.name) <= 255 &&
      !m.name.includes('/') &&
      !m.name.includes('\\') &&
      [...m.name].every((character) => {
        const point = character.codePointAt(0);
        return point >= 32 && !(point >= 127 && point <= 159);
      }) &&
      dot > 0 &&
      ['md', 'mdx', 'js', 'jsx', 'ts', 'tsx'].includes(
        m.name.slice(dot + 1).toLowerCase(),
      ),
    'Recovery source name',
  );
  assert(m.baseline === null || hex(m.baseline, 64), 'Recovery baseline');
  assert(m.parent === null || hex(m.parent, 64), 'Recovery parent');
  assert(
    Number.isSafeInteger(m.generation) && m.generation > 0,
    'Recovery generation',
  );
  assert(
    Number.isSafeInteger(m.createdAtMs) && m.createdAtMs >= 0,
    'Recovery timestamp',
  );
  assert(
    Number.isSafeInteger(m.sourceBytes) &&
      m.sourceBytes >= 0 &&
      m.sourceBytes <= 500000,
    'Recovery source bound',
  );
  assert(hex(header.digest, 64), 'Recovery digest shape');
  assert.equal(
    file,
    `${m.documentId}-${String(m.generation).padStart(20, '0')}-${header.digest}.pnrec`,
    'Recovery filename binding',
  );
  const sourceBytes = bytes.subarray(split + 1);
  assert.equal(sourceBytes.length, m.sourceBytes, 'Recovery source byte count');
  const source = decoder.decode(sourceBytes);
  const canonicalMetadata = {
    schema: m.schema,
    documentId: m.documentId,
    name: m.name,
    baseline: m.baseline,
    parent: m.parent,
    generation: m.generation,
    createdAtMs: m.createdAtMs,
    sourceBytes: m.sourceBytes,
  };
  const digest = createHash('sha256')
    .update(magic)
    .update(JSON.stringify(canonicalMetadata))
    .update(Buffer.from([0]))
    .update(sourceBytes)
    .digest('hex');
  assert.equal(digest, header.digest, 'Recovery integrity');
  return { file, id: digest, metadata: canonicalMetadata, source };
}
export async function readPrivateRecoveryBytes(path) {
  const handle = await open(
    path,
    constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK,
  );
  try {
    const before = await handle.stat({ bigint: true });
    assert(
      before.isFile() &&
        before.uid === BigInt(process.getuid()) &&
        (before.nlink === 1n || before.nlink === 0n) &&
        (before.mode & 0o77n) === 0n &&
        before.size <= BigInt(limit),
      'Private bounded recovery record',
    );
    if (before.nlink === 0n) throw retiredRecord();
    const bytes = Buffer.alloc(Number(before.size) + 1);
    let count = 0;
    while (count < bytes.length) {
      const read = await handle.read(bytes, count, bytes.length - count, count);
      if (!read.bytesRead) break;
      count += read.bytesRead;
    }
    const after = await handle.stat({ bigint: true });
    assert.equal(count, Number(before.size), 'Stable recovery length');
    const change = classifyRecoveryReadChange(before, after);
    if (change === 'retired') throw retiredRecord();
    assert.equal(change, 'stable', 'Recovery record changed during read');
    return bytes.subarray(0, count);
  } finally {
    await handle.close();
  }
}

export async function readRecoveryRecord(path) {
  return decodeRecoveryRecord(
    await readPrivateRecoveryBytes(path),
    basename(path),
  );
}

function retiredRecord() {
  return Object.assign(
    new Error('Recovery record retired during observation'),
    { code: 'RECOVERY_RECORD_RETIRED' },
  );
}
export function classifyRecoveryReadChange(before, after) {
  if (
    ['dev', 'ino', 'uid', 'mode', 'size', 'mtimeNs'].some(
      (key) => before[key] !== after[key],
    )
  )
    return 'changed';
  if (before.nlink === 1n && after.nlink === 0n) return 'retired';
  if (
    before.nlink !== 1n ||
    after.nlink !== 1n ||
    before.ctimeNs !== after.ctimeNs
  )
    return 'changed';
  return 'stable';
}

/** Read-only admission/preservation guard. Never repairs or removes retained data. */
export async function guardRetainedRecoveryStore(
  store,
  { reservedRecords = 12, reservedBytes = 100000 } = {},
) {
  assert(
    Number.isSafeInteger(reservedRecords) &&
      reservedRecords > 0 &&
      reservedRecords <= 64,
  );
  assert(
    Number.isSafeInteger(reservedBytes) &&
      reservedBytes > 0 &&
      reservedBytes <= 8 * 1024 * 1024,
  );
  const directory = await lstat(store, { bigint: true });
  assert(
    directory.isDirectory() &&
      !directory.isSymbolicLink() &&
      directory.uid === BigInt(process.getuid()),
  );
  assert.equal(directory.mode & 0o777n, 0o700n);
  assert.equal(await realpath(store), store);
  const names = (await readdir(store)).sort();
  assert(names.length <= 65, 'Retained inventory bounded');
  const captured = new Map();
  const groups = new Map();
  const generations = new Set();
  let usedBytes = 0;
  let invalidRecords = 0;
  const metadata = (m) =>
    Object.fromEntries(
      [
        'dev',
        'ino',
        'uid',
        'gid',
        'mode',
        'nlink',
        'size',
        'mtimeNs',
        'ctimeNs',
      ].map((key) => [key, String(m[key])]),
    );
  async function inspect(name) {
    const path = join(store, name);
    const before = await lstat(path, { bigint: true });
    const bytes = await readPrivateRecoveryBytes(path);
    const after = await lstat(path, { bigint: true });
    assert.deepEqual(
      metadata(after),
      metadata(before),
      'Retained entry stable during read',
    );
    return {
      bytes,
      identity: metadata(after),
      sha256: createHash('sha256').update(bytes).digest('hex'),
    };
  }
  for (const name of names) {
    // Native writer cleanup may unlink these or migrate legacy source: refuse first.
    assert(
      name === '.lock' ||
        /^[a-f0-9]{32}-[0-9]{20}-[a-f0-9]{64}\.pnrec$/.test(name),
      'No retained maintenance entry may be admitted',
    );
    const entry = await inspect(name);
    usedBytes += entry.bytes.length;
    assert(usedBytes <= 8 * 1024 * 1024, 'Retained bytes bounded');
    captured.set(name, { identity: entry.identity, sha256: entry.sha256 });
    if (name === '.lock') continue;
    let record;
    try {
      record = decodeRecoveryRecord(entry.bytes, name);
    } catch {
      invalidRecords++;
      continue;
    } // Native code preserves invalid siblings.
    const id = record.metadata.documentId;
    groups.set(id, (groups.get(id) ?? 0) + 1);
    const generation = `${id}:${record.metadata.generation}`;
    assert(!generations.has(generation), 'No ambiguous retained generation');
    generations.add(generation);
  }
  assert(
    [...groups.values()].every((count) => count <= 5),
    'No retained version needs pruning',
  );
  assert(
    names.filter((name) => name !== '.lock').length + reservedRecords <= 64,
    'Record capacity without removing retained data',
  );
  assert(
    usedBytes + reservedBytes <= 8 * 1024 * 1024,
    'Byte capacity without removing retained data',
  );
  assert.deepEqual(
    (await readdir(store)).sort(),
    names,
    'Retained inventory stable before launch',
  );
  async function sameDirectory() {
    const current = await lstat(store, { bigint: true });
    assert.equal(await realpath(store), store);
    for (const key of ['dev', 'ino', 'uid', 'gid', 'mode'])
      assert.equal(
        current[key],
        directory[key],
        'Retained directory identity preserved',
      );
  }
  await sameDirectory();
  return Object.freeze({
    entries: captured.size,
    invalidRecords,
    usedBytes,
    async assertPreserved() {
      await sameDirectory();
      for (const [name, before] of captured) {
        const after = await inspect(name);
        assert.deepEqual(
          { identity: after.identity, sha256: after.sha256 },
          before,
          'Preexisting retained recovery entry unchanged',
        );
      }
      await sameDirectory();
    },
  });
}
