import { expect, it } from 'vitest';
import { resolveFile } from '../../src/compiler/resolve';
it('resolves only explicitly supplied local workspace modules', () => {
  const files = { 'widgets/Counter.tsx': '', 'note.mdx': '' };
  expect(resolveFile('./widgets/Counter', 'note.mdx', files)).toBe(
    'widgets/Counter.tsx',
  );
  expect(() => resolveFile('../private', 'note.mdx', files)).toThrow('escapes');
  for (const path of [
    'node:fs',
    'https://attacker.invalid',
    '/etc/passwd',
    'react/../../secret',
  ])
    expect(() => resolveFile(path, 'note.mdx', files)).toThrow('not permitted');
  expect(() => resolveFile('./missing', 'note.mdx', files)).toThrow('Missing');
});
