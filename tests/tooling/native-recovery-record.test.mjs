import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { chmod, mkdtemp, symlink, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import test from 'node:test';
import {
  decodeRecoveryRecord,
  readRecoveryRecord,
  readPrivateRecoveryBytes,
  classifyRecoveryReadChange,
} from '../../scripts/native-recovery-record.mjs';

const magic = Buffer.from('PNRECOVERY1\n');
const source =
  '\uFEFF# Recovery\r\n\nCafé 確定🌱\r\n{/* opaque */}\n<Unknown value={{n:1}} />';
function record(overrides = {}, text = source) {
  const metadata = {
    schema: 1,
    documentId: 'a'.repeat(32),
    name: 'primary.mdx',
    baseline: null,
    parent: null,
    generation: 1,
    createdAtMs: 1795872000000,
    sourceBytes: Buffer.byteLength(text),
    ...overrides,
  };
  const digest = createHash('sha256')
    .update(magic)
    .update(JSON.stringify(metadata))
    .update(Buffer.from([0]))
    .update(text)
    .digest('hex');
  const header = { metadata, digest };
  return {
    header,
    file: `${metadata.documentId}-${String(metadata.generation).padStart(20, '0')}-${digest}.pnrec`,
    bytes: Buffer.concat([
      magic,
      Buffer.from(JSON.stringify(header) + '\n'),
      Buffer.from(text),
    ]),
  };
}
test('verifies exact native format digest, filename, BOM and mixed Unicode source bytes', () => {
  const r = record();
  const decoded = decodeRecoveryRecord(r.bytes, r.file);
  assert.equal(decoded.source, source);
  assert.equal(decoded.id, r.header.digest);
  assert.deepEqual(decoded.metadata, r.header.metadata);
});
for (const [name, overrides] of [
  ['schema', { schema: 2 }],
  ['document identity', { documentId: '../outside' }],
  ['path name', { name: '../note.mdx' }],
  ['Unicode control name', { name: 'unsafe\u0085.mdx' }],
  ['unpaired surrogate name', { name: 'unsafe\ud800.mdx' }],
  ['unsupported extension', { name: 'note.bin' }],
  ['zero generation', { generation: 0 }],
  ['unsafe generation', { generation: Number.MAX_SAFE_INTEGER + 1 }],
  ['negative timestamp', { createdAtMs: -1 }],
  ['byte count', { sourceBytes: 1 }],
  ['oversize source', { sourceBytes: 500001 }],
  ['baseline', { baseline: 'invalid' }],
  ['parent', { parent: 'invalid' }],
  ['extra metadata', { unexpected: true }],
])
  test(`rejects integrity-signed invalid ${name}`, () => {
    const r = record(overrides);
    assert.throws(() => decodeRecoveryRecord(r.bytes, r.file));
  });
test('accepts non-control Unicode line separators in native-supported filenames', () => {
  const r = record({ name: 'notes\u2028.mdx' });
  assert.equal(
    decodeRecoveryRecord(r.bytes, r.file).metadata.name,
    'notes\u2028.mdx',
  );
});

test('rejects mutated bytes, digest and filename, unsupported header keys and invalid UTF8', () => {
  const r = record();
  const changed = Buffer.from(r.bytes);
  changed[changed.length - 1] ^= 1;
  assert.throws(() => decodeRecoveryRecord(changed, r.file));
  assert.throws(() => decodeRecoveryRecord(r.bytes, r.file.replace('a', 'b')));
  const wrong = Buffer.from(
    r.bytes.toString().replace(r.header.digest, 'f'.repeat(64)),
  );
  assert.throws(() => decodeRecoveryRecord(wrong, r.file));
  const extra = Buffer.concat([
    magic,
    Buffer.from(JSON.stringify({ ...r.header, unknown: true }) + '\n'),
    Buffer.from(source),
  ]);
  assert.throws(() => decodeRecoveryRecord(extra, r.file));
  const invalid = Buffer.from(r.bytes);
  invalid[invalid.length - 1] = 0xff;
  assert.throws(() => decodeRecoveryRecord(invalid, r.file));
});
test('rejects duplicate header keys and bounded format violations', () => {
  const r = record();
  const header = JSON.stringify(r.header).replace(
    '"metadata":',
    '"digest":"' + '0'.repeat(64) + '","metadata":',
  );
  assert.throws(() =>
    decodeRecoveryRecord(
      Buffer.concat([magic, Buffer.from(header + '\n' + source)]),
      r.file,
    ),
  );
  for (const bytes of [
    Buffer.alloc(0),
    Buffer.from('PNRECOVERY1\n{}'),
    Buffer.alloc(502049),
    Buffer.concat([magic, Buffer.from(' '.repeat(2049) + '\n')]),
  ])
    assert.throws(() => decodeRecoveryRecord(bytes, r.file));
});
test('descriptor reader accepts private immutable records and refuses exposed files and symlinks', async () => {
  const directory = await mkdtemp('/tmp/pn-record-control-');
  await chmod(directory, 0o700);
  const r = record(),
    file = join(directory, r.file);
  await writeFile(file, r.bytes, { mode: 0o600, flag: 'wx' });
  assert.equal((await readRecoveryRecord(file)).source, source);
  assert.deepEqual(await readPrivateRecoveryBytes(file), r.bytes);
  await chmod(file, 0o640);
  await assert.rejects(readRecoveryRecord(file));
  await chmod(file, 0o600);
  const links = await mkdtemp('/tmp/pn-record-link-control-');
  const alias = join(links, r.file);
  await symlink(file, alias);
  await assert.rejects(readRecoveryRecord(alias));
});

test('classifies only immutable descriptor retirement as a retryable observation', () => {
  const before = {
    dev: 1n,
    ino: 2n,
    uid: 3n,
    mode: 0o100600n,
    nlink: 1n,
    size: 10n,
    mtimeNs: 4n,
    ctimeNs: 5n,
  };
  assert.equal(classifyRecoveryReadChange(before, { ...before }), 'stable');
  assert.equal(
    classifyRecoveryReadChange(before, { ...before, nlink: 0n, ctimeNs: 6n }),
    'retired',
  );
  for (const changed of [
    { size: 11n },
    { mtimeNs: 6n },
    { uid: 4n },
    { mode: 0o100640n },
    { ino: 3n },
    { dev: 2n },
    { nlink: 2n },
    { ctimeNs: 6n },
  ]) {
    assert.equal(
      classifyRecoveryReadChange(before, { ...before, ...changed }),
      'changed',
    );
    if (!('nlink' in changed) && !('ctimeNs' in changed))
      assert.equal(
        classifyRecoveryReadChange(before, {
          ...before,
          nlink: 0n,
          ctimeNs: 7n,
          ...changed,
        }),
        'changed',
      );
  }
});
