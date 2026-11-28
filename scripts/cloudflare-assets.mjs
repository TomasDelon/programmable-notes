import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflareHeaders } from './cloudflare-config.ts';

const root = resolve('dist');
await access(resolve(root, 'index.html'));
await writeFile(resolve(root, '_headers'), cloudflareHeaders());
await writeFile(
  resolve(root, '_routes.json'),
  JSON.stringify({
    version: 1,
    include: ['/api/storage', '/api/storage/*'],
    exclude: [],
  }) + '\n',
);
console.log('Prepared Cloudflare Pages static response policies');
