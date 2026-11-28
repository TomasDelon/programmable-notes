/** Independent installed-app writer/witness. Never imported by application code. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import { constants } from 'node:fs';
import {
  chmod,
  lstat,
  open,
  readFile,
  realpath,
  rename,
  writeFile,
} from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { guardRetainedRecoveryStore } from './native-recovery-record.mjs';
const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');

async function scopedFile(fixture) {
  assert.match(fixture, /^\/tmp\/pn-native-shared-[A-Za-z0-9]{6}$/);
  const vault = join(fixture, 'vault');
  for (const path of [fixture, vault]) {
    const metadata = await lstat(path);
    assert(
      metadata.isDirectory() &&
        !metadata.isSymbolicLink() &&
        metadata.uid === process.getuid(),
    );
    assert.equal(metadata.mode & 0o777, 0o700);
    assert.equal(await realpath(path), path);
  }
  const file = join(vault, 'primary.mdx');
  const metadata = await lstat(file);
  assert(
    metadata.isFile() &&
      !metadata.isSymbolicLink() &&
      metadata.nlink === 1 &&
      metadata.uid === process.getuid(),
  );
  assert.equal(metadata.mode & 0o777, 0o640);
  return { file, metadata };
}

export async function publishExternalSource(fixture, expected, source, kind) {
  assert(['direct', 'rename'].includes(kind));
  assert.equal(typeof source, 'string');
  const bytes = Buffer.from(source);
  assert(bytes.length <= 500_000 && bytes.toString('utf8') === source);
  const { file, metadata } = await scopedFile(fixture);
  const before = await readFile(file);
  assert.deepEqual(
    before,
    Buffer.from(expected),
    'Independent writer captured exact current bytes',
  );
  if (kind === 'direct')
    assert.equal(
      bytes.length,
      before.length,
      'Direct witness uses one same-length overwrite',
    );
  let published;
  let publicationIdentity;
  if (kind === 'direct') {
    const handle = await open(file, constants.O_RDWR | constants.O_NOFOLLOW);
    try {
      const opened = await handle.stat();
      assert.equal(opened.ino, metadata.ino);
      assert.equal(opened.dev, metadata.dev);
      await handle.writeFile(bytes);
      await handle.sync();
      const identity = await handle.stat({ bigint: true });
      publicationIdentity = {
        dev: String(identity.dev),
        ino: String(identity.ino),
        mtimeNs: String(identity.mtimeNs),
      };
    } finally {
      await handle.close();
    }
    published = metadata;
  } else {
    const pending = join(fixture, 'vault', `.external-${randomUUID()}`);
    const handle = await open(
      pending,
      constants.O_WRONLY |
        constants.O_CREAT |
        constants.O_EXCL |
        constants.O_NOFOLLOW,
      0o640,
    );
    try {
      await handle.writeFile(bytes);
      await handle.chmod(0o640);
      await handle.sync();
      published = await handle.stat();
      const identity = await handle.stat({ bigint: true });
      publicationIdentity = {
        dev: String(identity.dev),
        ino: String(identity.ino),
        mtimeNs: String(identity.mtimeNs),
      };
    } finally {
      await handle.close();
    }
    assert.deepEqual(
      await readFile(file),
      before,
      'Original unchanged before independent rename',
    );
    await rename(pending, file);
  }
  const writeCompletedAtMs = performance.now();
  const after = (await scopedFile(fixture)).metadata;
  assert.equal(after.ino, published.ino);
  assert.equal(after.dev, published.dev);
  assert.deepEqual(await readFile(file), bytes);
  return {
    kind,
    sourceSha256: hash(bytes),
    mode: after.mode & 0o777,
    writeCompletedAtMs,
    publicationIdentity,
  };
}

/** Compare against the independent writer's descriptor identity, never a later baseline. */
export async function assertExternalPublication(fixture, source, publication) {
  const { file } = await scopedFile(fixture);
  const metadata = await lstat(file, { bigint: true });
  assert.equal(
    String(metadata.dev),
    publication.publicationIdentity.dev,
    'Independent publication device retained',
  );
  assert.equal(
    String(metadata.ino),
    publication.publicationIdentity.ino,
    'No app rewrite inode replacement after external publication',
  );
  assert.equal(
    String(metadata.mtimeNs),
    publication.publicationIdentity.mtimeNs,
    'No app rewrite modification after external publication',
  );
  assert.deepEqual(await readFile(file), Buffer.from(source));
}

