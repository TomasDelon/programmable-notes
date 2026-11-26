import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';
import { loadEnv } from 'vite';
import { storageMode } from './src/web/storageMode.ts';

export default defineConfig(({ mode }) => {
  storageMode(loadEnv(mode, process.cwd(), 'VITE_').VITE_STORAGE_BACKEND);
  return {
    server: {
      fs: {
        // Custom arrays replace Vite defaults: preserve them, then protect private
        // audit output even when a developer explicitly enables network serving.
        deny: [
          '.env',
          '.env.*',
          '*.{crt,pem,key,p12,pfx,cer,der}',
          '.npmrc',
          '.yarnrc.yml',
          '**/.git/**',
          '**/public-audit/**',
          '**/.cache/security-scan-*/**',
        ],
      },
    },
    resolve: {
      conditions: ['worker', 'module', 'browser', 'development|production'],
    },
    plugins: [
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
