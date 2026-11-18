import { describe, it, expect } from 'vitest';
import {
  initialWorkspace,
  addDocuments,
  compilerFiles,
  completeSave,
  isDirty,
  removeDocument,
  validateFiles,
} from '../../src/documents/workspace';
describe('authorized document workspace', () => {
  it('isolates separately opened note groups while preserving explicitly selected modules', () => {
    let s = initialWorkspace({ 'note.mdx': 'old' }, 'note.mdx');
    s = addDocuments(s, [
      { logicalPath: 'note.mdx', source: 'import C from "./widgets/C.tsx"' },
      { logicalPath: 'widgets/C.tsx', source: 'export default()=>null' },
    ]);
    const before = s.entry;
    s = addDocuments(s, [{ logicalPath: 'private.mdx', source: 'secret' }]);
    expect(compilerFiles(s)).toEqual({ 'opened-2/private.mdx': 'secret' });
    s = { ...s, entry: before };
    expect(Object.keys(compilerFiles(s))).toEqual([
      'opened-1/note.mdx',
      'opened-1/widgets/C.tsx',
    ]);
  });
  it('an asynchronous save only marks its captured snapshot saved', () => {
    let s = initialWorkspace({ 'note.mdx': 'old' }, 'note.mdx');
    s = {
      ...s,
      files: { 'note.mdx': 'first edit' },
      bindings: {
        'note.mdx': { id: 'grant', revision: '1', name: 'note.mdx' },
      },
    };
    const snapshot = s.files['note.mdx']!;
    s = { ...s, files: { 'note.mdx': 'later edit' } };
    s = completeSave(
      s,
      'note.mdx',
      snapshot,
      { id: 'grant', revision: '2', name: 'note.mdx' },
      'grant',
    );
    expect(isDirty(s)).toBe(true);
    expect(s.saved['note.mdx']).toBe('first edit');
    expect(s.bindings['note.mdx']?.revision).toBe('2');
  });
  it('ignores a late save after its original grant was replaced', () => {
    const s = {
      ...initialWorkspace({ 'note.mdx': 'current' }, 'note.mdx'),
      bindings: { 'note.mdx': { id: 'new', revision: '3', name: 'new.mdx' } },
    };
    expect(
      completeSave(
        s,
        'note.mdx',
        'stale',
        { id: 'old', revision: '2', name: 'old.mdx' },
        'old',
      ),
    ).toBe(s);
  });
  it('does not mutate buffers on a rejected batch and retains dirty siblings on close', () => {
    let s = initialWorkspace({ 'a.mdx': 'a', 'b.mdx': 'b' }, 'a.mdx');
    s = { ...s, files: { ...s.files, 'a.mdx': 'unsaved' } };
    expect(() =>
      addDocuments(s, [{ logicalPath: '../escape.mdx', source: 'bad' }]),
    ).toThrow();
    expect(() =>
      addDocuments(s, [
        { logicalPath: 'same.mdx', source: 'a' },
        { logicalPath: 'same.mdx', source: 'b' },
      ]),
    ).toThrow();
    const next = removeDocument(s, 'b.mdx');
    expect(next.files['a.mdx']).toBe('unsaved');
    expect(isDirty(next)).toBe(true);
  });
  it('counts UTF-8 bytes and bounds aggregate sources', () => {
    expect(() => validateFiles({ 'large.mdx': 'é'.repeat(250001) })).toThrow(
      /500 KB/,
    );
    expect(() =>
      validateFiles(
        Object.fromEntries(
          Array.from({ length: 18 }, (_, i) => [
            `${i}.mdx`,
            'x'.repeat(500000),
          ]),
        ),
      ),
    ).toThrow(/8 MiB/);
  });
});
