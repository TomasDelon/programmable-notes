/** Read-only guard for destructive disk-full tests, never application authority. */
import assert from 'node:assert/strict';
import { lstat, realpath, readFile, readdir, statfs } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import process from 'node:process';

export async function assertEmptySmallTmpfs(root) {
  assert.equal(
    process.platform,
    'linux',
    'Disposable tmpfs tests require Linux',
  );
  assert.ok(
    typeof root === 'string' && root === resolve(root),
    'Explicit absolute disposable mountpoint required',
  );
  assert.ok((await realpath(root)) === root, 'Canonical mountpoint required');
  const metadata = await lstat(root, { bigint: true });
  assert.ok(metadata.isDirectory() && !metadata.isSymbolicLink());
  assert.ok(
    metadata.uid === BigInt(process.getuid()) &&
      (metadata.mode & 0o077n) === 0n,
    'Owned private mountpoint required',
  );
  const encoded = root
    .replaceAll('\\', '\\134')
    .replaceAll(' ', '\\040')
    .replaceAll('\t', '\\011')
    .replaceAll('\n', '\\012');
  const mounts = (await readFile('/proc/self/mountinfo', 'utf8'))
    .trim()
    .split('\n')
    .map((line) => line.split(' '))
    .filter((fields) => fields[4] === encoded);
  assert.ok(
    mounts.length === 1 &&
      mounts[0][3] === '/' &&
      mounts[0][mounts[0].indexOf('-') + 1] === 'tmpfs',
    'Dedicated whole-filesystem tmpfs mount required; shared subtrees refused',
  );
  assert.ok(
    metadata.dev !== (await lstat(dirname(root), { bigint: true })).dev,
    'Pass the mountpoint itself',
  );
  const info = await statfs(root, { bigint: true });
  const bytes = info.blocks * info.bsize;
  assert.ok(
    info.type === 0x1021994n &&
      bytes >= 1024n * 1024n &&
      bytes <= 4n * 1024n * 1024n,
    'Dedicated 1–4 MB tmpfs required',
  );
  assert.equal(
    (await readdir(root)).length,
    0,
    'Disposable mount must be empty',
  );
  return Number(bytes);
}
