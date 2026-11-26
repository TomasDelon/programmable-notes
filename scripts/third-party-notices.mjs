/** Preserve upstream texts; this does not select a license for this project. */
import {
  readFile,
  readdir,
  realpath,
  writeFile,
  mkdir,
} from 'node:fs/promises';
import { resolve, relative, dirname, isAbsolute } from 'node:path';
import { pathToFileURL } from 'node:url';
import process from 'node:process';
import { createHash } from 'node:crypto';

const workersRevision = '4dff55a55a5d801c2cd5cd5321eb3272092ccdb7';
const workersLicense = (kind, sha256) => ({
  sidecar: `licenses/WORKERS_SDK_LICENSE_${kind}.txt`,
  sha256,
  source: `https://github.com/cloudflare/workers-sdk/blob/${workersRevision}/LICENSE-${kind}`,
});
const workersMit = workersLicense(
  'MIT',
  '9bb3b077cc8628334bab25961223dd8207252c8a56aa054195be38f1c042aaf4',
);
const workersApache = workersLicense(
  'APACHE',
  '62c7a1e35f56406896d7aa7ca52d0cc0d272ac022b5d2796e7d6905db8a3636a',
);
const mathLicense = (revision) => ({
  license: 'MIT',
  texts: [
    {
      sidecar: 'licenses/REMARK_MATH_LICENSE.txt',
      sha256:
        'cb992262f361a5359e6771c28740d33c7041e15332ae8537fae40538992591a9',
      source: `https://github.com/remarkjs/remark-math/blob/${revision}/license`,
    },
  ],
});
const missingPackageLicenses = new Map([
  [
    'remark-math@6.0.0',
    mathLicense('d5d0660b150810a535bbb07eac6cc96a4510aa24'),
  ],
  [
    'rehype-katex@7.0.1',
    mathLicense('88a9497e1ede93b958237c85edbf5651faeca7af'),
  ],
  [
    'wrangler@4.168.0',
    { license: 'MIT OR Apache-2.0', texts: [workersMit, workersApache] },
  ],
  ['miniflare@5.20261123.1-beta', { license: 'MIT', texts: [workersMit] }],
]);

export async function packageNotice(directory, expectedVersion, projectRoot) {
  const root = await realpath(directory);
  const manifest = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  );
  if (manifest.version !== expectedVersion)
    throw Error('Installed package differs from lockfile');
  const names = (await readdir(root))
    .filter((name) => /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/i.test(name))
    .sort();
  const texts = [];
  if (!names.length) {
    // Exact tarballs omit their monorepo's root texts. Math provenance uses
    // registry gitHead; Workers SDK uses registry provenance plus release tags
    // because gitHead is absent. See licenses/WORKERS_SDK_LICENSE_PROVENANCE.json.
    const exception = missingPackageLicenses.get(
      `${manifest.name}@${manifest.version}`,
    );
    if (!projectRoot || !exception)
      throw Error('Missing upstream license text: ' + manifest.name);
    if (manifest.license !== exception.license)
      throw Error(
        'Upstream license declaration changed; verify release provenance',
      );
    const project = await realpath(projectRoot);
    for (const file of exception.texts) {
      const sidecar = await realpath(resolve(project, file.sidecar));
      const inside = relative(project, sidecar);
      if (inside.startsWith('..') || isAbsolute(inside))
        throw Error('Upstream license sidecar escapes project');
      const bytes = await readFile(sidecar);
      if (createHash('sha256').update(bytes).digest('hex') !== file.sha256)
        throw Error(
          'Upstream license sidecar changed; verify release provenance',
        );
      texts.push({
        name: `Upstream LICENSE: ${file.source}`,
        text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
      });
    }
  }
  for (const name of names) {
    const path = await realpath(resolve(root, name));
    const inside = relative(root, path);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw Error('License text escapes package');
    const bytes = await readFile(path);
    if (!bytes.length || bytes.length > 1024 * 1024)
      throw Error('Invalid upstream license text size');
    texts.push({
      name,
      text: new TextDecoder('utf-8', { fatal: true }).decode(bytes),
    });
  }
  return {
    name: manifest.name,
    version: manifest.version,
    license: manifest.license,
    texts,
  };
}

