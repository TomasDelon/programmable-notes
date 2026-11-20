import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, readdir, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import process from 'node:process';
import { assertEmptySmallTmpfs } from '../../scripts/native-disposable-filesystem.mjs';

test(
  'disk-full guard refuses an ordinary private directory without creating files',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'pn-fs-guard-'));
    try {
      await assert.rejects(
        assertEmptySmallTmpfs(root),
        /Dedicated whole-filesystem tmpfs mount/,
      );
      assert.deepEqual(await readdir(root), []);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);

test(
  'disk-full guard refuses a mountpoint symlink without following it for writes',
  { skip: process.platform !== 'linux' },
  async () => {
    const root = await mkdtemp(join(tmpdir(), 'pn-fs-link-'));
    try {
      await symlink(root, join(root, 'alias'));
      await assert.rejects(
        assertEmptySmallTmpfs(join(root, 'alias')),
        /Canonical mountpoint/,
      );
      assert.deepEqual(await readdir(root), ['alias']);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
);
