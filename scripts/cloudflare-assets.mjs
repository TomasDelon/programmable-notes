import { access, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { cloudflareHeaders } from './cloudflare-config.ts';

const root = resolve('dist');
await access(resolve(root, 'index.html'));
await writeFile(resolve(root, '_headers'), cloudflareHeaders());
console.log('Prepared Cloudflare Pages static response policies');
