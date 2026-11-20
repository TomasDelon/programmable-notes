import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import * as notices from '../../scripts/third-party-notices.mjs';

test('embedded compiler notices require exact asset, version and notice fingerprints', async () => {
  const root = await mkdtemp(join(tmpdir(), 'pn-embedded-notices-'));
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const binary = Buffer.from('Synthetic unused WASM fixture go1.26.5');
  const text = 'Synthetic license fixture, not a license for this project.\n';
  try {
    await mkdir(join(root, 'licenses'));
    await mkdir(join(root, 'node_modules/esbuild-wasm'), { recursive: true });
    const manifest = {
      package: 'esbuild-wasm',
      packageVersion: '0.28.2',
      goVersion: 'go1.26.5',
      wasmSha256: hash(binary),
      noticesSha256: hash(text),
    };
    await writeFile(
      join(root, 'licenses/esbuild-wasm-go.json'),
      JSON.stringify(manifest),
    );
    await writeFile(join(root, 'licenses/ESBUILD_WASM_GO_NOTICES.txt'), text);
    const module = join(root, 'node_modules/esbuild-wasm');
    await writeFile(
      join(module, 'package.json'),
      JSON.stringify({ version: '0.28.2' }),
    );
    await writeFile(join(module, 'esbuild.wasm'), binary);
    assert.equal(await notices.embeddedRuntimeNotice(root), text);
    await writeFile(
      join(module, 'esbuild.wasm'),
      Buffer.from('Changed synthetic asset'),
    );
    await assert.rejects(
      notices.embeddedRuntimeNotice(root),
      /Embedded compiler asset changed/,
    );
    await writeFile(join(module, 'esbuild.wasm'), binary);
    await writeFile(
      join(module, 'package.json'),
      JSON.stringify({ version: '0.29.0' }),
    );
    await assert.rejects(
      notices.embeddedRuntimeNotice(root),
      /Embedded compiler version changed/,
    );
    await writeFile(
      join(module, 'package.json'),
      JSON.stringify({ version: '0.28.2' }),
    );
    await writeFile(
      join(root, 'licenses/ESBUILD_WASM_GO_NOTICES.txt'),
      'Truncated notices',
    );
    await assert.rejects(
      notices.embeddedRuntimeNotice(root),
      /Embedded runtime notice changed/,
    );
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});
