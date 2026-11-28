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

for (const manifest of [
  { name: 'wrangler', version: '4.168.0', license: 'MIT OR Apache-2.0' },
  { name: 'miniflare', version: '5.20261123.1-beta', license: 'MIT' },
]) {
  test(`${manifest.name} omitted-license exception requires exact release, declaration and upstream text`, async () => {
    const directory = await mkdtemp(join(tmpdir(), 'pn-workers-sdk-notice-'));
    try {
      await mkdir(join(directory, 'licenses'));
      const files = [
        'MIT',
        ...(manifest.name === 'wrangler' ? ['APACHE'] : []),
      ];
      for (const suffix of files) {
        const file = `WORKERS_SDK_LICENSE_${suffix}.txt`;
        await writeFile(
          join(directory, 'licenses', file),
          await readFile(new URL(`../../licenses/${file}`, import.meta.url)),
        );
      }
      const packageFile = join(directory, 'package.json');
      await writeFile(packageFile, JSON.stringify(manifest));
      const notice = await packageNotice(
        directory,
        manifest.version,
        directory,
      );
      assert.equal(notice.texts.length, files.length);
      for (let index = 0; index < files.length; index++) {
        const bytes = await readFile(
          join(
            directory,
            'licenses',
            `WORKERS_SDK_LICENSE_${files[index]}.txt`,
          ),
          'utf8',
        );
        assert.equal(notice.texts[index].text, bytes);
        assert.match(
          notice.texts[index].name,
          /4dff55a55a5d801c2cd5cd5321eb3272092ccdb7/,
        );
      }
      await writeFile(
        packageFile,
        JSON.stringify({ ...manifest, version: '999.0.0' }),
      );
      await assert.rejects(
        packageNotice(directory, '999.0.0', directory),
        /Missing upstream license/,
      );
      await writeFile(
        packageFile,
        JSON.stringify({ ...manifest, license: 'Unreviewed' }),
      );
      await assert.rejects(
        packageNotice(directory, manifest.version, directory),
        /license declaration changed/,
      );
      await writeFile(packageFile, JSON.stringify(manifest));
      for (const suffix of files) {
        const sidecar = join(
          directory,
          'licenses',
          `WORKERS_SDK_LICENSE_${suffix}.txt`,
        );
        const bytes = await readFile(sidecar);
        await writeFile(sidecar, 'Changed upstream license');
        await assert.rejects(
          packageNotice(directory, manifest.version, directory),
          /sidecar changed/,
        );
        await writeFile(sidecar, bytes);
      }
    } finally {
      await rm(directory, { recursive: true, force: true });
    }
  });
}
