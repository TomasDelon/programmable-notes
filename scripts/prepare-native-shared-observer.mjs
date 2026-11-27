/** Copy only public observer code; never expose the runner checkout or credentials. */
import assert from 'node:assert/strict';
import { constants } from 'node:fs';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import {
  chmod,
  lstat,
  mkdir,
  mkdtemp,
  open,
  realpath,
  rm,
  writeFile,
} from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const names = Object.freeze([
  'native-shared-editor.mjs',
  'native-webdriver-lib.mjs',
  'native-ui-lib.mjs',
  'native-dialog.py',
  'native-close-window.py',
]);
const maximumBytes = 256 * 1024;
async function canonicalDirectory(path) {
  const metadata = await lstat(path);
  assert(metadata.isDirectory() && !metadata.isSymbolicLink());
  assert.equal(await realpath(path), path);
}

async function copyExecutingNode(target) {
  // /proc/self/exe names this running, pinned Node image, not an arbitrary path.
  assert.equal(process.platform, 'linux');
  const image = await open('/proc/self/exe', constants.O_RDONLY);
  let output;
  try {
    const before = await image.stat();
    assert(
      before.isFile() && before.size >= 20 && before.size <= 256 * 1024 * 1024,
    );
    const header = Buffer.alloc(20);
    assert.equal((await image.read(header, 0, 20, 0)).bytesRead, 20);
    assert.equal(header.subarray(0, 4).toString('hex'), '7f454c46');
    assert.equal(header[4], 2); // ELF64
    assert.equal(header[5], 1); // little endian
    assert.equal(header.readUInt16LE(18), 62); // AMD64 hosted runner
    output = await open(
      target,
      constants.O_CREAT | constants.O_EXCL | constants.O_RDWR,
      0o700,
    );
    const sourceHash = createHash('sha256');
    const chunk = Buffer.alloc(64 * 1024);
    let copied = 0;
    while (copied < before.size) {
      const { bytesRead } = await image.read(
        chunk,
        0,
        Math.min(chunk.length, before.size - copied),
        copied,
      );
      assert(bytesRead > 0);
      const bytes = chunk.subarray(0, bytesRead);
      sourceHash.update(bytes);
      await output.writeFile(bytes);
      copied += bytesRead;
    }
    const after = await image.stat();
    assert.equal(after.size, before.size);
    assert.equal(after.mtimeMs, before.mtimeMs);
    assert.equal(after.ctimeMs, before.ctimeMs);
    await output.sync();
    assert.equal((await output.stat()).size, copied);
    const copyHash = createHash('sha256');
    let checked = 0;
    while (checked < copied) {
      const { bytesRead } = await output.read(
        chunk,
        0,
        Math.min(chunk.length, copied - checked),
        checked,
      );
      assert(bytesRead > 0);
      copyHash.update(chunk.subarray(0, bytesRead));
      checked += bytesRead;
    }
    assert.equal(copyHash.digest('hex'), sourceHash.digest('hex'));
  } finally {
    await output?.close();
    await image.close();
  }
  // Fresh byte-only creation has no copied xattrs/capabilities or set-ID bits.
  await chmod(target, 0o755);
  const version = execFileSync(target, ['--version'], {
    env: { PATH: '/usr/bin:/bin', LANG: 'C.UTF-8' },
    encoding: 'utf8',
    timeout: 5000,
    maxBuffer: 128,
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  assert.equal(version, `${process.version}\n`);
}

/** Caller owns the verified checkout; the eventual fresh role owns neither tree. */
export async function prepareNativeSharedObserver(source) {
  assert.equal(typeof source, 'string');
  assert.equal(resolve(source), source);
  await canonicalDirectory(source);
  await canonicalDirectory(join(source, 'scripts'));
  const files = [];
  // Read and validate all five inputs before creating any public output.
  for (const name of names) {
    const path = join(source, 'scripts', name);
    const metadata = await lstat(path);
    assert(metadata.isFile() && !metadata.isSymbolicLink());
    assert.equal(await realpath(path), path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW);
    try {
      const before = await handle.stat();
      assert(before.isFile() && before.size > 0 && before.size <= maximumBytes);
      assert.equal(before.ino, metadata.ino);
      assert.equal(before.dev, metadata.dev);
      const bytes = Buffer.alloc(maximumBytes + 1);
      let bytesRead = 0;
      while (bytesRead < bytes.length) {
        const read = await handle.read(
          bytes,
          bytesRead,
          bytes.length - bytesRead,
          bytesRead,
        );
        if (!read.bytesRead) break;
        bytesRead += read.bytesRead;
      }
      const after = await handle.stat();
      assert.equal(bytesRead, before.size);
      assert.equal(after.size, before.size);
      assert.equal(after.mtimeMs, before.mtimeMs);
      assert.equal(after.ctimeMs, before.ctimeMs);
      files.push([name, bytes.subarray(0, bytesRead)]);
    } finally {
      await handle.close();
    }
  }
  const destination = await mkdtemp('/tmp/pn-shared-observer-');
  try {
    await chmod(destination, 0o700);
    await mkdir(join(destination, 'scripts'), { mode: 0o700 });
    for (const [name, bytes] of files) {
      const target = join(destination, 'scripts', name);
      await writeFile(target, bytes, { flag: 'wx', mode: 0o644 });
      await chmod(target, 0o644);
    }
    await mkdir(join(destination, 'bin'), { mode: 0o700 });
    await copyExecutingNode(join(destination, 'bin', 'node'));
    await chmod(join(destination, 'bin'), 0o755);
    // Publish only after the complete immutable, dependency-free payload exists.
    await chmod(join(destination, 'scripts'), 0o755);
    await chmod(destination, 0o755);
    return destination;
  } catch (error) {
    await rm(destination, { recursive: true, force: true });
    throw error;
  }
}

if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  try {
    assert.equal(process.argv.length, 2);
    console.log(await prepareNativeSharedObserver(process.cwd()));
  } catch {
    console.error('NATIVE_SHARED_OBSERVER_REFUSED');
    process.exitCode = 1;
  }
}
