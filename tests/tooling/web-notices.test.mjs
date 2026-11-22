import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  readFile,
  writeFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { packageNotice } from '../../scripts/third-party-notices.mjs';

const source = new URL(
  '../../licenses/REMARK_MATH_LICENSE.txt',
  import.meta.url,
);

test('exact math package sidecars preserve upstream bytes and refuse changes or unreviewed versions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-math-notice-'));
  try {
    const manifest = { name: 'remark-math', version: '6.0.0', license: 'MIT' };
    await writeFile(join(directory, 'package.json'), JSON.stringify(manifest));
    await assert.rejects(
      packageNotice(directory, '6.0.0'),
      /Missing upstream license/,
    );
    await mkdir(join(directory, 'licenses'));
    const bytes = await readFile(source);
    const sidecar = join(directory, 'licenses/REMARK_MATH_LICENSE.txt');
    await writeFile(sidecar, bytes);
    const result = await packageNotice(directory, '6.0.0', directory);
    assert.equal(result.texts[0].text, bytes.toString('utf8'));
    assert.match(
      result.texts[0].name,
      /d5d0660b150810a535bbb07eac6cc96a4510aa24/,
    );
    await writeFile(sidecar, 'Truncated upstream text');
    await assert.rejects(
      packageNotice(directory, '6.0.0', directory),
      /sidecar changed/,
    );
    await writeFile(sidecar, bytes);
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({ ...manifest, version: '6.0.1' }),
    );
    await assert.rejects(
      packageNotice(directory, '6.0.1', directory),
      /Missing upstream license/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
  }
});

test('math license sidecar cannot follow a symlink outside the project', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'pn-math-link-'));
  const outside = await mkdtemp(join(tmpdir(), 'pn-math-outside-'));
  try {
    await writeFile(
      join(directory, 'package.json'),
      JSON.stringify({
        name: 'rehype-katex',
        version: '7.0.1',
        license: 'MIT',
      }),
    );
    await mkdir(join(directory, 'licenses'));
    await writeFile(join(outside, 'license'), await readFile(source));
    await symlink(
      join(outside, 'license'),
      join(directory, 'licenses/REMARK_MATH_LICENSE.txt'),
    );
    await assert.rejects(
      packageNotice(directory, '7.0.1', directory),
      /sidecar escapes project/,
    );
  } finally {
    await rm(directory, { recursive: true, force: true });
    await rm(outside, { recursive: true, force: true });
  }
});
