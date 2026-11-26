import { expect, it } from 'vitest';
import { shouldCompileWholeDocument } from '../../src/web/previewExecution';

it('keeps live whole-document diagnostics in Source mode', () => {
  expect(shouldCompileWholeDocument(true, 'source', false)).toBe(true);
});
it('runs an explicitly requested whole-document preview', () => {
  expect(shouldCompileWholeDocument(true, 'preview', true)).toBe(true);
});
it('does not compile an unused whole document behind editable islands', () => {
  expect(shouldCompileWholeDocument(true, 'preview', false)).toBe(false);
});
it('never compiles when the trusted React core module is disabled', () => {
  expect(shouldCompileWholeDocument(false, 'source', false)).toBe(false);
  expect(shouldCompileWholeDocument(false, 'preview', true)).toBe(false);
});
