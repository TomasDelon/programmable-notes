import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv, normalizePath } from 'vite';
import { resolve } from 'node:path';
import { privateDevCacheDeny } from './scripts/dev-cache-policy.ts';
import { storageMode } from './src/web/storageMode.ts';

export default defineConfig(({ mode }) => {
  storageMode(loadEnv(mode, process.cwd(), 'VITE_').VITE_STORAGE_BACKEND);
  return {
    server: {
      fs: {
        // Custom arrays replace Vite defaults: retain them here. The post-config
        // hook anchors private cache policy to the actual configured project root.
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key,p12,pfx,cer,der}',
          '.npmrc',
          '.yarnrc.yml',
          '**/.git/**',
          '**/public-audit/**',
        ],
      },
    },
    resolve: {
      conditions: ['worker', 'module', 'browser', 'development|production'],
    },
    plugins: [
      {
        name: 'private-dev-cache',
        config: {
          order: 'post',
          handler(config) {
            return {
              server: {
                fs: {
                  deny: privateDevCacheDeny(
                    normalizePath(resolve(config.root ?? '.')),
                  ),
                },
              },
            };
          },
        },
      },
      { ...mdx({ include: '**/src/**/*.mdx' }), enforce: 'pre' },
      react({ include: /\.(jsx|tsx|mdx)$/ }),
    ],
    test: {
      environment: 'jsdom',
      setupFiles: ['./tests/setup.ts'],
      include: ['tests/unit/**/*.test.{ts,tsx}'],
      restoreMocks: true,
    },
  };
});
