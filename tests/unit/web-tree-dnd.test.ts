import { describe, it, expect } from 'vitest';
import {
  createWebState,
  createDocument,
  addFolder,
  orderedChildren,
  repositionTreeEntry,
  parseBackup,
  serializeBackup,
  validateWebState,
} from '../../src/web/workspace';

const folder = (id: string) => ({ kind: 'folder' as const, id });
const document = (id: string) => ({ kind: 'document' as const, id });

describe('drag/drop tree model', () => {
  it('keeps mixed files and folders in one stable, reloadable sibling order', () => {
    let state = addFolder(createWebState(1), 'Projects');
    const a = createDocument(state, 'Alpha', 'Projects');
    state = a.state;
    const b = createDocument(state, 'Beta', 'Projects');
    state = b.state;
    state = addFolder(state, 'Projects/Math');
    const id = (root: typeof state, parent: string) =>
      orderedChildren(root, parent).map(
        (n) => n.kind + ':' + (n.kind === 'folder' ? n.id : n.id),
      );
    expect(id(state, 'Projects')).toEqual([
      'document:' + a.key,
      'document:' + b.key,
      'folder:Projects/Math',
    ]);
    state = repositionTreeEntry(
      state,
      folder('Projects/Math'),
      document(a.key),
      'before',
    );
    state = repositionTreeEntry(
      state,
      document(b.key),
      document(a.key),
      'before',
    );
    expect(id(state, 'Projects')).toEqual([
      'folder:Projects/Math',
      'document:' + b.key,
      'document:' + a.key,
    ]);
    const saved = parseBackup(serializeBackup(state));
    expect(id(saved, 'Projects')).toEqual(id(state, 'Projects'));
    expect(validateWebState(saved)).toBe(saved);
  });

  it('moves a note into and out of folders without changing its source identity or recents', () => {
    let state = addFolder(createWebState(1), 'Study');
    const key = state.workspace.selected;
    const oldSource = state.workspace.files[key];
    const oldRecent = [...state.recentIds];
    state = repositionTreeEntry(state, document(key), folder('Study'), 'into');
    expect(state.documents[key]!.folder).toBe('Study');
    expect(state.workspace.files[key]).toBe(oldSource);
    expect(state.recentIds).toEqual(oldRecent);
    expect(orderedChildren(state, 'Study')).toContainEqual(document(key));
    state = repositionTreeEntry(state, document(key), null, 'into');
    expect(state.documents[key]!.folder).toBe('');
    expect(orderedChildren(state, '')).toContainEqual(document(key));
  });

  it('moves an entire folder tree while preserving stable file keys, code and relative module imports', () => {
    let state = addFolder(createWebState(1), 'A/Sub/Deep');
    state = addFolder(state, 'B');
    const created = createDocument(state, 'Nested', 'A/Sub/Deep');
    state = created.state;
    const key = created.key;
    state = {
      ...state,
      workspace: {
        ...state.workspace,
        files: {
          ...state.workspace.files,
          [key]: 'import X from "./X.tsx"\\n<X />',
        },
      },
    };
    const before = { ...state.workspace.files };
    state = repositionTreeEntry(state, folder('A'), folder('B'), 'into');
    expect(state.folders).toEqual(
      expect.arrayContaining(['B/A', 'B/A/Sub', 'B/A/Sub/Deep']),
    );
    expect(state.folders).not.toContain('A/Sub');
    expect(state.documents[key]!.folder).toBe('B/A/Sub/Deep');
    expect(state.workspace.files).toEqual(before);
    expect(orderedChildren(state, 'B')).toContainEqual(folder('B/A'));
    expect(orderedChildren(state, 'B/A/Sub/Deep')).toContainEqual(
      document(key),
    );
    expect(parseBackup(serializeBackup(state))).toEqual(state);
  });

  it('rejects cycles, path collisions, stale targets and corrupted order safely', () => {
    let s = addFolder(createWebState(1), 'A/Sub');
    s = addFolder(s, 'B/A');
    expect(() =>
      repositionTreeEntry(s, folder('A'), folder('A/Sub'), 'into'),
    ).toThrow(/descendants/);
    expect(() =>
      repositionTreeEntry(s, folder('A'), folder('B'), 'into'),
    ).toThrow(/already exists/);
    expect(() => repositionTreeEntry(s, folder('ghost'), null, 'into')).toThrow(
      /unavailable/,
    );
    expect(() =>
      repositionTreeEntry(
        s,
        document(s.workspace.selected),
        document('unknown'),
        'before',
      ),
    ).toThrow(/unavailable/);
    expect(() => validateWebState({ ...s, treeOrder: ['f:A', 'f:A'] })).toThrow(
      /tree order/,
    );
    expect(() => validateWebState({ ...s, treeOrder: ['f:missing'] })).toThrow(
      /tree order/,
    );
  });

  it('supports ordering among nested siblings and preserves legacy workspaces', () => {
    let s = addFolder(createWebState(1), 'A/B');
    const n1 = createDocument(s, 'One', 'A/B');
    s = n1.state;
    const n2 = createDocument(s, 'Two', 'A/B');
    s = n2.state;
    expect(s.treeOrder).toBeUndefined();
    s = repositionTreeEntry(s, document(n2.key), document(n1.key), 'before');
    expect(orderedChildren(s, 'A/B')).toEqual([
      document(n2.key),
      document(n1.key),
    ]);
    const third = createDocument(s, 'Three', 'A/B');
    expect(orderedChildren(third.state, 'A/B')).toEqual([
      document(n2.key),
      document(n1.key),
      document(third.key),
    ]);
  });
});
