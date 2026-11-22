import { mkdir, readFile, writeFile } from 'node:fs/promises';
import path from 'node:path';

// Keep the opaque document frame fully offline. Only pinned package fonts are
// embedded; authored content cannot choose a fetchable font URL.
const root = process.cwd();
const katexRoot = path.join(root, 'node_modules/katex/dist');
const fontRoot = path.join(root, 'node_modules/@fontsource-variable/dm-sans');

async function inlineFontSources(css, directory) {
  const replacements = new Map();
  for (const match of css.matchAll(/src:([^;}]+)/g)) {
    const source = match[1];
    const url = source.match(
      /url\((?:['"])?([^)'"\s]+\.woff2)(?:['"])?\)/,
    )?.[1];
    if (!url || !/^(?:\.\/)?(?:files|fonts)\/[\w-]+\.woff2$/.test(url))
      throw new Error('Unexpected source in bundled font stylesheet.');
    const bytes = await readFile(path.join(directory, url));
    replacements.set(
      match[0],
      `src:url(data:font/woff2;base64,${bytes.toString('base64')}) format('woff2')`,
    );
  }
  for (const [source, replacement] of replacements)
    css = css.replaceAll(source, replacement);
  if (/url\((?!data:)/.test(css))
    throw new Error('Unbundled URL in preview fonts.');
  return css;
}

const katex = await inlineFontSources(
  await readFile(path.join(katexRoot, 'katex.min.css'), 'utf8'),
  katexRoot,
);
const regular = await inlineFontSources(
  await readFile(path.join(fontRoot, 'index.css'), 'utf8'),
  fontRoot,
);
const italic = await inlineFontSources(
  await readFile(path.join(fontRoot, 'wght-italic.css'), 'utf8'),
  fontRoot,
);
await mkdir(path.join(root, '.cache'), { recursive: true });
await writeFile(
  path.join(root, '.cache/web-fonts.txt'),
  `${regular}\n${italic}\n${katex}`,
);
