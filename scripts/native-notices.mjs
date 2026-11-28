/** Linux Rust redistribution inventory. Preserve upstream texts; never infer a project license. */
import {
  readFile,
  readdir,
  realpath,
  lstat,
  mkdir,
  writeFile,
} from 'node:fs/promises';
import {
  resolve,
  relative,
  dirname,
  basename,
  join,
  isAbsolute,
} from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { gunzipSync } from 'node:zlib';
import { generateNotices } from './third-party-notices.mjs';

const REGISTRY = 'registry+https://github.com/rust-lang/crates.io-index';
const TARGET = 'x86_64-unknown-linux-gnu';
const HASH = /^[a-f0-9]{64}$/;
const NAME = /^[A-Za-z0-9_-]+$/;
const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/;
const identifiers = new Set([
  'MIT',
  'Apache-2.0',
  'Unicode-3.0',
  'Unlicense',
  'BSD-3-Clause',
  'Zlib',
  '0BSD',
  'CC0-1.0',
  'MIT-0',
  'ISC',
  'MPL-2.0',
  'LLVM-exception',
]);
const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
function inside(root, path) {
  const part = relative(root, path);
  if (part === '..' || part.startsWith('../') || isAbsolute(part))
    throw Error('Path escapes its declared source root');
}
function safeName(value) {
  if (
    typeof value !== 'string' ||
    !value ||
    value.includes('\\') ||
    isAbsolute(value) ||
    value
      .split('/')
      .some(
        (part) =>
          !part ||
          part === '.' ||
          part === '..' ||
          !/^[A-Za-z0-9._+-]+$/.test(part),
      )
  )
    throw Error('Unsafe upstream license path');
  return value;
}
async function regular(root, path) {
  inside(root, resolve(path));
  const actual = await realpath(path);
  inside(root, actual);
  if ((await lstat(path)).isSymbolicLink() || !(await lstat(actual)).isFile())
    throw Error('License/source symlink or special file is not accepted');
  return readFile(actual);
}
function declaration(value) {
  if (typeof value !== 'string' || !value || value.length > 256)
    throw Error('Missing upstream license declaration');
  const tokens = value.replaceAll('/', ' OR ').match(/[A-Za-z0-9.+-]+|[()]/g);
  if (
    !tokens?.length ||
    tokens.some(
      (token) =>
        !identifiers.has(token) &&
        !['AND', 'OR', 'WITH', '(', ')'].includes(token),
    ) ||
    value.replace(/[A-Za-z0-9.+\-()/\s]/g, '')
  )
    throw Error(
      'Unknown upstream license declaration; review redistribution obligations',
    );
  let index = 0;
  const primary = () => {
    if (tokens[index] === '(') {
      index++;
      expression();
      if (tokens[index++] !== ')')
        throw Error('Invalid upstream license expression');
    } else if (
      identifiers.has(tokens[index]) &&
      tokens[index] !== 'LLVM-exception'
    ) {
      index++;
      if (tokens[index] === 'WITH') {
        index++;
        if (tokens[index++] !== 'LLVM-exception')
          throw Error('Unknown upstream license exception');
      }
    } else throw Error('Invalid upstream license expression');
  };
  const expression = () => {
    primary();
    while (tokens[index] === 'AND' || tokens[index] === 'OR') {
      index++;
      primary();
    }
  };
  expression();
  if (index !== tokens.length)
    throw Error('Invalid upstream license expression');
}
function stringFields(text) {
  const result = {};
  for (const match of text.matchAll(
    /^(name|version|source|checksum|license|license-file)\s*=\s*("(?:[^"\\]|\\.)*")\s*$/gm,
  )) {
    if (Object.hasOwn(result, match[1]))
      throw Error('Duplicate Cargo identity field');
    result[match[1]] = JSON.parse(match[2]);
  }
  return result;
}
export function parseCargoLock(text) {
  const result = [];
  const seen = new Set();
  for (const block of text.split(/^\[\[package\]\]\s*$/m).slice(1)) {
    const entry = stringFields(block.split(/^\[/m)[0]);
    if (!NAME.test(entry.name || '') || !VERSION.test(entry.version || ''))
      throw Error('Unsafe or missing Cargo.lock identity');
    const key = JSON.stringify([
      entry.name,
      entry.version,
      entry.source || null,
    ]);
    if (seen.has(key)) throw Error('Duplicate Cargo.lock identity');
    seen.add(key);
    result.push(entry);
  }
  if (!result.length) throw Error('Cargo.lock has no packages');
  return result;
}
function packageFields(text) {
  const section = /^\[package\]\s*\r?\n([\s\S]*?)(?=^\[|$(?![\s\S]))/m.exec(
    text,
  )?.[1];
  if (!section) throw Error('Missing normalized Cargo package declaration');
  return stringFields(section);
}
async function licensePaths(root, prefix = '') {
  const result = [];
  for (const entry of await readdir(join(root, prefix), {
    withFileTypes: true,
  })) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    if (entry.isDirectory()) result.push(...(await licensePaths(root, name)));
    else if (!entry.isFile())
      throw Error('Package symlink or special file is not accepted');
    else if (
      (/^(?:licen[sc]e|copying|notice|copyright|unlicense)(?:[._-].*)?$/i.test(
        entry.name,
      ) &&
        !/\.spdx$/i.test(entry.name)) ||
      name
        .split('/')
        .slice(0, -1)
        .some((part) => /^licen[sc]es?$/i.test(part))
    )
      result.push(safeName(name));
  }
  return result.sort();
}
function archived(archive, prefix, name) {
  return execFileSync(
    'tar',
    ['-xzOf', archive, '--', `${safeName(prefix)}/${safeName(name)}`],
    { maxBuffer: 2 * 1024 * 1024, stdio: ['ignore', 'pipe', 'pipe'] },
  );
}
async function upstreamSidecars(pkg, directory, options, archive) {
  const key = `${pkg.name}@${pkg.version}`;
  const rule = options.provenance?.packages?.[key];
  if (
    !rule ||
    rule.checksum !== options.locked.checksum ||
    rule.license !== pkg.license
  )
    throw Error(`Missing upstream license text: ${key}`);
  const vcs = await regular(directory, join(directory, '.cargo_vcs_info.json'));
  if (
    !archived(
      archive,
      `${pkg.name}-${pkg.version}`,
      '.cargo_vcs_info.json',
    ).equals(vcs)
  )
    throw Error('Upstream VCS provenance changed');
  const parsed = JSON.parse(vcs);
  if (
    parsed.git?.sha1 !== rule.gitRevision ||
    parsed.path_in_vcs !== rule.pathInVcs
  )
    throw Error('Upstream release provenance changed');
  if (rule.declarationSource) {
    const name = safeName(rule.declarationSource.name);
    const source = await regular(directory, join(directory, name));
    if (
      sha(source) !== rule.declarationSource.sha256 ||
      !archived(archive, `${pkg.name}-${pkg.version}`, name).equals(source) ||
      !source.toString('utf8').includes(rule.declarationSource.requiredText)
    )
      throw Error('Upstream explicit license pointer changed');
  }
  const texts = [];
  for (const entry of rule.texts) {
    safeName(entry.sidecar);
    if (
      !/^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/blob\/[a-f0-9]{40}\//.test(
        entry.source,
      )
    )
      throw Error('Unpinned upstream license provenance');
    const bytes = await regular(
      options.root,
      resolve(options.root, entry.sidecar),
    );
    if (sha(bytes) !== entry.sha256)
      throw Error('Upstream license sidecar changed');
    texts.push({
      name: entry.sidecar,
      sha256: sha(bytes),
      bytes: bytes.length,
      source: entry.source,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    });
  }
  if (!texts.length) throw Error('Missing upstream license sidecar');
  return texts;
}
export async function registryNotice(pkg, locked, options) {
  if (!NAME.test(pkg.name || '') || !VERSION.test(pkg.version || ''))
    throw Error('Unsafe Cargo package name/version');
  if (
    pkg.source !== REGISTRY ||
    locked.source !== REGISTRY ||
    pkg.name !== locked.name ||
    pkg.version !== locked.version ||
    !HASH.test(locked.checksum || '')
  )
    throw Error('Unknown registry source or lock identity');
  declaration(pkg.license);
  const sources = await realpath(join(options.cargoHome, 'registry/src'));
  const directory = await realpath(dirname(pkg.manifest_path));
  inside(sources, directory);
  if (basename(directory) !== `${pkg.name}-${pkg.version}`)
    throw Error('Package directory differs from Cargo identity');
  const cache = await realpath(join(options.cargoHome, 'registry/cache'));
  const archive = join(
    cache,
    basename(dirname(directory)),
    `${pkg.name}-${pkg.version}.crate`,
  );
  const archiveBytes = await regular(cache, archive);
  if (sha(archiveBytes) !== locked.checksum)
    throw Error('Cargo registry archive differs from Cargo.lock checksum');
  const manifest = await regular(directory, pkg.manifest_path);
  const prefix = `${pkg.name}-${pkg.version}`;
  if (!archived(archive, prefix, 'Cargo.toml').equals(manifest))
    throw Error('Cargo manifest differs from exact registry archive');
  const declared = packageFields(manifest.toString('utf8'));
  if (
    declared.name !== pkg.name ||
    declared.version !== pkg.version ||
    declared.license !== pkg.license
  )
    throw Error('Cargo metadata differs from archived declaration');
  const names = await licensePaths(directory);
  if (pkg.license_file) {
    const selected = relative(directory, resolve(directory, pkg.license_file));
    safeName(selected);
    if (!names.includes(selected)) names.push(selected);
  }
  const texts = [];
  for (const name of names.sort()) {
    const bytes = await regular(directory, join(directory, name));
    if (
      !bytes.length ||
      bytes.length > 1024 * 1024 ||
      !archived(archive, prefix, name).equals(bytes)
    )
      throw Error('Missing/changed upstream license bytes');
    texts.push({
      name,
      sha256: sha(bytes),
      bytes: bytes.length,
      source: `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    });
  }
  if (!texts.length)
    texts.push(
      ...(await upstreamSidecars(
        pkg,
        directory,
        { ...options, locked },
        archive,
      )),
    );
  return {
    name: pkg.name,
    version: pkg.version,
    source: pkg.source,
    checksum: locked.checksum,
    license: pkg.license,
    manifestSha256: sha(manifest),
    texts,
  };
}

export async function rustRuntimeNotice(root, rule, version, sysroot) {
  if (
    !rule ||
    version.release !== rule.release ||
    version['commit-hash'] !== rule.commit ||
    version.host !== rule.host
  )
    throw Error('Unreviewed Rust toolchain; refresh pinned runtime notices');
  if (
    !/^https:\/\/static\.rust-lang\.org\/dist\/[0-9-]+\/rustc-[A-Za-z0-9._-]+\.tar\.xz$/.test(
      rule.archive,
    ) ||
    !HASH.test(rule.archiveSha256)
  )
    throw Error('Invalid official Rust archive provenance');
  const texts = [];
  for (const entry of rule.texts) {
    safeName(entry.name);
    const compressed = await regular(
      root,
      resolve(root, safeName(entry.sidecar)),
    );
    if (sha(compressed) !== entry.compressedSha256)
      throw Error('Rust runtime sidecar changed');
    const bytes = gunzipSync(compressed, { maxOutputLength: 32 * 1024 * 1024 });
    if (sha(bytes) !== entry.sha256 || bytes.length !== entry.bytes)
      throw Error('Rust runtime legal text changed');
    if (
      entry.installed &&
      !bytes.equals(
        await regular(sysroot, resolve(sysroot, safeName(entry.installed))),
      )
    )
      throw Error(
        'Installed Rust runtime legal text differs from pinned distribution',
      );
    texts.push({
      ...entry,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    });
  }
  if (
    !texts.some((entry) => entry.name === 'COPYRIGHT-library.html') ||
    !texts.some((entry) => entry.name === 'COPYRIGHT.html')
  )
    throw Error(
      'Missing Rust standard library or compiler copyright inventory',
    );
  return { ...rule, texts };
}

function withoutText(entry) {
  const result = { ...entry };
  delete result.text;
  return result;
}

export async function generateNativeNotices(
  root = process.cwd(),
  options = {},
) {
  root = await realpath(root);
  const cargoHome = await realpath(
    options.cargoHome ||
      process.env.CARGO_HOME ||
      join(process.env.HOME || '', '.cargo'),
  );
  const manifest = join(root, 'src-tauri/Cargo.toml'),
    lockFile = join(root, 'src-tauri/Cargo.lock');
  const before = await readFile(lockFile),
    manifestBefore = await readFile(manifest);
  const provenance = JSON.parse(
    await readFile(join(root, 'licenses/native/provenance.json'), 'utf8'),
  );
  const cargo = options.cargo || process.env.CARGO || 'cargo';
  const rustc =
    options.rustc ||
    process.env.RUSTC ||
    (cargo.includes('/') ? join(dirname(cargo), 'rustc') : 'rustc');
  const version = Object.fromEntries(
    execFileSync(rustc, ['-Vv'], { encoding: 'utf8' })
      .split('\n')
      .filter((line) => line.includes(': '))
      .map((line) => line.split(': ', 2)),
  );
  const sysroot = execFileSync(rustc, ['--print', 'sysroot'], {
    encoding: 'utf8',
  }).trim();
  const runtime = await rustRuntimeNotice(
    root,
    provenance.rustRuntime,
    version,
    sysroot,
  );
  const args = [
    'metadata',
    '--manifest-path',
    manifest,
    '--locked',
    '--format-version',
    '1',
    '--filter-platform',
    TARGET,
    '--features',
    'custom-protocol',
  ];
  const metadata = JSON.parse(
    execFileSync(cargo, args, {
      cwd: root,
      encoding: 'utf8',
      maxBuffer: 32 * 1024 * 1024,
    }),
  );
  const lock = parseCargoLock(before.toString('utf8'));
  const nodes = new Map(metadata.resolve.nodes.map((node) => [node.id, node]));
  const byId = new Map(metadata.packages.map((pkg) => [pkg.id, pkg]));
  const queue = [metadata.resolve.root],
    seen = new Set(),
    packages = [],
    owned = [];
  while (queue.length) {
    const id = queue.pop();
    if (seen.has(id)) continue;
    seen.add(id);
    const pkg = byId.get(id),
      node = nodes.get(id);
    if (!pkg || !node) throw Error('Incomplete Cargo resolve graph');
    queue.push(...node.dependencies);
    if (pkg.source === null) {
      const path = relative(root, await realpath(dirname(pkg.manifest_path)))
        .split('\\')
        .join('/');
      if (
        {
          'src-tauri': 'programmable-notes',
          'native-documents': 'native-documents',
          'native-policy': 'preview-policy',
          'native-updates': 'native-updates',
        }[path] === pkg.name
      ) {
        owned.push({ name: pkg.name, version: pkg.version, path });
        continue;
      }
      if (
        path !== 'src-tauri/vendor/wry' ||
        pkg.name !== 'wry' ||
        pkg.version !== provenance.wry.version
      )
        throw Error('Unknown path dependency; review native licensing');
      declaration(pkg.license);
      const texts = [];
      for (const entry of provenance.wry.texts) {
        const bytes = await regular(
          root,
          resolve(root, path, safeName(entry.name)),
        );
        if (sha(bytes) !== entry.sha256)
          throw Error('Vendored Wry license changed');
        texts.push({
          ...entry,
          bytes: bytes.length,
          text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
        });
      }
      const wryManifest = await regular(root, pkg.manifest_path);
      if (sha(wryManifest) !== provenance.wry.manifestSha256)
        throw Error('Vendored Wry manifest changed; review native notices');
      packages.push({
        name: pkg.name,
        version: pkg.version,
        source: 'declared vendored fork',
        license: pkg.license,
        upstreamArchive: provenance.wry.archive,
        upstreamArchiveSha256: provenance.wry.archiveSha256,
        manifestSha256: sha(wryManifest),
        texts,
      });
    } else {
      const expected = lock.filter(
        (entry) =>
          entry.name === pkg.name &&
          entry.version === pkg.version &&
          entry.source === pkg.source,
      );
      if (expected.length !== 1)
        throw Error('Cargo dependency is not uniquely locked');
      packages.push(
        await registryNotice(pkg, expected[0], { root, cargoHome, provenance }),
      );
    }
  }
  packages.sort((a, b) =>
    `${a.name}@${a.version}`.localeCompare(`${b.name}@${b.version}`),
  );
  const npm = await generateNotices(root);
  const lines = [
    'NATIVE THIRD-PARTY NOTICES — PROGRAMMABLE NOTES',
    '',
    'Linux x86_64 production-feature Cargo resolve graph, including reachable build/dev tools.',
    'This is a source-license superset, not a claim that every crate is linked in the final executable.',
    'Project-owned crates have no inferred open-source license and are excluded.',
    'Dynamically linked system GTK/WebKit libraries are supplied by the OS, not redistributed here.',
    'Registry archives and their license bytes are checked against Cargo.lock; full original texts follow.',
    'MPL source-form availability: exact original crate archives are linked with checksums below.',
    'The modified Wry source and patch description are in this repository under src-tauri/vendor/wry.',
    '',
  ];
  for (const pkg of packages) {
    lines.push(
      '='.repeat(72),
      `${pkg.name}@${pkg.version}`,
      `Declared upstream license: ${pkg.license}`,
      `Source: ${pkg.source}`,
      `Exact original source: ${pkg.upstreamArchive || `https://crates.io/api/v1/crates/${pkg.name}/${pkg.version}/download`}`,
      `Archive SHA256: ${pkg.checksum || pkg.upstreamArchiveSha256}`,
    );
    for (const text of pkg.texts)
      lines.push(
        '',
        `--- ${text.name}: ${text.source || pkg.upstreamArchive} ---`,
        '',
        text.text,
      );
  }
  lines.push(
    '',
    '='.repeat(72),
    'RUST STANDARD LIBRARY AND COMPILER DISTRIBUTION LEGAL INVENTORY',
    runtime.scope,
    `Official distribution: ${runtime.archive}`,
    `Archive SHA256: ${runtime.archiveSha256}`,
    ...runtime.texts.flatMap((entry) => [
      '',
      `--- ${entry.name} ---`,
      '',
      entry.text,
    ]),
    '',
    '='.repeat(72),
    'EMBEDDED FRONTEND / NPM / WASM RUNTIME NOTICES',
    '',
    npm.text,
  );
  const text = lines.join('\n');
  if (
    !before.equals(await readFile(lockFile)) ||
    !manifestBefore.equals(await readFile(manifest))
  )
    throw Error('Cargo inputs changed during native notice generation');
  return {
    text,
    metadata: {
      schema: 1,
      verified: true,
      target: TARGET,
      cargoCommand: args.map((value) =>
        value === manifest ? 'src-tauri/Cargo.toml' : value,
      ),
      cargoLockSha256: sha(before),
      cargoManifestSha256: sha(manifestBefore),
      noticeSha256: sha(text),
      embeddedNpmNoticeSha256: sha(npm.text),
      embeddedNpmPackages: npm.packages,
      scope:
        'reachable Linux production-feature graph; includes build/dev dependencies; system shared libraries not redistributed',
      projectOwned: owned.sort((a, b) => a.name.localeCompare(b.name)),
      rustRuntime: { ...runtime, texts: runtime.texts.map(withoutText) },
      packages: packages.map((pkg) => ({
        ...pkg,
        texts: pkg.texts.map(withoutText),
      })),
    },
  };
}
if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  if (
    process.argv.length !== 2 ||
    process.platform !== 'linux' ||
    process.arch !== 'x64'
  )
    throw Error('Native notices require Linux x86_64 and no arguments');
  const output = resolve('.cache/native-notices');
  await mkdir(output, { recursive: true });
  await writeFile(
    join(output, 'metadata.json'),
    JSON.stringify({ schema: 1, verified: false }) + '\n',
  );
  const result = await generateNativeNotices();
  await writeFile(join(output, 'NATIVE_THIRD_PARTY_NOTICES.txt'), result.text);
  await writeFile(
    join(output, 'metadata.json'),
    JSON.stringify(result.metadata, null, 2) + '\n',
  );
  console.log(
    JSON.stringify({
      nativeNoticePackages: result.metadata.packages.length,
      npmNoticePackages: result.metadata.embeddedNpmPackages,
      noticeSha256: result.metadata.noticeSha256,
      output: '.cache/native-notices',
    }),
  );
}
