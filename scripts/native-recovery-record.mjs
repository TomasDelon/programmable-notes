/** Independent external-witness reader for native-documents' immutable records. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { constants } from 'node:fs';
import { open } from 'node:fs/promises';
import { basename } from 'node:path';

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
