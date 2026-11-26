import assert from 'node:assert/strict';
import {
  mkdtemp,
  mkdir,
  writeFile,
  readFile,
  rm,
  symlink,
} from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { test } from 'node:test';
import { gzipSync } from 'node:zlib';
import {
  registryNotice,
  rustRuntimeNotice,
  parseCargoLock,
} from '../../scripts/native-notices.mjs';

const sha = (data) => createHash('sha256').update(data).digest('hex');
async function fixture(task) {
  const root = await mkdtemp(join(tmpdir(), 'pn-native-notices-'));
  try {
    const cargoHome = join(root, 'cargo');
    const directory = join(cargoHome, 'registry/src/index-test/fixture-1.2.3');
    const archive = join(
      cargoHome,
      'registry/cache/index-test/fixture-1.2.3.crate',
    );
    await mkdir(directory, { recursive: true });
    await mkdir(join(cargoHome, 'registry/cache/index-test'), {
      recursive: true,
    });
    const manifest =
      '[package]\nname="fixture"\nversion="1.2.3"\nlicense="MIT"\n';
    const license =
      'MIT License\n\nCopyright (c) Fixture author\nPermission is hereby granted, free of charge, to any person obtaining a copy.\n';
    await writeFile(join(directory, 'Cargo.toml'), manifest);
    await writeFile(join(directory, 'LICENSE'), license);
    execFileSync('tar', [
      '-czf',
      archive,
      '-C',
      join(directory, '..'),
      'fixture-1.2.3',
    ]);
    const locked = {
      name: 'fixture',
      version: '1.2.3',
      source: 'registry+https://github.com/rust-lang/crates.io-index',
      checksum: sha(await readFile(archive)),
    };
    await writeFile(
      join(directory, '.cargo-checksum.json'),
      JSON.stringify({
        package: locked.checksum,
        files: { 'Cargo.toml': sha(manifest), LICENSE: sha(license) },
      }),
    );
    const pkg = {
      name: locked.name,
      version: locked.version,
      source: locked.source,
      license: 'MIT',
      license_file: null,
      manifest_path: join(directory, 'Cargo.toml'),
    };
    await task({ root, cargoHome, directory, archive, locked, pkg, license });
  } finally {
    await rm(root, { recursive: true, force: true });
  }
}

test('preserves exact archive-verified license bytes and locked identity', async () =>
  fixture(async (f) => {
    const result = await registryNotice(f.pkg, f.locked, f);
    assert.equal(result.name, 'fixture');
    assert.equal(result.checksum, f.locked.checksum);
    assert.equal(result.texts[0].text, f.license);
    assert.equal(result.texts[0].sha256, sha(f.license));
  }));
test('refuses changed archive, declaration, installed text and missing legal text', async () => {
  for (const mode of ['archive', 'declaration', 'text', 'missing'])
    await fixture(async (f) => {
      if (mode === 'archive') await writeFile(f.archive, 'changed');
      if (mode === 'declaration') f.pkg.license = 'Unknown-License';
      if (mode === 'text')
        await writeFile(join(f.directory, 'LICENSE'), 'changed');
      if (mode === 'missing') await rm(join(f.directory, 'LICENSE'));
      await assert.rejects(registryNotice(f.pkg, f.locked, f));
    });
});
test('refuses escaping symlinks and unsafe package names', async () =>
  fixture(async (f) => {
    await rm(join(f.directory, 'LICENSE'));
    await writeFile(join(f.root, 'outside'), 'not a package license');
    await symlink(join(f.root, 'outside'), join(f.directory, 'LICENSE'));
    await assert.rejects(registryNotice(f.pkg, f.locked, f), /symlink|escape/i);
    f.pkg.name = '../fixture';
    await assert.rejects(registryNotice(f.pkg, f.locked, f), /unsafe/i);
  }));
test('rejects malformed expressions even when all license identifiers are known', async () =>
  fixture(async (f) => {
    for (const license of [
      'MIT Apache-2.0',
      'MIT OR',
      '(MIT',
      'MIT//Apache-2.0',
      'LLVM-exception',
      'MIT WITH MIT',
    ])
      await assert.rejects(
        registryNotice({ ...f.pkg, license }, f.locked, f),
        /license expression|license exception/,
      );
  }));
