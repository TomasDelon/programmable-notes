/** Real WebKit download callback test; separate from packaged-MDX sandbox tests. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { spawn } from 'node:child_process';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { readFile, lstat, readdir, unlink, writeFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { homedir } from 'node:os';
import { fileURLToPath } from 'node:url';
import process from 'node:process';
assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
assert.ok(process.env.NATIVE_DOWNLOAD_PROBE);
assert.ok(process.env.NATIVE_EVIDENCE_DIR);
assert.ok(process.env.DISPLAY || process.env.WAYLAND_DISPLAY);
const executable = resolve(process.env.NATIVE_DOWNLOAD_PROBE);
const omitDenial = process.argv.includes('--without-deny-handler');
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const report = {
  scope:
    'Native WebKit/Tauri callback harness, not production MDX escape evidence',
  executableSha256: hash(await readFile(executable)),
  observerSha256: hash(await readFile(new URL(import.meta.url))),
  cases: [],
};
const output = join(process.env.NATIVE_EVIDENCE_DIR, 'downloads.json');
await writeFile(output, '{}\n', { flag: 'wx' });
const server = createServer();
let current;
server.on('request', (req, res) => {
  if (req.url !== '/' + current.name) {
    res.writeHead(404).end();
    return;
  }
  current.requests++;
  res.writeHead(200, {
    'content-type': 'application/octet-stream',
    'content-disposition': `attachment; filename="${current.name}"`,
    'content-length': current.bytes.length,
    'cache-control': 'no-store',
  });
  res.end(current.bytes);
});
server.listen(0, '127.0.0.1');
await once(server, 'listening');
let failure;
try {
  for (const mode of ['default', 'deny']) {
    const name = `pn-download-${randomUUID()}.txt`;
    current = {
      name,
      bytes: Buffer.from(`Synthetic native download ${name}\n`),
      requests: 0,
    };
    const helperMode = mode === 'deny' && omitDenial ? 'default' : mode;
    const row = { mode, helperMode, name, outcome: 'incomplete' };
    report.cases.push(row);
    const url = `http://127.0.0.1:${server.address().port}/${name}`;
    const child = spawn(executable, [url, helperMode], {
      env: process.env,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    let stdout = '',
      stderr = '';
    child.stdout.on('data', (chunk) => {
      stdout += chunk;
    });
    child.stderr.on('data', (chunk) => {
      stderr += chunk;
    });
    const timer = setTimeout(() => child.kill('SIGKILL'), 25000);
    try {
      const [code, signal] = await once(child, 'close');
      Object.assign(row, {
        code,
        signal,
        stdout,
        stderr,
        requests: current.requests,
      });
      assert.equal(code, 0, `download harness failed: ${stderr}`);
      assert.equal(signal, null);
      assert.equal(
        current.requests,
        1,
        'The actual download must reach the synthetic server',
      );
      const resultLine = stdout
        .split('\n')
        .find((line) => line.startsWith('DOWNLOAD_RESULT '));
      assert.ok(resultLine, 'No native completion event');
      const result = JSON.parse(resultLine.slice('DOWNLOAD_RESULT '.length));
      row.nativeResult = result;
      if (result.destination) {
        const path = result.destination.startsWith('file:')
          ? fileURLToPath(result.destination)
          : result.destination;
        assert.equal(path, resolve(path));
        assert.equal(
          join(dirname(path), name),
          path,
          'Unexpected download filename',
        );
        assert.ok(
          [homedir(), join(homedir(), 'Downloads'), process.cwd()].includes(
            dirname(path),
          ),
          'Unexpected download directory',
        );
        const info = await lstat(path);
        assert.equal(info.isFile(), true);
        assert.equal(info.nlink, 1);
        assert.equal(info.uid, process.getuid());
        const bytes = await readFile(path);
        assert.deepEqual(
          bytes,
          current.bytes,
          'Positive control did not write exact canary bytes',
        );
        row.writtenSha256 = hash(bytes);
        row.writtenBytes = bytes.length;
        // Only this unpredictable test-created, checked file is removed.
        await unlink(path);
        row.canaryRemoved = true;
      }
      if (mode === 'default') {
        assert.ok(result.destination, 'Positive control has no destination');
      } else {
        assert.match(
          stderr,
          /DOWNLOAD_DENIED/,
          'The production callback did not receive/reject this request',
        );
        assert.equal(
          result.destination,
          null,
          'Denied download has a destination',
        );
        assert.match(
          stderr,
          /DOWNLOAD_FAILED/,
          'Cancellation did not produce a native failure event',
        );
        for (const dir of new Set([
          homedir(),
          join(homedir(), 'Downloads'),
          process.cwd(),
        ])) {
          let names;
          try {
            names = await readdir(dir);
          } catch (error) {
            if (error.code === 'ENOENT') continue;
            throw error;
          }
          assert.deepEqual(
            names.filter((entry) => entry.startsWith(name.slice(0, -4))),
            [],
            'Denied request left a canary file',
          );
        }
      }
      row.outcome = 'pass';
    } catch (error) {
      row.outcome = 'fail';
      row.error = String(error);
      throw error;
    } finally {
      clearTimeout(timer);
    }
  }
} catch (error) {
  failure = error;
} finally {
  server.closeAllConnections();
  await new Promise((resolve) => server.close(resolve));
  report.outcome = failure ? 'fail' : 'pass';
  await writeFile(output, JSON.stringify(report, null, 2) + '\n');
  console.log('NATIVE_DOWNLOAD_EVIDENCE', output);
}
if (failure) throw failure;
console.log(
  'PASS native default download positive control and explicit preview callback denial',
);
