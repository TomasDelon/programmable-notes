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

export async function packageNotice(directory, expectedVersion) {
  const root = await realpath(directory);
  const manifest = JSON.parse(
    await readFile(resolve(root, 'package.json'), 'utf8'),
  );
  if (manifest.version !== expectedVersion)
    throw Error('Installed package differs from lockfile');
  const names = (await readdir(root))
    .filter((name) => /^(?:licen[sc]e|copying|notice)(?:[.-].*)?$/i.test(name))
    .sort();
  if (!names.length)
    throw Error('Missing upstream license text: ' + manifest.name);
  const texts = [];
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
    packages.push(await packageNotice(path, entry.version));
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
  return { text: lines.join('\n') + '\n', packages: packages.length };
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
