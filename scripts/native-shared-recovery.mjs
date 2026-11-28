/** Trusted external installed witness; never imported by application/document code. */
import assert from 'node:assert/strict';
import { createHash, randomUUID } from 'node:crypto';
import {
  chmod,
  lstat,
  readdir,
  realpath,
  rename,
  writeFile,
  readFile,
} from 'node:fs/promises';
import { basename, dirname, join } from 'node:path';
import {
  decodeRecoveryRecord,
  readPrivateRecoveryBytes,
} from './native-recovery-record.mjs';

const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
const invalidBytes = Buffer.from('Synthetic invalid recovery sibling.\n');
export async function prepareInstalledRecovery({
  fixture,
  vault,
  file,
  original,
  evidence,
}) {
  // This witness may inspect only the retained disposable profile, never the owner.
  assert.equal(process.getuid(), 1001, 'Retained recovery account required');
  assert.equal(
    process.env.HOME,
    '/home/pn-local-20261128',
    'Retained recovery home required',
  );
  const home = process.env.HOME;
  const store = join(home, '.local/share/dev.programmablenotes.app/recovery');
  for (const path of [
    home,
    join(home, '.local'),
    join(home, '.local/share'),
    dirname(store),
    store,
  ]) {
    const m = await lstat(path);
    assert(
      m.isDirectory() &&
        !m.isSymbolicLink() &&
        m.uid === process.getuid() &&
        !(m.mode & 0o022),
      'Owned recovery directory chain',
    );
    assert.equal(
      await realpath(path),
      path,
      'No recovery directory redirection',
    );
  }
  assert.equal(
    (await lstat(store)).mode & 0o777,
    0o700,
    'Private recovery directory',
  );
  const run = basename(fixture);
  const suffix = `Pending recovery ${run}.`;
  const pending = original + suffix;
  const restoredName = `recovered-${run}.mdx`;
  const restored = join(vault, restoredName);
  const invalidName = `${randomUUID().replaceAll('-', '')}-00000000000000000001-${'0'.repeat(64)}.pnrec`;
  let invalidInStore = false;
  async function inventory(allowInvalid = false, allowPending = false) {
    const names = (await readdir(store)).sort();
    assert(names.length <= 256, 'Recovery inventory bounded');
    const result = new Map(),
      versions = [];
    let pending = false,
      usedBytes = 0;
    for (const name of names) {
      if (allowPending && /^\.pending-[a-f0-9]{32}$/.test(name)) {
        pending = true;
        continue;
      }
      assert(
        name === '.lock' ||
          /^[a-f0-9]{32}-[0-9]{20}-[a-f0-9]{64}\.pnrec$/.test(name),
        'Unexpected retained store entry; no maintenance authorized',
      );
      const path = join(store, name),
        bytes = await readPrivateRecoveryBytes(path),
        m = await lstat(path);
      assert(m.isFile() && !m.isSymbolicLink(), 'Regular recovery entry');
      usedBytes += bytes.length;
      assert(usedBytes <= 8 * 1024 * 1024, 'Recovery inventory byte bound');
      result.set(name, {
        hash: hash(bytes),
        mode: m.mode & 0o777,
        ino: String(m.ino),
        mtimeMs: m.mtimeMs,
        ctimeMs: m.ctimeMs,
      });
      if (name === '.lock') continue;
      if (allowInvalid && name === invalidName)
        assert.deepEqual(
          bytes,
          invalidBytes,
          'Only run-created invalid sibling permitted',
        );
      else versions.push(decodeRecoveryRecord(bytes, name));
    }
    return { entries: result, versions, pending, usedBytes };
  }
  const initial = await inventory();
  assert(
    initial.usedBytes <= 8 * 1024 * 1024 - 100000,
    'Byte capacity without removing existing records',
  );
  assert(
    initial.versions.length <= 52,
    'Capacity for this run without deleting existing records',
  );
  const groups = new Map();
  for (const record of initial.versions)
    groups.set(
      record.metadata.documentId,
      (groups.get(record.metadata.documentId) ?? 0) + 1,
    );
  assert(
    [...groups.values()].every((count) => count <= 5),
    'Existing records need no automatic pruning',
  );
  async function originalUnchanged() {
    assert.deepEqual(
      await readFile(file),
      Buffer.from(original),
      'Failed save preserves original bytes',
    );
    assert.equal(
      (await lstat(file)).mode & 0o777,
      0o640,
      'Failed save preserves original mode',
    );
  }
  function preserves(before, after) {
    for (const [name, metadata] of before.entries)
      assert.deepEqual(
        after.entries.get(name),
        metadata,
        'Existing recovery entry preserved',
      );
  }
  async function exactInventory(before, allowInvalid = false) {
    const after = await inventory(allowInvalid);
    assert.deepEqual(
      [...after.entries],
      [...before.entries],
      'Discovery does not initialize, rewrite or prune',
    );
    return after;
  }
  await originalUnchanged();
  return {
    async run(h) {
      const {
        first,
        setStage,
        source,
        sourceShows,
        chord,
        type,
        waitFor,
        sync,
        click,
        clickButton,
        keys,
        down,
        up,
        start,
        chooseAndOpen,
        interrupt,
        normalClose,
        checkpoint,
        screenshot,
        onEvidence,
      } = h;
      assert.equal(typeof onEvidence, 'function', 'Recovery evidence observer');
      const audit = {
        initialRecords: initial.versions.length,
        originalDigest: hash(Buffer.from(original)),
        pendingDigest: hash(Buffer.from(pending)),
        restoredName,
        fixtureRetained: true,
        snapshotRetained: 'not_observed',
        snapshot: null,
      };
      onEvidence({ ...audit });
      let selected;
      const stage = async (name) => {
        setStage(name);
      };
      async function closeNavigation() {
        const open = await sync(
          `return document.querySelector('[aria-label="Close navigation"]')?.getAttribute('aria-expanded')==='true'`,
        );
        if (open) {
          await clickButton('Close navigation');
          await waitFor(() =>
            sync(
              `return document.querySelector('[aria-label="Open navigation"]')?.getAttribute('aria-expanded')==='false'`,
            ),
          );
        }
      }
      async function recoveryDialog() {
        const visible = await sync(
          `return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Recover a copy' && !b.closest('[inert]') && b.getClientRects().length)`,
        );
        if (!visible) await clickButton('Open navigation');
        await clickButton('Recover a copy');
        await waitFor(() =>
          sync(
            `return Boolean(document.querySelector('[aria-label="Recovery version"]:not(:disabled)'))`,
          ),
        );
      }
      async function selectVersion() {
        const options = await sync(
          `return [...document.querySelector('[aria-label="Recovery version"]').options].map(option=>option.value)`,
        );
        const index = options.indexOf(selected.file);
        assert(
          index > 0 && options.length <= 65,
          'Exact retained version available',
        );
        await click(
          await sync(
            `return document.querySelector('[aria-label="Recovery version"]')`,
          ),
        );
        await keys([
          down('\uE011'),
          up('\uE011'),
          ...Array.from({ length: index }, () => [
            down('\uE015'),
            up('\uE015'),
          ]).flat(),
          down('\uE007'),
          up('\uE007'),
        ]);
        await waitFor(() =>
          sync(
            `return document.querySelector('[aria-label="Recovery version"]').value===arguments[0]`,
            [selected.file],
          ),
        );
      }
      async function filename(value, prefix) {
        setStage(prefix + '_focus');
        await click(
          await sync(
            `return document.querySelector('[aria-label="Recovered copy filename"]')`,
          ),
        );
        setStage(prefix + '_select');
        await chord('a');
        setStage(prefix + '_type');
        await type(value);
        setStage(prefix + '_verify');
        await waitFor(() =>
          sync(
            `return document.querySelector('[aria-label="Recovered copy filename"]').value===arguments[0]`,
            [value],
          ),
        );
      }
      async function copyBytes(expected) {
        await waitFor(async () => {
          try {
            return (await readFile(restored)).equals(Buffer.from(expected));
          } catch (error) {
            if (error.code === 'ENOENT') return false;
            throw error;
          }
        });
        assert.equal(
          (await lstat(restored)).mode & 0o777,
          0o600,
          'Recovered copy stays private',
        );
        await waitFor(() =>
          sync(
            `return document.querySelector('[aria-label="Document save status"]')?.textContent==='Saved to file'`,
          ),
        );
        await originalUnchanged();
      }
      try {
        await stage('recovery_save_failure');
        await closeNavigation();
        await originalUnchanged();
        await chmod(vault, 0o500);
        assert.equal(
          (await lstat(vault)).mode & 0o777,
          0o500,
          'Only synthetic parent made unwritable',
        );
        await source();
        await chord('\uE010');
        await type(suffix);
        await waitFor(() =>
          sync(
            `return document.querySelector('[aria-label="Document save status"]')?.textContent.startsWith('Not saved')===true`,
          ),
        );
        await sourceShows(pending);
        await originalUnchanged();
        await checkpoint(
          'real-save-failure-visible-text-and-original-bytes-retained',
        );
        await stage('recovery_snapshot_retention');
        await waitFor(() =>
          sync(
            `return document.querySelector('[aria-label="Document save status"]')?.textContent==='Not saved · Recovery confirmed'`,
          ),
        );
        await waitFor(async () => {
          let state;
          try {
            state = await inventory(false, true);
          } catch (error) {
            if (
              error.code === 'ENOENT' ||
              error.code === 'RECOVERY_RECORD_RETIRED'
            )
              return false;
            throw error;
          }
          preserves(initial, state);
          selected = state.versions.find(
            (record) =>
              record.metadata.name === 'primary.mdx' &&
              record.source === pending,
          );
          return !!selected && !state.pending;
        });
        assert(
          !initial.entries.has(selected.file),
          'Snapshot generated by this run',
        );
        audit.snapshotRetained = 'before-close-and-interruption';
        audit.snapshot = {
          file: selected.file,
          id: selected.id,
          metadata: selected.metadata,
        };
        onEvidence({ ...audit });
        await screenshot('screenshot-recovery-pending.png');
        await checkpoint(
          'integrity-valid-app-snapshot-before-close-or-interruption',
        );
        await stage('recovery_intentional_interruption');
        await interrupt(first);
        await chmod(vault, 0o700);
        await originalUnchanged();
        const retained = await inventory();
        preserves(initial, retained);
        await checkpoint(
          'intentional-identity-checked-interruption-and-owned-descendants-gone',
        );
        await stage('recovery_restart_discovery');
        const second = await start();
        assert.notEqual(second, first, 'Fresh installed process');
        await chooseAndOpen();
        await sourceShows(original);
        await recoveryDialog();
        await exactInventory(retained);
        await selectVersion();
        const filesBefore = (await readdir(vault)).sort();
        await clickButton('Close Recover a copy');
        assert.deepEqual(
          (await readdir(vault)).sort(),
          filesBefore,
          'Cancellation creates no file',
        );
        await originalUnchanged();
        await checkpoint('fresh-process-readonly-discovery-and-cancellation');
        // Retire the clean original before the collision probe so it reaches the
        // registered native exclusive-create operation, not loaded-path refusal.
        await stage('recovery_close_clean_original');
        await chord('k');
        await click(
          await sync(
            `return document.querySelector('[aria-label="Search commands and notes"]')`,
          ),
        );
        await type('Close document');
        await keys([down('\uE007'), up('\uE007')]);
        await waitFor(() =>
          sync(`return !document.querySelector('[aria-label="MDX source"]')`),
        );
        await originalUnchanged();

        await stage('recovery_invalid_sibling');
        await writeFile(join(store, invalidName), invalidBytes, {
          mode: 0o600,
          flag: 'wx',
        });
        invalidInStore = true;
        const withInvalid = await inventory(true);
        await recoveryDialog();
        await waitFor(() =>
          sync(
            `return [...document.querySelectorAll('[role="status"]')].some(node=>node.textContent.includes('Some recovery versions could not be read'))`,
          ),
        );
        await selectVersion();
        await exactInventory(withInvalid, true);
        await checkpoint(
          'invalid-sibling-warning-valid-version-discoverable-and-store-unchanged',
        );
        // Preserve this run's synthetic damage as evidence. Native append refuses
        // damaged stores; never clear or rewrite any preexisting recovery entry.
        await rename(
          join(store, invalidName),
          join(dirname(evidence), 'synthetic-invalid-sibling.pnrec'),
        );
        invalidInStore = false;
        await clickButton('Refresh versions');
        await waitFor(() =>
          sync(
            `return !document.querySelector('[aria-label="Recovery version"]').disabled`,
          ),
        );
        await selectVersion();
        await stage('recovery_collision_refusal');
        await filename('primary.mdx', 'recovery_collision_name');
        await stage('recovery_collision_create');
        await clickButton('Create recovered copy');
        await waitFor(() =>
          sync(
            `return document.querySelector('[data-notification-id="product-operation"]')?.textContent.includes('The operation could not finish.')===true`,
          ),
        );
        await screenshot('screenshot-recovery-collision-notice.png');
        await stage('recovery_collision_details');
        await click(
          await sync(
            `return [...document.querySelectorAll('[data-notification-id="product-operation"] button')].find(button=>button.textContent.trim()==='Details') ?? null`,
          ),
        );
        await waitFor(() =>
          sync(
            `return document.querySelector('dialog[open][aria-label="Notification details"] pre')?.textContent==='Native create refused (conflict). No target file or document grant was published.'`,
          ),
        );
        audit.collision = 'native_exclusive_create_conflict';
        onEvidence({ ...audit });
        await screenshot('screenshot-recovery-collision.png');
        await clickButton('Close details');
        await waitFor(() =>
          sync(
            `return !document.querySelector('dialog[open][aria-label="Notification details"]')`,
          ),
        );
        for (const notification of ['product-operation', 'product-workspace']) {
          const dismiss = await sync(
            `return document.querySelector('[data-notification-id="'+arguments[0]+'"] [aria-label="Dismiss notification"]')`,
            [notification],
          );
          if (dismiss) await click(dismiss);
          await waitFor(() =>
            sync(
              `return !document.querySelector('[data-notification-id="'+arguments[0]+'"]')`,
              [notification],
            ),
          );
        }
        await waitFor(() =>
          sync(
            `return [...document.querySelectorAll('button')].some(b=>b.textContent.trim()==='Create recovered copy' && !b.disabled)`,
          ),
        );
        assert.deepEqual(
          (await readdir(vault)).sort(),
          filesBefore,
          'Collision creates no file',
        );
        await originalUnchanged();
        await checkpoint(
          'exclusive-create-collision-refuses-original-overwrite',
        );
        await filename(restoredName, 'recovery_new_copy_name');
        await stage('recovery_new_copy_create');
        await clickButton('Create recovered copy');
        await stage('recovery_new_copy_source');
        await sourceShows(pending);
        await stage('recovery_new_copy_disk');
        await copyBytes(pending);
        assert.deepEqual(
          (await readdir(vault)).sort(),
          [...filesBefore, restoredName].sort(),
          'Only explicit restored copy created',
        );
        await closeNavigation();
        await screenshot('screenshot-recovery-copy.png');
        await checkpoint(
          'exclusive-new-copy-exact-bom-mixed-ending-jsx-private-mode',
        );
        await stage('recovery_copy_history');
        await source();
        await chord('\uE010');
        await type('Restored edit.');
        await copyBytes(pending + 'Restored edit.');
        await chord('z');
        await copyBytes(pending);
        await chord('z', true);
        await copyBytes(pending + 'Restored edit.');
        await checkpoint('restored-copy-real-keyboard-undo-redo-autosave');
        await stage('recovery_copy_restart');
        await normalClose(second);
        const third = await start();
        assert.notEqual(third, second, 'Fresh restored-copy process');
        await chooseAndOpen(restoredName);
        await sourceShows(pending + 'Restored edit.');
        await copyBytes(pending + 'Restored edit.');
        await normalClose(third);
        const final = await inventory();
        preserves(initial, final);
        assert(
          final.entries.has(selected.file),
          'Selected pending snapshot remains retained',
        );
        await checkpoint(
          'restored-copy-normal-close-restart-reauthorize-exact-reopen',
        );
        return {
          ...audit,
          intentionalInterruption: true,
          restoredDigest: hash(Buffer.from(pending + 'Restored edit.')),
        };
      } finally {
        await chmod(vault, 0o700);
        if (invalidInStore) {
          await rename(
            join(store, invalidName),
            join(dirname(evidence), 'synthetic-invalid-sibling.pnrec'),
          );
          invalidInStore = false;
        }
      }
    },
  };
}