/** Independent witness: background revisions must remain separate real Undo steps. */
export async function verifyBackgroundExternalHistory({
  fixture,
  base,
  previous,
  ctx,
  onProgress = () => {},
}) {
  const progress = {
    publications: 0,
    historyChecks: 0,
    direction: 'none',
    step: 0,
    expectedSourceSha256: null,
    actualDiskSha256: null,
    editor: null,
  };
  onProgress(progress);
  const other = '# Background witness\n';
  const one = base.replace('Writer editor', 'Background one');
  const two = one.replace('\r\n', '\n');
  const three = two.replace('Background one', 'Background three 🌱');
  assert.notEqual(one, base);
  assert.notEqual(two, one);
  assert.notEqual(three, two);
  ctx.setStage('external_background_open_navigation');
  await ctx.clickButton('Open navigation');
  ctx.setStage('external_background_open_other');
  await ctx.clickButton('Open other.mdx');
  await ctx.sourceShows(other);
  const observations = [];
  let expected = base,
    last;
  for (const source of [one, two, three]) {
    ctx.setStage('external_background_observation');
    last = await publishExternalSource(fixture, expected, source, 'rename');
    // Keep the other document selected through a full reconciliation interval.
    // The later exact Undo chain proves all three intermediate adoptions occurred.
    await ctx.pause(2500);
    await ctx.sourceShows(other);
    await assertExternalPublication(fixture, source, last);
    observations.push({ sourceSha256: last.sourceSha256, mode: last.mode });
    progress.publications++;
    onProgress(progress);
    expected = source;
  }
  await ctx.clickButton('Open primary.mdx');
  await ctx.sourceShows(three);
  await ctx.clickButton('Close navigation');
  await assertExternalPublication(fixture, three, last);
  await ctx.source();
  for (const [direction, sources] of [
    ['undo', [two, one, base, previous]],
    ['redo', [base, one, two, three]],
  ]) {
    for (const [index, source] of sources.entries()) {
      ctx.setStage(`external_background_${direction}_${index + 1}`);
      progress.direction = direction;
      progress.step = index + 1;
      progress.expectedSourceSha256 = hash(Buffer.from(source));
      onProgress(progress);
      try {
        await ctx.chord('z', direction === 'redo');
        await ctx.bytes(source);
        progress.historyChecks++;
      } catch (error) {
        try {
          progress.actualDiskSha256 = hash(
            await readFile((await scopedFile(fixture)).file),
          );
        } catch {
          progress.actualDiskSha256 = null;
        }
        if (ctx.observeSource) {
          try {
            progress.editor = await ctx.observeSource(source);
          } catch {
            progress.editor = null;
          }
        }
        onProgress(progress);
        try {
          await ctx.screenshot('screenshot-external-background-failed.png');
        } catch {
          /* Original failure remains authoritative. */
        }
        throw error;
      }
      onProgress(progress);
    }
  }
  const otherFile = join(fixture, 'vault', 'other.mdx');
  assert.deepEqual(
    await readFile(otherFile),
    Buffer.from(other),
    'Other document bytes preserved',
  );
  const otherMetadata = await lstat(otherFile);
  assert(
    otherMetadata.isFile() &&
      !otherMetadata.isSymbolicLink() &&
      otherMetadata.uid === process.getuid() &&
      otherMetadata.nlink === 1,
    'Other document identity remains owned/regular',
  );
  assert.equal(
    otherMetadata.mode & 0o777,
    0o640,
    'Other document mode preserved',
  );
  await ctx.checkpoint(
    'external-three-background-checkpoints-and-prior-local-history',
  );
  await ctx.screenshot('screenshot-external-background.png');
  return {
    source: three,
    checkpoints: 3,
    noEchoChecks: 3,
    otherDocumentPreserved: true,
    observations,
  };
}