/** The npm package license does not include the compiler's embedded Go runtime. */
export async function embeddedRuntimeNotice(root) {
  const manifest = JSON.parse(
    await readFile(resolve(root, 'licenses/esbuild-wasm-go.json'), 'utf8'),
  );
  const installed = JSON.parse(
    await readFile(
      resolve(root, 'node_modules/esbuild-wasm/package.json'),
      'utf8',
    ),
  );
  if (
    manifest.package !== 'esbuild-wasm' ||
    installed.version !== manifest.packageVersion
  )
    throw Error('Embedded compiler version changed; review upstream notices');
  const hash = (bytes) => createHash('sha256').update(bytes).digest('hex');
  const asset = await readFile(
    resolve(root, 'node_modules/esbuild-wasm/esbuild.wasm'),
  );
  if (
    hash(asset) !== manifest.wasmSha256 ||
    !asset.includes(Buffer.from(manifest.goVersion))
  )
    throw Error('Embedded compiler asset changed; review Go runtime notices');
  const bytes = await readFile(
    resolve(root, 'licenses/ESBUILD_WASM_GO_NOTICES.txt'),
  );
  if (hash(bytes) !== manifest.noticesSha256)
    throw Error('Embedded runtime notice changed; reverify upstream texts');
  return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
}

export async function generateNotices(root = process.cwd()) {
  const lock = JSON.parse(
    await readFile(resolve(root, 'package-lock.json'), 'utf8'),
  );
  const project = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  );
  const required = new Set(
    Object.entries(lock.packages)
      .filter(([key, value]) => key && !value.dev && !value.devOptional)
      .map(([key]) => key),
  );
  for (const name of Object.keys(project.devDependencies || {}))
    required.add('node_modules/' + name);
  const modules = await realpath(resolve(root, 'node_modules'));
  const packages = [];
  for (const key of [...required].sort()) {
    if (!key.startsWith('node_modules/') || key.split('/').includes('..'))
      throw Error('Unsafe lockfile package path');
    const entry = lock.packages[key];
    if (!entry || entry.link) throw Error('Expected a locked registry package');
    let path;
    try {
      path = await realpath(resolve(root, key));
    } catch (error) {
      if (error.code === 'ENOENT' && entry.optional) continue;
      throw error;
    }
    const inside = relative(modules, path);
    if (inside.startsWith('..') || isAbsolute(inside))
      throw Error('Package escapes dependency directory');
    packages.push(await packageNotice(path, entry.version, root));
  }
  const lines = [
    'THIRD-PARTY NOTICES — PROGRAMMABLE NOTES',
    '',
    'Upstream license texts for installed production npm dependencies and direct build tools.',
    'The inventory is intentionally broader than the code in any one browser bundle.',
    'These notices do not select or grant an open-source license for Programmable Notes.',
    'Rust/native and design-reference materials have separate attribution requirements.',
    '',
  ];
  for (const p of packages) {
    lines.push(
      '='.repeat(72),
      `${p.name}@${p.version}`,
      `Declared upstream license: ${typeof p.license === 'string' ? p.license : JSON.stringify(p.license)}`,
    );
    for (const file of p.texts)
      lines.push('', `--- ${file.name} ---`, file.text.trimEnd());
    lines.push('');
  }
  lines.push(await embeddedRuntimeNotice(root));
  return { text: lines.join('\n'), packages: packages.length };
}

if (
  process.argv[1] &&
  import.meta.url === pathToFileURL(resolve(process.argv[1])).href
) {
  const args = process.argv.slice(2);
  if (args.length && (args.length !== 2 || args[0] !== '--output'))
    throw Error('Expected optional --output PATH');
  const output = resolve(args[1] || 'public/THIRD_PARTY_NOTICES.txt');
  const result = await generateNotices();
  await mkdir(dirname(output), { recursive: true });
  await writeFile(output, result.text);
  console.log(
    JSON.stringify({
      noticePackages: result.packages,
      output: relative(process.cwd(), output),
    }),
  );
}
