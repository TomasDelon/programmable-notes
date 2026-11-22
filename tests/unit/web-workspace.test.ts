import { describe, expect, it } from 'vitest';
import { compilerFiles } from '../../src/documents/workspace';
import {
  addRecent,
  createDocument,
  createWebState,
  importSources,
  moveDocument,
  parseBackup,
  renameDocument,
  restoreDocument,
  selectDocument,
  serializeBackup,
  trashDocument,
  updateDocumentSource,
  validateWebState,
} from '../../src/web/workspace';

describe('web workspace identity and source fidelity', () => {
  it('keeps stable Recent order, removes only the shortcut, and appends reopened removals', () => {
    let state = createWebState(1);
    const first = state.workspace.selected;
    const created = createDocument(state, 'Second');
    state = created.state;
    expect(state.recentIds).toEqual([first, created.key]);
    state = selectDocument(state, first);
    expect(state.recentIds).toEqual([first, created.key]);
    state = {
      ...state,
      recentIds: state.recentIds.filter((key) => key !== first),
    };
    expect(state.workspace.files[first]).toBeDefined();
    state = selectDocument(state, first);
    expect(state.recentIds).toEqual([created.key, first]);
    expect(
      addRecent(
        Array.from({ length: 30 }, (_, i) => `${i}`),
        'next',
      ),
    ).toHaveLength(30);
  });

  it('changes display names and folders without rewriting imported module paths or bytes', () => {
    const source =
      '\uFEFFimport Value from "./widgets/Value.tsx"\r\n\n<Value />\r\n';
    let state = importSources(createWebState(1), [
      { logicalPath: 'course/Note.mdx', source },
      {
        logicalPath: 'course/widgets/Value.tsx',
        source: 'export default () => <span>é ∑</span>\r\n',
      },
    ]);
    const key = state.workspace.selected;
    const originalFiles = { ...state.workspace.files };
    state = renameDocument(state, key, 'A new title');
    state = moveDocument(state, key, 'Math/Analysis');
    expect(state.workspace.files).toEqual(originalFiles);
    expect(state.documents[key]!.folder).toBe('Math/Analysis');
    expect(state.folders).toContain('Math');
    expect(Object.keys(compilerFiles(state.workspace))).toEqual([
      key,
      `${state.workspace.groups[key]}/course/widgets/Value.tsx`,
    ]);
    expect(parseBackup(serializeBackup(state))).toEqual(state);
    expect(state.workspace.files[key]).toBe(source);
  });

  it('supports a catalog larger than a single compile group while preserving group isolation', () => {
    let state = createWebState(1);
    for (let i = 0; i < 40; i++)
      state = createDocument(state, `Note ${i}`).state;
    expect(Object.keys(state.workspace.files)).toHaveLength(42);
    expect(Object.keys(compilerFiles(state.workspace))).toHaveLength(1);
    const before = parseBackup(serializeBackup(state));
    expect(() =>
      importSources(
        state,
        Array.from({ length: 33 }, (_, i) => ({
          logicalPath: `${i}.mdx`,
          source: '',
        })),
      ),
    ).toThrow('32');
    expect(parseBackup(serializeBackup(state))).toEqual(before);
  });

  it('keeps trashed source recoverable and always leaves a live MDX entry', () => {
    let state = createWebState(1);
    const key = state.workspace.selected;
    const source = state.workspace.files[key];
    state = trashDocument(state, key, 100);
    expect(state.workspace.files[key]).toBe(source);
    expect(state.documents[key]!.trashedAt).toBe(100);
    expect(state.workspace.selected).not.toBe(key);
    const remainingEntry = state.workspace.entry;
    state = trashDocument(state, remainingEntry, 101);
    expect(state.workspace.entry).not.toBe(remainingEntry);
    expect(validateWebState(state)).toBe(state);
    state = restoreDocument(state, key);
    expect(state.documents[key]!.trashedAt).toBeUndefined();
    expect(state.workspace.selected).toBe(key);
    expect(state.workspace.files[key]).toBe(source);
  });
});

describe('untrusted backup and import validation', () => {
  it('rejects unknown schemas, native grants, malformed metadata, prototype keys, and duplicate paths', () => {
    expect(() => parseBackup('not json')).toThrow('valid JSON');
    expect(() => parseBackup('{"format":"other","version":1}')).toThrow(
      'workspace backup',
    );
    const state = createWebState(1);
    expect(() => validateWebState({ ...state, version: 9 })).toThrow(
      'Unsupported',
    );
    expect(() =>
      validateWebState({
        ...state,
        workspace: {
          ...state.workspace,
          bindings: { file: { id: 'native-grant' } },
        },
      }),
    ).toThrow('native file grants');
    expect(() => validateWebState({ ...state, documents: {} })).toThrow(
      'metadata',
    );
    expect(() =>
      importSources(state, [{ logicalPath: '../outside.mdx', source: '' }]),
    ).toThrow('TypeScript files');
    expect(() =>
      importSources(state, [{ logicalPath: '__proto__/note.mdx', source: '' }]),
    ).toThrow('TypeScript files');
    expect(() =>
      importSources(state, [
        { logicalPath: 'note.mdx', source: 'First' },
        { logicalPath: 'note.mdx', source: 'Second' },
      ]),
    ).toThrow('duplicate');
  });

  it('counts UTF-8 bytes, not JavaScript character count, before publishing an oversized update', () => {
    const state = createWebState(1);
    const key = state.workspace.selected;
    const before = state.workspace.files[key];
    expect(() => updateDocumentSource(state, key, 'é'.repeat(250_001))).toThrow(
      '500 KB',
    );
    expect(state.workspace.files[key]).toBe(before);
    expect(
      updateDocumentSource(state, key, 'é'.repeat(250_000)).workspace.files[
        key
      ],
    ).toHaveLength(250_000);
  });

  it('refuses a backup that attempts to join unrelated sources into another import group', () => {
    const state = createWebState(1);
    const [first, second] = Object.keys(state.workspace.files);
    expect(() =>
      validateWebState({
        ...state,
        workspace: {
          ...state.workspace,
          groups: {
            ...state.workspace.groups,
            [second!]: state.workspace.groups[first!],
          },
        },
      }),
    ).toThrow('compiler group');
  });

  it('rejects unreachable folder trees and backups whose escaped JSON cannot be imported again', () => {
    const state = createWebState(1);
    const key = state.workspace.selected;
    expect(() =>
      validateWebState({
        ...state,
        folders: [...state.folders, 'Missing/Child'],
        documents: {
          ...state.documents,
          [key]: { ...state.documents[key]!, folder: 'Missing/Child' },
        },
      }),
    ).toThrow('parent folders');
    const files = { ...state.workspace.files };
    const groups = { ...state.workspace.groups };
    const documents = { ...state.documents };
    for (let i = 0; i < 12; i++) {
      const path = `escaped-${i}/note.mdx`;
      files[path] = '\u0000'.repeat(500_000);
      groups[path] = `escaped-${i}`;
      documents[path] = {
        title: `Escaped ${i}`,
        folder: '',
        created: 1,
        updated: 1,
      };
    }
    expect(() =>
      validateWebState({
        ...state,
        workspace: { ...state.workspace, files, groups },
        documents,
      }),
    ).toThrow('backup exceeds the 32 MiB');
  });
});
