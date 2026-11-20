/** External fixtures/launchers only; installed application receives no test API. */
import { mkdtemp, writeFile, mkdir, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import process from 'node:process';
const root = await mkdtemp(join(tmpdir(), 'pn-native-'));
const installed = resolve(
  process.env.NATIVE_INSTALLED_BINARY || '/usr/bin/programmable-notes',
);
const quote = (s) => `'${s.replaceAll("'", "'\\''")}'`;
await mkdir(join(root, 'evidence'));
await writeFile(
  join(root, 'probe.html'),
  '<!doctype html><p>Trusted native ACL probe</p>',
);
await writeFile(
  join(root, 'editor-driver'),
  `#!/bin/sh\nprintf '%s\\n' "$$" > ${quote(join(root, 'editor.pid'))}\nexec ${quote(installed)} "$@"\n`,
  { mode: 0o700 },
);
await writeFile(
  join(root, 'preview-driver'),
  `#!/bin/sh\nexec ${quote(installed)} --preview-child < ${quote(join(root, 'probe.html'))}\n`,
  { mode: 0o700 },
);
const env = {
  NATIVE_BINARY: join(root, 'editor-driver'),
  NATIVE_PREVIEW_WRAPPER: join(root, 'preview-driver'),
  NATIVE_PID_FILE: join(root, 'editor.pid'),
  NATIVE_FIXTURE_DIR: root,
  NATIVE_EVIDENCE_DIR: join(root, 'evidence'),
};
await writeFile(
  join(root, 'env.sh'),
  Object.entries(env)
    .map(([key, value]) => `export ${key}=${quote(value)}`)
    .join('\n') + '\n',
  { mode: 0o600 },
);
await writeFile(
  join(root, 'manifest.json'),
  JSON.stringify({ installed, ...env }, null, 2) + '\n',
);
await copyFile(
  'docs/handoff/samples/fixtures/counter.mdx',
  join(root, 'original.mdx'),
);
console.log(join(root, 'env.sh'));