export async function prepareInstalledExternal({ fixture, original }) {
  assert.equal(
    process.getuid(),
    1001,
    'Retained external-writer account required',
  );
  assert.equal(process.env.HOME, '/home/pn-local-20261128');
  const store = join(
    process.env.HOME,
    '.local/share/dev.programmablenotes.app/recovery',
  );
  for (const path of [
    process.env.HOME,
    join(process.env.HOME, '.local'),
    join(process.env.HOME, '.local/share'),
    dirname(store),
    store,
  ]) {
    const m = await lstat(path);
    assert(
      m.isDirectory() &&
        !m.isSymbolicLink() &&
        m.uid === process.getuid() &&
        !(m.mode & 0o022),
      'Owned retained recovery directory chain',
    );
    assert.equal(await realpath(path), path);
  }
  const retained = await guardRetainedRecoveryStore(store);
  const { file } = await scopedFile(fixture);
  assert.deepEqual(await readFile(file), Buffer.from(original));
  const direct = original.replace('Shared editor', 'Writer editor');
  assert.notEqual(direct, original);
  assert.equal(Buffer.byteLength(direct), Buffer.byteLength(original));
  const atomic = direct.replace(
    'Body.',
    'External Café 🌱.\n{/* exact atomic comment */}',
  );
  const typed = atomic + 'Typed after external.';
  const otherFile = join(fixture, 'vault', 'other.mdx');
  await writeFile(otherFile, '# Background witness\n', {
    flag: 'wx',
    mode: 0o640,
  });
  await chmod(otherFile, 0o640);
  const result = {
    schema: 1,
    writer: 'independent-node-process',
    observations: [],
    idleEchoChecks: 0,
    backgroundHistoryCheckpoints: 0,
    otherDocumentPreserved: false,
    backgroundObservations: [],
    backgroundProgress: null,
    restarted: false,
    fixtureRetained: true,
    retainedRecovery: {
      initialEntries: retained.entries,
      invalidRecords: retained.invalidRecords,
      preserved: false,
    },
  };
  return {
    evidence: result,
    async verify() {
      await retained.assertPreserved();
      result.retainedRecovery.preserved = true;
    },
    async run(ctx) {
      const {
        setStage,
        sourceShows,
        checkpoint,
        screenshot,
        source,
        chord,
        type,
        bytes,
        pause,
        normalClose,
        start,
        chooseAndOpen,
        onEvidence,
      } = ctx;
      onEvidence(result);
      await ctx.clickButton('Close navigation');
      await source();
      await chord('\uE010');
      for (const [kind, expected, next] of [
        ['direct', original, direct],
        ['rename', direct, atomic],
      ]) {
        setStage(`external_${kind}_publication`);
        const receipt = await publishExternalSource(
          fixture,
          expected,
          next,
          kind,
        );
        await sourceShows(next);
        const latencyMs =
          Math.ceil((performance.now() - receipt.writeCompletedAtMs) * 1000) /
          1000;
        assert(
          latencyMs >= 0 && latencyMs < 15_000,
          'Bounded external-write visible-update deadline',
        );
        result.observations.push({
          kind,
          sourceSha256: receipt.sourceSha256,
          mode: receipt.mode,
          writeCompletionToVisibleObservationMs: latencyMs,
        });
        await bytes(next);
        await assertExternalPublication(fixture, next, receipt);
        await checkpoint(`external-${kind}-exact-visible-source`);
        await screenshot(`screenshot-external-${kind}.png`);
        setStage(`external_${kind}_idle_no_echo`);
        await pause(2500);
        await assertExternalPublication(fixture, next, receipt);
        result.idleEchoChecks++;
        onEvidence(result);
      }
      setStage('external_next_keyboard_save');
      await source();
      await chord('\uE010');
      await type('Typed after external.');
      await bytes(typed);
      await checkpoint('external-next-keyboard-exact-save');
      setStage('external_separate_history');
      await chord('z');
      await bytes(atomic);
      await chord('z');
      await bytes(direct);
      await chord('z');
      await bytes(original);
      await chord('z', true);
      await bytes(direct);
      await chord('z', true);
      await bytes(atomic);
      await chord('z', true);
      await bytes(typed);
      await checkpoint('external-and-local-keyboard-undo-redo-exact');
      const background = await verifyBackgroundExternalHistory({
        fixture,
        base: typed,
        previous: atomic,
        ctx,
        onProgress: (value) => {
          result.backgroundProgress = value;
          onEvidence(result);
        },
      });
      result.backgroundHistoryCheckpoints = background.checkpoints;
      result.otherDocumentPreserved = background.otherDocumentPreserved;
      result.backgroundObservations = background.observations;
      result.idleEchoChecks += background.noEchoChecks;
      onEvidence(result);
      setStage('external_restart_reauthorization');
      await normalClose(ctx.first);
      const second = await start();
      assert.notEqual(second, ctx.first);
      await chooseAndOpen();
      await sourceShows(background.source);
      await bytes(background.source);
      await checkpoint('external-fresh-process-chooser-exact-reopen');
      result.restarted = true;
      onEvidence(result);
      await normalClose(second);
      return result;
    },
  };
}
