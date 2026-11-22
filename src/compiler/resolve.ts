export function resolveFile(
  specifier: string,
  importer: string,
  files: Record<string, string>,
) {
  if (!specifier.startsWith('./') && !specifier.startsWith('../'))
    throw new Error(`Import not permitted: ${specifier}`);
  const segments = importer.split('/').slice(0, -1);
  for (const part of specifier.split('/')) {
    if (part === '..') {
      if (!segments.length) throw new Error('Import escapes workspace');
      segments.pop();
    } else if (part !== '.') segments.push(part);
  }
  const path = segments.join('/');
  const found = [
    path,
    `${path}.tsx`,
    `${path}.ts`,
    `${path}.jsx`,
    `${path}.js`,
    `${path}.mdx`,
  ].find((p) => Object.hasOwn(files, p));
  if (!found) throw new Error(`Missing workspace module: ${path}`);
  return found;
}
