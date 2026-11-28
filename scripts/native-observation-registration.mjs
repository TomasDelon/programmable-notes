/** Narrow real registered-IPC witness; no authored payload, service or workload. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { lstat, readFile, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  verifyEditorObservationCommands,
  verifyPreviewObservationCommands,
} from './native-observation-controls.mjs';
import { guardRetainedRecoveryStore } from './native-recovery-record.mjs';

export async function runObservationRegistration(ports) {
  let sessionsClosed = 0;
  for (const preview of [false, true]) {
    try {
      await ports.launch([preview ? '--security-probe' : '--security-editor']);
      const role = await ports.invoke('host_probe');
      if (preview) {
        assert.equal(role.ok, false);
        assert.equal(typeof role.error, 'string');
        assert.match(
          role.error,
          /not allowed|not permitted|denied|no host capabilities/i,
        );
        await verifyPreviewObservationCommands(ports.invoke);
      } else {
        assert.deepEqual(role, { ok: true, value: 'editor-host-only' });
        await verifyEditorObservationCommands(ports.invoke);
      }
    } finally {
      await ports.close();
      sessionsClosed++;
    }
  }
  return { editorCommands: 4, previewDenials: 4, sessionsClosed };
}

async function main() {
  assert.equal(process.argv.length, 2);
  assert.equal(process.getuid(), 1001);
  assert.equal(process.geteuid(), 1001);
  assert.equal(process.env.HOME, '/home/pn-local-20261128');
  assert.equal(process.env.NATIVE_DISPOSABLE_PROFILE, '1');
  assert.equal(process.env.NATIVE_SHARED_JOURNEY, 'registration');
  const payload = dirname(dirname(process.execPath));
  assert.match(payload, /^\/tmp\/pn-shared-observer-[A-Za-z0-9]{6}$/);
  const binary = join(payload, 'bin/registration-app');
  const metadata = await lstat(binary);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.uid === 1000 &&
      metadata.nlink === 1 &&
      !(metadata.mode & 0o6022),
  );
  const output = resolve(
    dirname(process.env.NATIVE_SHARED_EVIDENCE),
    'native-observation-registration.json',
  );
  assert.match(
    output,
    /^\/home\/pn-local-20261128\/evidence-[A-Za-z0-9]{6}\/native-observation-registration\.json$/,
  );
  const retained = await guardRetainedRecoveryStore(
    join(process.env.HOME, '.local/share/dev.programmablenotes.app/recovery'),
  );
  const result = {
    schema: 1,
    result: 'failed',
    failure: 'unfinished',
    diagnosticBinarySha256: createHash('sha256')
      .update(await readFile(binary))
      .digest('hex'),
    editorCommands: 0,
    previewDenials: 0,
    sessionsClosed: 0,
    retainedEntries: retained.entries,
    retainedPreserved: false,
    scope:
      'Test-feature empty-shell registered editor/preview IPC; no authored code, process isolation or production runtime acceptance',
  };
  let protocol;
  try {
    process.env.NATIVE_BINARY = binary;
    protocol = await import('./native-webdriver-lib.mjs');
    await protocol.preflight();
    Object.assign(result, await runObservationRegistration(protocol));
    result.result = 'passed';
    result.failure = 'none';
  } catch {
    result.failure = 'registered-ipc-or-driver';
    process.exitCode = 1;
  } finally {
    try {
      await protocol?.close();
    } catch {
      result.result = 'failed';
      result.failure = 'driver-close';
      process.exitCode = 1;
    }
    try {
      await retained.assertPreserved();
      result.retainedPreserved = true;
    } catch {
      result.result = 'failed';
      result.failure = 'retained-data';
      process.exitCode = 1;
    }
    await writeFile(output, JSON.stringify(result, null, 2) + '\n', {
      flag: 'wx',
      mode: 0o600,
    });
  }
  console.log(
    result.result === 'passed'
      ? 'NATIVE_OBSERVATION_REGISTRATION_PASS'
      : 'NATIVE_OBSERVATION_REGISTRATION_FAILED',
  );
}
if (
  process.argv[1] &&
  resolve(process.argv[1]) === fileURLToPath(import.meta.url)
) {
  await main().catch(() => {
    console.error('NATIVE_OBSERVATION_REGISTRATION_REFUSED');
    process.exitCode = 1;
  });
}
