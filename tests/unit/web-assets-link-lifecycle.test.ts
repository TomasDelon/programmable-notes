import { describe, expect, it } from 'vitest';
import {
  addFolder,
  createDocument,
  createWebState,
  moveDocument,
  renameDocument,
  repositionTreeEntry,
  trashDocument,
  updateDocumentSource,
} from '../../src/web/workspace';

describe('atomic note identity and wikilink transactions', () => {
  it('preserves the compiler file map identity for metadata-only renames and moves', () => {
    const state = createWebState(1);
    const key = state.workspace.selected;
    const renamed = renameDocument(state, key, 'New metadata title');
    expect(renamed.workspace.files).toBe(state.workspace.files);
    expect(renamed.workspace).toBe(state.workspace);
    expect(renamed.documents[key]!.title).toBe('New metadata title');
    const moved = moveDocument(renamed, key, 'New folder');
    expect(moved.workspace.files).toBe(state.workspace.files);
    expect(moved.workspace).toBe(state.workspace);
  });
  it('renames active and trashed references while preserving aliases, opaque syntax and exact surrounding source', () => {
    let state = createWebState(1);
    const origin = state.workspace.selected;
    const target = createDocument(state, 'Target');
    state = target.state;
    const source =
      '\uFEFFbefore\r\n[[Target|label]] and [[Target]]\n\x60[[Target]]\x60 and $[[Target]]$\r\n';
    state = updateDocumentSource(state, origin, source);
    const trashed = createDocument(state, 'Trashed');
    state = updateDocumentSource(trashed.state, trashed.key, '[[Target]]');
    state = trashDocument(state, trashed.key);
    const originalKeys = Object.keys(state.workspace.files);
    const renamed = renameDocument(state, target.key, 'New title');
    expect(renamed.workspace.files[origin]).toBe(
      '\uFEFFbefore\r\n[[New title|label]] and [[New title]]\n\x60[[Target]]\x60 and $[[Target]]$\r\n',
    );
    expect(renamed.workspace.files[trashed.key]).toBe('[[New title]]');
    expect(renamed.documents[trashed.key]!.trashedAt).toBeDefined();
    expect(Object.keys(renamed.workspace.files)).toEqual(originalKeys);
    expect(state.workspace.files[origin]).toBe(source);
  });

  it('updates folder-qualified references on note move and nested folder drag', () => {
    let state = createWebState(1);
    const origin = state.workspace.selected;
    const target = createDocument(state, 'Target', 'Old/Sub');
    state = updateDocumentSource(
      target.state,
      origin,
      '[[Old/Sub/Target|alias]]',
    );
    const moved = moveDocument(state, target.key, 'Elsewhere');
    expect(moved.workspace.files[origin]).toBe('[[Elsewhere/Target|alias]]');
    state = addFolder(state, 'New');
    const dragged = repositionTreeEntry(
      state,
      { kind: 'folder', id: 'Old' },
      { kind: 'folder', id: 'New' },
      'into',
    );
    expect(dragged.workspace.files[origin]).toBe(
      '[[New/Old/Sub/Target|alias]]',
    );
    expect(dragged.documents[target.key]!.folder).toBe('New/Old/Sub');
  });

  it('refuses a rename collision without modifying metadata or linked source', () => {
    let state = createWebState(1);
    const origin = state.workspace.selected;
    const first = createDocument(state, 'A');
    state = createDocument(first.state, 'B').state;
    state = updateDocumentSource(state, origin, '[[A]]');
    expect(() => renameDocument(state, first.key, 'B')).toThrow('ambiguous');
    expect(state.documents[first.key]!.title).toBe('A');
    expect(state.workspace.files[origin]).toBe('[[A]]');
  });

  it('requires ambiguous pre-existing references to be qualified before choosing a target', () => {
    let state = createWebState(1);
    const origin = state.workspace.selected;
    const first = createDocument(state, 'A', 'One');
    state = createDocument(first.state, 'A', 'Two').state;
    state = updateDocumentSource(state, origin, '[[A]]');
    expect(() => renameDocument(state, first.key, 'New A')).toThrow(
      'ambiguous',
    );
  });

  it('fails closed if a potentially linked MDX source cannot be parsed', () => {
    let state = createWebState(1);
    const origin = state.workspace.selected;
    const target = createDocument(state, 'Target');
    state = updateDocumentSource(target.state, origin, '[[Target]]\n\n<Broken');
    expect(() => renameDocument(state, target.key, 'Renamed')).toThrow(
      'syntax',
    );
    expect(state.workspace.files[origin]).toBe('[[Target]]\n\n<Broken');
  });
});