test('rejects unknown registry sources and duplicate lock identities', async () =>
  fixture(async (f) => {
    await assert.rejects(
      registryNotice(
        { ...f.pkg, source: 'git+https://example.test/repo' },
        f.locked,
        f,
      ),
      /source|identity/i,
    );
    const entry = `[[package]]\nname = "fixture"\nversion = "1.2.3"\nsource = "${f.locked.source}"\nchecksum = "${f.locked.checksum}"\n`;
    assert.equal(parseCargoLock(entry).length, 1);
    assert.throws(() => parseCargoLock(entry + '\n' + entry), /duplicate/i);
  }));

test('Rust runtime notices require the exact compiler and unmodified distribution resources', async () => {
  await fixture(async (f) => {
    const rule = {
      release: '1.100.0',
      commit: 'a'.repeat(40),
      host: 'x86_64-unknown-linux-gnu',
      archive:
        'https://static.rust-lang.org/dist/2026-11-12/rustc-1.100.0-x86_64-unknown-linux-gnu.tar.xz',
      archiveSha256: 'b'.repeat(64),
      texts: [],
    };
    for (const name of ['COPYRIGHT-library.html', 'COPYRIGHT.html']) {
      const raw = Buffer.from(`Exact upstream ${name}\n`),
        packed = gzipSync(raw);
      await writeFile(join(f.root, name + '.gz'), packed);
      await writeFile(join(f.root, name), raw);
      rule.texts.push({
        name,
        installed: name,
        sidecar: name + '.gz',
        compressedSha256: sha(packed),
        sha256: sha(raw),
        bytes: raw.length,
      });
    }
    const version = {
      release: rule.release,
      'commit-hash': rule.commit,
      host: rule.host,
    };
    const result = await rustRuntimeNotice(f.root, rule, version, f.root);
    assert.equal(
      result.texts[0].text,
      'Exact upstream COPYRIGHT-library.html\n',
    );
    await assert.rejects(
      rustRuntimeNotice(
        f.root,
        rule,
        { ...version, release: '1.101.0' },
        f.root,
      ),
      /Unreviewed/,
    );
    await writeFile(
      join(f.root, 'COPYRIGHT.html'),
      'changed installed distribution',
    );
    await assert.rejects(
      rustRuntimeNotice(f.root, rule, version, f.root),
      /Installed Rust/,
    );
    await writeFile(
      join(f.root, 'COPYRIGHT-library.html.gz'),
      'changed sidecar',
    );
    await assert.rejects(
      rustRuntimeNotice(f.root, rule, version, f.root),
      /sidecar changed/,
    );
    await assert.rejects(
      rustRuntimeNotice(f.root, { ...rule, texts: [] }, version, f.root),
      /Missing Rust/,
    );
  });
});

test('exact pinned upstream sidecars are required when a crate omits legal files', async () => {
  await fixture(async (f) => {
    await rm(join(f.directory, 'LICENSE'));
    const revision = 'a'.repeat(40);
    await writeFile(
      join(f.directory, '.cargo_vcs_info.json'),
      JSON.stringify({ git: { sha1: revision }, path_in_vcs: 'crate' }),
    );
    execFileSync('tar', [
      '-czf',
      f.archive,
      '-C',
      join(f.directory, '..'),
      'fixture-1.2.3',
    ]);
    f.locked.checksum = sha(await readFile(f.archive));
    await writeFile(join(f.root, 'LICENSE'), f.license);
    f.provenance = {
      packages: {
        'fixture@1.2.3': {
          license: 'MIT',
          checksum: f.locked.checksum,
          gitRevision: revision,
          pathInVcs: 'crate',
          texts: [
            {
              sidecar: 'LICENSE',
              sha256: sha(f.license),
              source: `https://github.com/owner/repo/blob/${revision}/LICENSE`,
            },
          ],
        },
      },
    };
    const result = await registryNotice(f.pkg, f.locked, f);
    assert.equal(result.texts[0].text, f.license);
    await writeFile(join(f.root, 'LICENSE'), 'changed upstream copy');
    await assert.rejects(registryNotice(f.pkg, f.locked, f), /sidecar changed/);
    f.provenance.packages['fixture@1.2.3'].gitRevision = 'b'.repeat(40);
    await assert.rejects(
      registryNotice(f.pkg, f.locked, f),
      /provenance changed/,
    );
  });
});
