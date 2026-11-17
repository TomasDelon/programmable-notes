import mdx from '@mdx-js/rollup';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vitest/config';

export default defineConfig({
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
});
