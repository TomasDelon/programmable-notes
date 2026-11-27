// Real Store integration for the shared coordinator; synthetic /tmp data only.
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import {
  mkdtemp,
  mkdir,
  chmod,
  readFile,
  writeFile,
  stat,
  open,
  rm,
} from 'node:fs/promises';
import { createInterface } from 'node:readline';
import { resolve, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'esbuild';

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const negative = process.argv.includes('--negative-control');
assert(
  process.argv.slice(2).every((arg) => arg === '--negative-control'),
  'Unknown option',
);
assert.equal(process.platform, 'linux', 'NOT RUN: Linux is required');
const children = new Set();
function killGroup(child) {
  if (!child.pid) return;
  try {
    process.kill(-child.pid, 'SIGKILL');
  } catch (error) {
    if (error.code !== 'ESRCH') throw error;
  }
}
let fixture;
let scratch;
let originalHandle;
const deadline = setTimeout(() => {
  for (const child of children) killGroup(child);
  console.error('FAIL: native autosave exceeded 120 seconds');
  process.exitCode = 1;
}, 120_000);
function waitExit(child) {
  return new Promise((yes, no) => {
    child.once('error', no);
    child.once('exit', (code, signal) => {
      children.delete(child);
      if (code === 0) yes();
      else no(Error(`Child failed: code=${code} signal=${signal}`));
    });
  });
}
async function run(command, args) {
  const child = spawn(command, args, {
    cwd: repo,
    env: process.env,
    stdio: 'inherit',
    detached: true,
  });
  children.add(child);
  await waitExit(child);
}
async function writer(binary) {
  const child = spawn(binary, [], {
    cwd: repo,
    env: { ...process.env, PN_AUTOSAVE_TEST_ROOT: fixture },
    stdio: ['pipe', 'pipe', 'inherit'],
    detached: true,
  });
  children.add(child);
  const exited = waitExit(child);
  // Keep exit failure handled while a request is pending.
  exited.catch(() => {});
  const lines = createInterface({ input: child.stdout })[
    Symbol.asyncIterator
  ]();
  async function read() {
    let timer;
    try {
      const line = await Promise.race([
        lines.next(),
        new Promise((_, reject) => {
          timer = setTimeout(
            () => reject(Error('Writer reply timeout')),
            10_000,
          );
        }),
      ]);
      assert(!line.done, 'Writer exited without reply');
      return JSON.parse(line.value);
    } finally {
      clearTimeout(timer);
    }
  }
  const document = await read();
  return {
    document,
    async request(input) {
      child.stdin.write(`${JSON.stringify(input)}\n`);
      return read();
    },
    async stop() {
      child.stdin.end();
      await exited;
    },
  };
}

try {
  await run(process.env.CARGO ?? 'cargo', [
    'build',
    '--locked',
    '--manifest-path',
    'native-documents/Cargo.toml',
    '--example',
    'autosave-writer',
  ]);
  const binary = resolve(
    process.env.CARGO_TARGET_DIR ?? resolve(repo, 'native-documents/target'),
    'debug/examples/autosave-writer',
  );
  await mkdir(resolve(repo, '.cache'), { recursive: true });
  scratch = await mkdtemp(resolve(repo, '.cache/autosave-'));
  await build({
    entryPoints: [resolve(repo, 'src/application/autosave.ts')],
    outfile: resolve(scratch, 'autosave.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { AutosaveCoordinator } = await import(
    pathToFileURL(resolve(scratch, 'autosave.mjs'))
  );
  fixture = await mkdtemp('/tmp/pn-autosave-');
  await chmod(fixture, 0o700);
  const note = resolve(fixture, 'note.mdx');
  const original =
    '\uFEFFimport React from "react"\r\n\r\n{/* opaque 😀 */}\n<Component value={{ text: "Café" }} />\r\n# Initial\r\n';
  await writeFile(note, original, { mode: 0o640 });
  await chmod(note, 0o640);
  let backend = await writer(binary);
  assert.equal(backend.document.source, original);
  const initialRevision = backend.document.revision;
  const grant = backend.document.id;
  let writes = 0;
  const queue = new AutosaveCoordinator(async (input) => {
    writes++;
    const receipt = await backend.request(input);
    if (!receipt.ok) throw Error(receipt.error);
    return receipt;
  });
  queue.attach({
    documentId: grant,
    editorRevision: 0,
    source: original,
    diskRevision: initialRevision,
  });
  // Keep the original inode alive so two replacements cannot reuse its number.
  originalHandle = await open(note, 'r');
  const inode = (await originalHandle.stat()).ino;
  const one = original.replace('# Initial', '# Première');
  const newest = `${one}$unfinished\r\n<Broken\n`;
  const acceptedAt = performance.now();
  if (!negative) {
    queue.accept({ documentId: grant, editorRevision: 1, source: one });
    // Let the actual Store request begin, then accept newer source while IPC waits.
    await Promise.resolve();
    queue.accept({
      documentId: grant,
      editorRevision: 2,
      source: `${one}superseded\n`,
    });
    queue.accept({ documentId: grant, editorRevision: 3, source: newest });
  }
  // Observation happens before flush: accepted edits schedule persistence themselves.
  const until = Date.now() + 5000;
  while (
    !Buffer.from(newest).equals(await readFile(note)) &&
    Date.now() < until
  )
    await new Promise((yes) => setTimeout(yes, 10));
  assert.deepEqual(
    await readFile(note),
    Buffer.from(newest),
    'Accepted source must automatically reach the real file',
  );
  console.log(
    `OBSERVATION: accepted snapshot to observed file ${Math.round(performance.now() - acceptedAt)} ms (backend harness, not GUI latency)`,
  );
  await queue.flush();
  assert.equal(
    writes,
    2,
    'In-flight first snapshot and newest pending snapshot only',
  );
  assert.equal(queue.state(grant).persisted.editorRevision, 3);
  assert.notEqual(
    (await stat(note)).ino,
    inode,
    'Store must atomically replace the inode',
  );
  assert.deepEqual(await originalHandle.readFile(), Buffer.from(original));
  await originalHandle.close();
  originalHandle = undefined;
  assert.equal((await stat(note)).mode & 0o777, 0o640);
  for (const [revision, source] of [
    [4, one],
    [5, newest],
  ]) {
    queue.accept({ documentId: grant, editorRevision: revision, source });
    await queue.flush();
    assert.deepEqual(await readFile(note), Buffer.from(source));
    assert.equal((await stat(note)).mode & 0o777, 0o640);
  }
  for (const [input, expectedError] of [
    [
      {
        documentId: 'forged-grant',
        expectedDiskRevision: initialRevision,
        source: 'unsafe',
      },
      /Unknown document authorization/,
    ],
    [
      {
        documentId: grant,
        expectedDiskRevision: initialRevision,
        source: 'unsafe',
      },
      /Stale document revision/,
    ],
  ]) {
    const denied = await backend.request(input);
    assert.equal(denied.ok, false);
    assert.match(denied.error, expectedError);
  }
  assert.deepEqual(await readFile(note), Buffer.from(newest));
  queue.release(grant);
  await backend.stop();
  backend = await writer(binary);
  assert.equal(
    backend.document.source,
    newest,
    'Restart must reopen actual persisted bytes',
  );
  assert.notEqual(backend.document.id, grant);
  const reopened = backend.document;
  const conflictQueue = new AutosaveCoordinator(async (input) => {
    const receipt = await backend.request(input);
    if (!receipt.ok) throw Error(receipt.error);
    return receipt;
  });
  conflictQueue.attach({
    documentId: reopened.id,
    editorRevision: 0,
    source: newest,
    diskRevision: reopened.revision,
  });
  const external = `${original}Independent external writer\r\n`;
  await writeFile(note, external);
  conflictQueue.accept({
    documentId: reopened.id,
    editorRevision: 1,
    source: 'local first',
  });
  await assert.rejects(conflictQueue.flush());
  conflictQueue.accept({
    documentId: reopened.id,
    editorRevision: 2,
    source: 'local latest retained',
  });
  await assert.rejects(conflictQueue.flush());
  assert.equal(
    conflictQueue.state(reopened.id).latest.source,
    'local latest retained',
  );
  assert.equal(conflictQueue.state(reopened.id).status, 'blocked');
  assert.throws(() => conflictQueue.release(reopened.id));
  conflictQueue.retry(reopened.id);
  await assert.rejects(conflictQueue.flush());
  assert.deepEqual(await readFile(note), Buffer.from(external));
  assert.equal((await stat(note)).mode & 0o777, 0o640);
  await backend.stop();
  backend = await writer(binary);
  const uncertain = backend.document;
  assert.equal(uncertain.source, external);
  let lostReply = true;
  let uncertainWrites = 0;
  const uncertainQueue = new AutosaveCoordinator(async (input) => {
    uncertainWrites++;
    const receipt = await backend.request(input);
    if (!receipt.ok) throw Error(receipt.error);
    if (lostReply) {
      lostReply = false;
      // External-only fault: Store has really published before transport fails.
      throw Error(
        'Synthetic lost IPC acknowledgement after actual publication',
      );
    }
    return receipt;
  });
  uncertainQueue.attach({
    documentId: uncertain.id,
    editorRevision: 0,
    source: external,
    diskRevision: uncertain.revision,
  });
  const publishedWithoutAck = `${external}Published before reply loss 😀\r\n`;
  uncertainQueue.accept({
    documentId: uncertain.id,
    editorRevision: 1,
    source: publishedWithoutAck,
  });
  await assert.rejects(uncertainQueue.flush());
  assert.match(
    String(uncertainQueue.state(uncertain.id).error),
    /Synthetic lost IPC acknowledgement/,
  );
  assert.deepEqual(await readFile(note), Buffer.from(publishedWithoutAck));
  uncertainQueue.accept({
    documentId: uncertain.id,
    editorRevision: 2,
    source: external,
  });
  uncertainQueue.retry(uncertain.id);
  await assert.rejects(uncertainQueue.flush());
  const unresolved = uncertainQueue.state(uncertain.id);
  assert.equal(
    uncertainWrites,
    2,
    'Undo must check real disk CAS after reply loss',
  );
  assert.equal(unresolved.status, 'blocked');
  assert.equal(unresolved.latest.source, external);
  assert.equal(unresolved.persisted.editorRevision, 0);
  assert.equal(unresolved.diskRevision, uncertain.revision);
  assert.match(String(unresolved.error), /Stale document revision/);
  assert.throws(() => uncertainQueue.release(uncertain.id));
  assert.deepEqual(await readFile(note), Buffer.from(publishedWithoutAck));
  assert.equal((await stat(note)).mode & 0o777, 0o640);
  await backend.stop();
  // Separate real-file witness for the shared controller and its private binding.
  // Existing coordinator, collision, restart and negative-control cases above stay intact.
  await build({
    entryPoints: [resolve(repo, 'src/documents/nativeSessions.ts')],
    outfile: resolve(scratch, 'native-sessions.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { createNativeSessions } = await import(
    pathToFileURL(resolve(scratch, 'native-sessions.mjs'))
  );
  backend = await writer(binary);
  const controllerGrant = backend.document;
  const binding = createNativeSessions({
    save: async (id, revision, source) => {
      const receipt = await backend.request({
        documentId: id,
        expectedDiskRevision: revision,
        source,
      });
      if (!receipt.ok) throw Error(receipt.error);
      return { revision: receipt.diskRevision, durable: receipt.durable };
    },
    close: async (id) => {
      const receipt = await backend.request({
        action: 'close',
        documentId: id,
      });
      if (!receipt.ok) throw Error(receipt.error);
    },
  });
  const controllerSession = binding.attach(
    'host-controller-1',
    controllerGrant,
  );
  const controllerSource =
    '\uFEFFimport React from "react"\r\n{/* opaque 😀 */}\n<Component value={{ text: "Café" }} />\r\n# Controller\r\n$unfinished\r\n<Broken';
  controllerSession.publish({
    expected: controllerSession.witness,
    source: controllerSource,
  });
  const controllerDeadline = Date.now() + 5000;
  while (
    !Buffer.from(controllerSource).equals(await readFile(note)) &&
    Date.now() < controllerDeadline
  )
    await new Promise((yes) => setTimeout(yes, 10));
  assert.deepEqual(
    await readFile(note),
    Buffer.from(controllerSource),
    'Controller publication must automatically reach the real file before flush',
  );
  await binding.controller.flush();
  const controllerState = binding.controller.state('host-controller-1');
  assert.equal(controllerState.autosave.documentId, 'host-controller-1');
  assert(
    !JSON.stringify(controllerState).includes(controllerGrant.id),
    'Controller state must not expose native grants',
  );
  await binding.controller.close('host-controller-1');
  assert.throws(() => binding.controller.state('host-controller-1'));
  assert.equal(
    (
      await backend.request({
        documentId: controllerGrant.id,
        expectedDiskRevision: controllerState.autosave.diskRevision,
        source: 'closed grant must not write',
      })
    ).ok,
    false,
  );
  assert.equal(
    (await backend.request({ action: 'open', path: '../outside.mdx' })).ok,
    false,
    'External harness control protocol must not accept an open path',
  );
  const controllerOpened = await backend.request({ action: 'open' });
  assert.equal(controllerOpened.ok, true);
  assert.equal(controllerOpened.document.source, controllerSource);
  assert.notEqual(controllerOpened.document.id, controllerGrant.id);
  const controllerReopened = binding.attach(
    'host-controller-2',
    controllerOpened.document,
  );
  const controllerExternal = `${controllerSource}\r\nExternal controller conflict\r\n`;
  await writeFile(note, controllerExternal);
  controllerReopened.publish({
    expected: controllerReopened.witness,
    source: `${controllerSource}\r\nLocal first`,
  });
  await assert.rejects(binding.controller.flush('host-controller-2'));
  const controllerLatest = `${controllerSource}\r\nLocal latest retained`;
  controllerReopened.publish({
    expected: controllerReopened.witness,
    source: controllerLatest,
  });
  await assert.rejects(binding.controller.flush('host-controller-2'));
  await assert.rejects(binding.controller.close('host-controller-2'));
  assert.equal(
    binding.controller.state('host-controller-2').witness.source,
    controllerLatest,
  );
  assert.equal(binding.controller.state('host-controller-2').phase, 'open');
  assert.deepEqual(await readFile(note), Buffer.from(controllerExternal));
  assert.equal((await stat(note)).mode & 0o777, 0o640);
  await backend.stop();
  console.log(
    'PASS: shared controller automatic real-file publication, private grant binding, close/reopen and external conflict retention',
  );
  // Application use cases around a real Store. Chooser/index are synthetic
  // trusted ports: this is not OS-dialog, native GUI or create-file acceptance.
  await build({
    entryPoints: [resolve(repo, 'src/application/nativeWorkspace.ts')],
    outfile: resolve(scratch, 'native-workspace.mjs'),
    bundle: true,
    platform: 'node',
    format: 'esm',
  });
  const { createNativeWorkspace } = await import(
    pathToFileURL(resolve(scratch, 'native-workspace.mjs'))
  );
  backend = await writer(binary);
  // Release the helper's initial grant so every workspace grant comes from open.
  assert.equal(
    (
      await backend.request({
        action: 'close',
        documentId: backend.document.id,
      })
    ).ok,
    true,
  );
  let sequence = 0;
  let workspaceGrant;
  let workspaceDiskRevision;
  const workspace = createNativeWorkspace(
    {
      chooseVault: async () => ({
        vaultId: 'fixture-vault',
        displayPath: 'Synthetic fixture',
      }),
      vaultInventory: async (vaultId) => ({
        vaultId,
        entries: [{ logicalPath: 'note.mdx', bytes: (await stat(note)).size }],
      }),
      openVaultSources: async (vaultId, paths) => {
        assert.deepEqual(paths, ['note.mdx']);
        const receipt = await backend.request({ action: 'open' });
        assert.equal(receipt.ok, true);
        workspaceGrant = receipt.document.id;
        workspaceDiskRevision = receipt.document.revision;
        return { vaultId, documents: [receipt.document] };
      },
      createVaultSource: async () => {
        throw Error('Not exercised by this fixture');
      },
      save: async (id, revision, source) => {
        const receipt = await backend.request({
          documentId: id,
          expectedDiskRevision: revision,
          source,
        });
        if (!receipt.ok) throw Error(receipt.error);
        workspaceDiskRevision = receipt.diskRevision;
        return { revision: receipt.diskRevision, durable: receipt.durable };
      },
      close: async (documentId) => {
        const receipt = await backend.request({ action: 'close', documentId });
        if (!receipt.ok) throw Error(receipt.error);
      },
    },
    () => `workspace-${++sequence}`,
  );
  await workspace.choose();
  const workspaceId = await workspace.open('note.mdx');
  const workspaceSession = workspace.session(workspaceId);
  const workspaceSource = `${controllerSource}\r\n# Workspace 😀\r\n`;
  workspaceSession.publish({
    expected: workspaceSession.witness,
    source: workspaceSource,
  });
  const workspaceDeadline = Date.now() + 5000;
  while (
    !Buffer.from(workspaceSource).equals(await readFile(note)) &&
    Date.now() < workspaceDeadline
  )
    await new Promise((yes) => setTimeout(yes, 10));
  assert.deepEqual(
    await readFile(note),
    Buffer.from(workspaceSource),
    'Workspace accepted edits reach disk before explicit flush',
  );
  await workspace.controller.flush();
  const closedWorkspaceGrant = workspaceGrant;
  const closedWorkspaceRevision = workspaceDiskRevision;
  await workspace.close(workspaceId);
  assert.equal(workspace.state().sessions.length, 0);
  const revoked = await backend.request({
    documentId: closedWorkspaceGrant,
    expectedDiskRevision: closedWorkspaceRevision,
    source: 'A closed workspace grant must not write',
  });
  assert.equal(
    revoked.ok,
    false,
    'Workspace close must retire the real native grant',
  );
  assert.match(revoked.error, /Unknown document authorization/);
  assert.deepEqual(await readFile(note), Buffer.from(workspaceSource));
  const reopenedWorkspaceId = await workspace.open('note.mdx');
  assert.notEqual(reopenedWorkspaceId, workspaceId);
  assert.notEqual(workspaceGrant, closedWorkspaceGrant);
  const workspaceReopened = workspace.session(reopenedWorkspaceId);
  assert.equal(workspaceReopened.witness.source, workspaceSource);
  const workspaceExternal = `${workspaceSource}Independent disk edit\r\n`;
  await writeFile(note, workspaceExternal);
  const workspaceLocal = `${workspaceSource}Local retained edit\r\n`;
  workspaceReopened.publish({
    expected: workspaceReopened.witness,
    source: workspaceLocal,
  });
  await assert.rejects(workspace.controller.flush());
  await assert.rejects(workspace.close(reopenedWorkspaceId));
  assert.equal(
    workspace.session(reopenedWorkspaceId).witness.source,
    workspaceLocal,
  );
  assert.equal(workspace.state().sessions.length, 1);
  assert.deepEqual(await readFile(note), Buffer.from(workspaceExternal));
  assert.equal((await stat(note)).mode & 0o777, 0o640);
  await backend.stop();
  console.log(
    'PASS: native workspace selective open, automatic exact-byte real-file writes, close/reopen and external-conflict retention (synthetic chooser/index; no GUI/create claim)',
  );
  console.log(
    'PASS: real Store autosave, coalescing, exact bytes, undo/redo, grants, permissions, restart, external conflict and lost-acknowledgement CAS',
  );
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  clearTimeout(deadline);
  for (const child of children) killGroup(child);
  // Wait for killed children before removing their private fixture.
  await Promise.all(
    [...children].map(
      (child) => new Promise((yes) => child.once('close', yes)),
    ),
  );
  await originalHandle?.close();
  if (fixture) await rm(fixture, { recursive: true, force: true });
  if (scratch) await rm(scratch, { recursive: true, force: true });
}
