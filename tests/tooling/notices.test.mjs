import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, writeFile, rm, symlink } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageNotice } from '../../scripts/third-party-notices.mjs';

test('notice collection refuses absent license text and mismatched installed versions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-notice-'));
  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0', license: 'MIT' }),
    );
    await assert.rejects(
      packageNotice(directory, '1.0.0'),
      /Missing upstream license/,
    );
    await writeFile(
      join(directory, 'LICENSE'),
      'Fixture license text — not a project license.\n',
    );
    const result = await packageNotice(directory, '1.0.0');
    assert.equal(
      result.texts[0].text,
      'Fixture license text — not a project license.\n',
    );
    await assert.rejects(
      packageNotice(directory, '2.0.0'),
      /differs from lockfile/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('notice collection cannot read a license symlink outside the declared package', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-notice-link-'));
  const outside = await mkdtemp(join(tmpdir(), 'pn-notice-outside-'));
  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ name: 'fixture', version: '1.0.0' }),
    );
    await writeFile(join(outside, 'text'), 'Synthetic private fixture');
    await symlink(join(outside, 'text'), join(directory, 'LICENSE'));
    await assert.rejects(packageNotice(directory, '1.0.0'), /escapes package/);
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
