import { execFileSync } from 'node:child_process';
import { build } from 'vite';
import { resolve } from 'node:path';

process.env.VITE_STORAGE_BACKEND = 'cloud';
await build({ build: { outDir: '.cache/cloud-acceptance/dist' } });
for (const name of ['cloudflare-assets.mjs', 'web-offline.mjs']) {
  execFileSync(process.execPath, [resolve('scripts', name)], {
    cwd: '.cache/cloud-acceptance',
    stdio: 'inherit',
  });
}
