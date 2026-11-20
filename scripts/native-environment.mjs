/** Poison only the disposable user manager, then inspect actual production child. */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { readFile, writeFile, access } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import {
  preflight,
  launch,
  close,
  invoke,
  artifact,
  systemctl,
} from './native-webdriver-lib.mjs';
import { button, waitUi } from './native-ui-lib.mjs';
await preflight();
assert.ok(
  process.env.NATIVE_FIXTURE_DIR,
  'Run only in a disposable test user session',
);
const root = process.env.NATIVE_FIXTURE_DIR;
const sentinel = join(root, 'preload-executed');
const library = join(root, 'preload-probe.so');
const source = join(root, 'preload-probe.c');
await writeFile(
  source,
  `#include <fcntl.h>\n#include <unistd.h>\n__attribute__((constructor)) static void probe(void){int f=open(${JSON.stringify(sentinel)},O_CREAT|O_WRONLY,0600);if(f>=0)close(f);}\n`,
);
execFileSync('cc', ['-shared', '-fPIC', '-o', library, source]);
const poison = {
  PN_PRIVATE_TEST_SECRET: 'disposable-fixture-only',
  TAURI_WEBVIEW_AUTOMATION: 'true',
  TAURI_AUTOMATION: 'true',
  WEBKIT_DISABLE_SANDBOX_THIS_IS_DANGEROUS: '1',
  WEBKIT_INSPECTOR_SERVER: '127.0.0.1:9223',
  LD_PRELOAD: library,
};
const previous = new Map(
  systemctl('show-environment')
    .split('\n')
    .map((line) => {
      const i = line.indexOf('=');
      return [line.slice(0, i), line.slice(i + 1)];
    }),
);
const html = await artifact('# Clean supervised environment');
try {
  await launch();
  await waitUi(`Boolean(document.querySelector('.cm-content'))`);
  await button('Stop preview');
  assert.equal((await invoke('stop_preview')).ok, true);
  systemctl(
    'set-environment',
    ...Object.entries(poison).map(([k, v]) => `${k}=${v}`),
  );
  const reply = await invoke('start_preview', { html });
  assert.equal(reply.ok, true, JSON.stringify(reply));
  const pid = systemctl('show', '--property=MainPID', '--value', reply.value);
  const actual = (await readFile(`/proc/${pid}/environ`, 'utf8')).split('\0');
  for (const key of Object.keys(poison)) {
    if (key.startsWith('TAURI_')) assert.ok(actual.includes(`${key}=false`));
    else
      assert.ok(
        !actual.some((v) => v.startsWith(`${key}=`)),
        `Leaked manager environment key ${key}`,
      );
  }
  await assert.rejects(access(sentinel), { code: 'ENOENT' });
  console.log(
    'PRODUCTION_ENVIRONMENT_PASS',
    JSON.stringify({
      unit: reply.value,
      pid,
      automation: false,
      preloadConstructorExecuted: false,
      secretAbsent: true,
      inspectorAbsent: true,
      sandboxDisableAbsent: true,
    }),
  );
} finally {
  systemctl('unset-environment', ...Object.keys(poison));
  const restore = Object.keys(poison)
    .filter((k) => previous.has(k))
    .map((k) => `${k}=${previous.get(k)}`);
  if (restore.length) systemctl('set-environment', ...restore);
  try {
    await invoke('stop_preview');
  } catch {
    /* preserve primary failure */
  }
  await close();
}
