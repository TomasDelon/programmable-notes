/** Verify a declared source fork without altering registry checksums. */
import assert from 'node:assert/strict';
import { readFile, writeFile, mkdtemp, readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import process from 'node:process';
const expected =
  'a490119196d02a51d0871df7b9119a1f3e46d75b7e90053a801454d5c6b3491c';
const archive = process.env.WRY_UPSTREAM_ARCHIVE
  ? await readFile(process.env.WRY_UPSTREAM_ARCHIVE)
  : Buffer.from(
      await (
        await fetch('https://static.crates.io/crates/wry/wry-0.57.2.crate', {
          signal: AbortSignal.timeout(30000),
        })
      ).arrayBuffer(),
    );
assert.equal(
  createHash('sha256').update(archive).digest('hex'),
  expected,
  'Wrong upstream Wry archive',
);
const temp = await mkdtemp(join(tmpdir(), 'pn-wry-audit-'));
async function files(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const path = join(prefix, entry.name);
    assert.ok(
      entry.isDirectory() || entry.isFile(),
      'Unexpected symlink/special file',
    );
    if (entry.isDirectory()) result.push(...(await files(root, path)));
    else result.push(path);
  }
  return result.sort();
}
try {
  const tar = join(temp, 'upstream.crate');
  await writeFile(tar, archive);
  execFileSync('tar', ['-xzf', tar, '-C', temp]);
  const upstream = join(temp, 'wry-0.57.2'),
    fork = 'src-tauri/vendor/wry';
  const changed = [];
  for (const path of await files(upstream)) {
    if (path === 'Cargo.lock') continue;
    const [a, b] = await Promise.all([
      readFile(join(upstream, path)),
      readFile(join(fork, path)),
    ]);
    if (!a.equals(b)) changed.push(path);
  }
  assert.deepEqual(changed, [
    'src/webkitgtk/mod.rs',
    'src/webkitgtk/web_context.rs',
  ]);
  const original = await files(upstream);
  assert.deepEqual(
    (await files(fork)).filter((p) => !original.includes(p)),
    ['PROGRAMMABLE_NOTES_PATCH.md'],
  );
  console.log(
    'WRY_FORK_VERIFIED',
    JSON.stringify({
      version: '0.57.2',
      originalSha256: expected,
      changed,
      omitted: ['Cargo.lock'],
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
