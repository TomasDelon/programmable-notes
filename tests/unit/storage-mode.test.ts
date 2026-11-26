import { afterEach, expect, it, vi } from 'vitest';

afterEach(() => {
  vi.unstubAllEnvs();
  vi.resetModules();
});

it.each(['cluod', 'Cloud', ' cloud', ''])(
  'rejects a misconfigured storage backend instead of silently using IndexedDB: %s',
  async (value) => {
    vi.resetModules();
    vi.stubEnv('VITE_STORAGE_BACKEND', value);
    await expect(import('../../src/web/storage')).rejects.toThrow(
      'storage backend',
    );
  },
);
