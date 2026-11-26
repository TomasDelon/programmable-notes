import {
  validCorePluginSettings,
  validPreviewPreferences,
  type CorePluginSettings,
  type PreviewPreferences,
} from '../plugins/coreRegistry';
import type { Workspace } from '../documents/workspace';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
} from '../documents/workspace';
import { isMdxSource, isSupportedSource } from '../sourceTypes';
import { validateAssetCatalog, type AssetCatalog } from '../assets/catalog';
import { buildLinkCatalog, resolveWithCatalog } from '../links/resolve';
import { parseSourceWikilinks } from '../links/workspaceLinks';

export const MAX_DOCUMENTS = 1_000;
export const MAX_WORKSPACE_BYTES = 24 * 1024 * 1024;
export const MAX_BACKUP_BYTES = 32 * 1024 * 1024;
export const MAX_RECENT = 30;

export interface DocumentMetadata {
  title: string;
  folder: string;
  created: number;
  updated: number;
  trashedAt?: number;
}

export interface WebState {
  version: 1;
  corePlugins?: CorePluginSettings;
  previewPreferences?: PreviewPreferences;
  workspace: Workspace;
  documents: Record<string, DocumentMetadata>;
  folders: string[];
  recentIds: string[];
  /** Stable mixed folder/note order; absent for older workspaces and backups. */
  treeOrder?: string[];
  theme: 'light' | 'dark';
  mode: 'source' | 'live' | 'preview';
  /** Original attachment bytes; absent in legacy workspaces. Retained across Trash/recovery. */
  assets?: AssetCatalog;
}

export interface ImportedSource {
  logicalPath: string;
  source: string;
}

export type TreeEntry = { kind: 'folder' | 'document'; id: string };
export type TreePlacement = 'before' | 'after' | 'into';

export function treeEntryId(item: TreeEntry): string {
  return (item.kind === 'folder' ? 'f:' : 'd:') + item.id;
}

export function parentFolder(path: string): string {
  return path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
}

function entryParent(state: WebState, id: string): string {
  if (id.startsWith('f:')) return parentFolder(id.slice(2));
  return state.documents[id.slice(2)]?.folder ?? '';
}

/** Returns a complete order even for legacy workspaces and newly added items. */
export function orderedTreeIds(state: WebState): string[] {
  const known = [
    ...Object.keys(state.documents).map((key) => 'd:' + key),
    ...state.folders.map((folder) => 'f:' + folder),
  ];
  const keys = new Set(known);
  const existing = (state.treeOrder ?? []).filter((id) => keys.has(id));
  const included = new Set(existing);
  return [...existing, ...known.filter((id) => !included.has(id))];
}

export function orderedChildren(state: WebState, folder: string): TreeEntry[] {
  const ordered = orderedTreeIds(state);
  return ordered
    .filter((entry) => entryParent(state, entry) === folder)
    .filter(
      (entry) =>
        !entry.startsWith('d:') || !state.documents[entry.slice(2)]?.trashedAt,
    )
    .map((entry): TreeEntry =>
      entry.startsWith('f:')
        ? { kind: 'folder', id: entry.slice(2) }
        : { kind: 'document', id: entry.slice(2) },
    );
}

/** Reorder any two siblings, or move a note/folder into another folder.
 * Document source keys and compiler-group paths never change. */
export function repositionTreeEntry(
  state: WebState,
  source: TreeEntry,
  target: TreeEntry | null,
  placement: TreePlacement,
): WebState {
  const src = treeEntryId(source);
  assert(
    source.kind === 'folder'
      ? state.folders.includes(source.id)
      : Boolean(
          state.documents[source.id] && !state.documents[source.id]?.trashedAt,
        ),
    'The dragged item is unavailable.',
  );
  assert(
    (target === null && placement === 'into') ||
      (target !== null &&
        (target.kind === 'folder'
          ? state.folders.includes(target.id)
          : Boolean(
              state.documents[target.id] &&
              !state.documents[target.id]?.trashedAt,
            ))),
    'The drop target is unavailable.',
  );
  assert(
    placement !== 'into' || target === null || target.kind === 'folder',
    'Only folders can contain other items.',
  );
  if (target && treeEntryId(target) === src) return state;
  const destination =
    target === null
      ? ''
      : placement === 'into'
        ? target.id
        : target.kind === 'folder'
          ? parentFolder(target.id)
          : state.documents[target.id]!.folder;
  if (source.kind === 'folder') {
    assert(
      destination !== source.id && !destination.startsWith(source.id + '/'),
      'A folder cannot be moved inside itself or its descendants.',
    );
  }
  let updated = state;
  let movedId = src;
  let order = orderedTreeIds(state);
  if (source.kind === 'document') {
    if (state.documents[source.id]!.folder !== destination) {
      updated = {
        ...state,
        documents: {
          ...state.documents,
          [source.id]: {
            ...state.documents[source.id]!,
            folder: destination,
            updated: Date.now(),
          },
        },
      };
    }
  } else {
    const from = source.id;
    const name = from.slice(
      parentFolder(from).length ? parentFolder(from).length + 1 : 0,
    );
    const to = destination ? destination + '/' + name : name;
    if (from !== to) {
      const remap = (path: string) =>
        path === from
          ? to
          : path.startsWith(from + '/')
            ? to + path.slice(from.length)
            : path;
      const renamed = state.folders.map(remap);
      assert(
        renamed.every((path) => validPath(path)) &&
          new Set(renamed).size === renamed.length,
        'This folder name already exists at the destination or the resulting path is invalid.',
      );
      const documents: WebState['documents'] = {};
      for (const [key, meta] of Object.entries(state.documents)) {
        documents[key] = { ...meta, folder: remap(meta.folder) };
      }
      updated = { ...state, folders: renamed, documents };
      order = order.map((id) =>
        id.startsWith('f:') ? 'f:' + remap(id.slice(2)) : id,
      );
      movedId = 'f:' + to;
    }
  }
  order = order.filter((id) => id !== movedId);
  let insertion = order.length;
  if (target && placement !== 'into') {
    const anchor = treeEntryId(target);
    insertion = order.indexOf(anchor);
    assert(insertion !== -1, 'The drop anchor is missing.');
    if (placement === 'after') insertion++;
  } else {
    const childIndices = order
      .map((id, index) =>
        entryParent(updated, id) === destination ? index : -1,
      )
      .filter((index) => index >= 0);
    if (childIndices.length)
      insertion = childIndices[childIndices.length - 1]! + 1;
    else if (target)
      insertion = Math.max(0, order.indexOf(treeEntryId(target)) + 1);
  }
  order.splice(insertion, 0, movedId);
  return preserveWikilinkTargets(
    state,
    validateWebState({ ...updated, treeOrder: order }),
  );
}

const encoder = new TextEncoder();
const forbidden = new Set(['__proto__', 'constructor', 'prototype']);

function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

function hasControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

function validPath(path: string, allowEmpty = false): boolean {
  return (
    (allowEmpty && path === '') ||
    (path.length > 0 &&
      path.length <= 512 &&
      !path.includes('\\') &&
      !hasControlCharacters(path) &&
      path
        .split('/')
        .every((part) =>
          Boolean(
            part && part !== '.' && part !== '..' && !forbidden.has(part),
          ),
        ))
  );
}

export function normalizeFolder(value: string): string {
  const folder = value.trim().replace(/^\/+|\/+$/g, '');
  assert(
    validPath(folder, true),
    'Use a folder name without empty, . or .. segments.',
  );
  return folder;
}

function folderAncestors(folder: string): string[] {
  return folder
    ? folder.split('/').map((_, i, parts) => parts.slice(0, i + 1).join('/'))
    : [];
}

function withFolder(state: WebState, folder: string): string[] {
  return [...new Set([...state.folders, ...folderAncestors(folder)])];
}

export function addRecent(recentIds: string[], key: string): string[] {
  return recentIds.includes(key)
    ? recentIds
    : [...recentIds, key].slice(-MAX_RECENT);
}

function titleText(title: string): string {
  const result = title.trim() || 'Untitled';
  assert(
    result.length <= 200,
    'A document title can contain up to 200 characters.',
  );
  assert(
    !hasControlCharacters(result),
    'A title cannot contain control characters.',
  );
  return result;
}

/** Browser metadata never carries native filesystem grants or saved-source copies. */
export function validateWebState(value: unknown): WebState {
  assert(object(value) && value.version === 1, 'Unsupported workspace format.');
  const workspace = value.workspace;
  assert(object(workspace), 'Workspace source catalog is missing.');
  const { files, groups, saved, bindings } = workspace;
  assert(
    object(files) && object(groups) && object(saved) && object(bindings),
    'Workspace source maps are invalid.',
  );
  assert(
    Object.keys(saved).length === 0 && Object.keys(bindings).length === 0,
    'A web workspace cannot restore native file grants.',
  );
  const keys = Object.keys(files);
  assert(
    keys.length > 0 && keys.length <= MAX_DOCUMENTS,
    `A workspace can contain up to ${MAX_DOCUMENTS} documents.`,
  );
  assert(object(value.documents), 'Document metadata is missing.');
  const documents = value.documents;
  assert(
    Object.keys(documents).length === keys.length,
    'Document metadata does not match the source catalog.',
  );
  assert(
    Object.keys(groups).length === keys.length,
    'Compiler groups do not match the source catalog.',
  );
  const groupSizes = new Map<string, { count: number; bytes: number }>();
  let total = 0;
  for (const key of keys) {
    assert(
      validPath(key) && isSupportedSource(key),
      'A source has an unsupported path or extension.',
    );
    const source = files[key];
    assert(typeof source === 'string', 'Every source must be text.');
    const bytes = encoder.encode(source).byteLength;
    assert(bytes <= MAX_FILE_BYTES, 'A source exceeds the 500 KB limit.');
    total += bytes;
    const group = groups[key];
    assert(
      typeof group === 'string' &&
        validPath(group) &&
        !group.includes('/') &&
        key.startsWith(`${group}/`),
      'Invalid compiler group.',
    );
    const size = groupSizes.get(group) ?? { count: 0, bytes: 0 };
    size.count++;
    size.bytes += bytes;
    assert(
      size.count <= MAX_FILES && size.bytes <= MAX_TOTAL_BYTES,
      'A connected source group exceeds 32 files or 8 MiB.',
    );
    groupSizes.set(group, size);
    const metadata = documents[key];
    assert(object(metadata), 'A document has no metadata.');
    assert(
      typeof metadata.title === 'string' &&
        titleText(metadata.title) === metadata.title,
      'Invalid document title.',
    );
    assert(
      typeof metadata.folder === 'string' && validPath(metadata.folder, true),
      'Invalid document folder.',
    );
    for (const field of ['created', 'updated', 'trashedAt']) {
      const timestamp = metadata[field];
      assert(
        (field === 'trashedAt' && timestamp === undefined) ||
          (typeof timestamp === 'number' &&
            Number.isFinite(timestamp) &&
            timestamp >= 0),
        'Invalid document timestamp.',
      );
    }
  }
  assert(
    total <= MAX_WORKSPACE_BYTES,
    'Workspace sources exceed the 24 MiB limit. Export a backup before reducing the catalog.',
  );
  assert(
    Array.isArray(value.folders) &&
      value.folders.length <= MAX_DOCUMENTS * 10 &&
      value.folders.every(
        (folder) => typeof folder === 'string' && validPath(folder),
      ) &&
      new Set(value.folders).size === value.folders.length,
    'Invalid folder catalog.',
  );
  const folders = new Set(value.folders as string[]);
  if (value.treeOrder !== undefined) {
    const validItems = new Set([
      ...Object.keys(documents).map((key) => 'd:' + key),
      ...Array.from(folders, (folder) => 'f:' + folder),
    ]);
    assert(
      Array.isArray(value.treeOrder) &&
        value.treeOrder.length <= validItems.size &&
        value.treeOrder.every(
          (id) => typeof id === 'string' && validItems.has(id),
        ) &&
        new Set(value.treeOrder).size === value.treeOrder.length,
      'Invalid document tree order.',
    );
  }
  for (const folder of folders) {
    assert(
      folderAncestors(folder).every((ancestor) => folders.has(ancestor)),
      'A folder is missing one of its parent folders.',
    );
  }
  for (const metadata of Object.values(documents)) {
    assert(
      object(metadata) &&
        (metadata.folder === '' || folders.has(metadata.folder as string)),
      'A document refers to a missing folder.',
    );
  }
  assert(
    typeof workspace.selected === 'string' &&
      Object.hasOwn(files, workspace.selected) &&
      !(documents[workspace.selected] as DocumentMetadata).trashedAt,
    'The selected document is missing or in Trash.',
  );
  assert(
    typeof workspace.entry === 'string' &&
      Object.hasOwn(files, workspace.entry) &&
      isMdxSource(workspace.entry) &&
      !(documents[workspace.entry] as DocumentMetadata).trashedAt,
    'The preview entry is missing or in Trash.',
  );
  assert(
    Number.isSafeInteger(workspace.sequence) &&
      (workspace.sequence as number) >= 0,
    'Invalid document sequence.',
  );
  assert(
    Array.isArray(value.recentIds) &&
      value.recentIds.length <= MAX_RECENT &&
      value.recentIds.every(
        (key) =>
          typeof key === 'string' &&
          Object.hasOwn(files, key) &&
          !(documents[key] as DocumentMetadata).trashedAt,
      ) &&
      new Set(value.recentIds).size === value.recentIds.length,
    'Invalid Recent list.',
  );
  assert(
    value.theme === 'light' || value.theme === 'dark',
    'Invalid appearance.',
  );
  assert(
    value.mode === 'source' ||
      value.mode === 'live' ||
      value.mode === 'preview',
    'Invalid editor mode.',
  );
  assert(
    value.corePlugins === undefined ||
      validCorePluginSettings(value.corePlugins),
    'Invalid core plugin settings.',
  );
  assert(
    value.previewPreferences === undefined ||
      validPreviewPreferences(value.previewPreferences),
    'Invalid preview preferences.',
  );
  if (value.assets !== undefined) validateAssetCatalog(value.assets);
  assert(
    encoder.encode(serializeBackup(value as unknown as WebState)).byteLength <=
      MAX_BACKUP_BYTES,
    'The workspace backup exceeds the 32 MiB limit. Export a backup before reducing the catalog.',
  );
  return value as unknown as WebState;
}

export function createWebState(now = Date.now()): WebState {
  const files = {
    'welcome/Welcome.mdx': `Your notes, with room to think.\n\nWrite Markdown, add mathematics, or turn an idea into a small React experiment.\n\n## Start here\n\n- Write directly in **Preview**, or use **Source** for the original text.\n- Create a note from the left sidebar.\n- Use the command palette with **Ctrl/Cmd + K**.\n- Export a workspace backup from Settings to keep an independent copy.\n\nYour workspace saves automatically in this browser. It is not synchronized between devices.\n\n## A little mathematics\n\nFor a differentiable function $f$, the derivative measures local change:\n\n$$\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\n$$\n\nOpen **React playground** for a live, editable example.\n`,
    'playground/React-playground.mdx': `import { useState } from 'react'\n\nexport function Counter() {\n  const [count, setCount] = useState(0)\n  return (\n    <div style={{display: 'flex', alignItems: 'center', gap: 16, padding: '20px 0'}}>\n      <button onClick={() => setCount(count - 1)} aria-label="Decrease count">−</button>\n      <strong style={{minWidth: 32, textAlign: 'center'}}>{count}</strong>\n      <button onClick={() => setCount(count + 1)} aria-label="Increase count">+</button>\n    </div>\n  )\n}\n\nA small component, right inside your note. The buttons below are live.\n\n<Counter />\n\nSwitch to **Source** to change the component. Changing the component code rebuilds it and resets its temporary state. Ordinary Markdown edits preserve unchanged components.\n\nReact and local JavaScript/TypeScript modules are available. Import related files together to preserve their relative paths.\n`,
  };
  const keys = Object.keys(files);
  return {
    version: 1,
    workspace: {
      files,
      saved: {},
      groups: Object.fromEntries(keys.map((key) => [key, key.split('/')[0]!])),
      bindings: {},
      selected: keys[0]!,
      entry: keys[0]!,
      sequence: 0,
    },
    documents: {
      [keys[0]!]: { title: 'Welcome', folder: '', created: now, updated: now },
      [keys[1]!]: {
        title: 'React playground',
        folder: 'Examples',
        created: now,
        updated: now,
      },
    },
    folders: ['Examples'],
    recentIds: [keys[0]!],
    theme: 'light',
    mode: 'preview',
  };
}

export function selectDocument(state: WebState, key: string): WebState {
  assert(
    Object.hasOwn(state.documents, key) && !state.documents[key]!.trashedAt,
    'This document is unavailable.',
  );
  return {
    ...state,
    workspace: {
      ...state.workspace,
      selected: key,
      entry: isMdxSource(key) ? key : state.workspace.entry,
    },
    recentIds: addRecent(state.recentIds, key),
  };
}

export function createDocument(
  state: WebState,
  title = 'Untitled',
  folder = '',
  now = Date.now(),
  format: 'md' | 'mdx' = 'mdx',
): { state: WebState; key: string } {
  const normalized = normalizeFolder(folder);
  let sequence = state.workspace.sequence;
  let group: string;
  do group = `web-${++sequence}`;
  while (Object.values(state.workspace.groups).includes(group));
  const key = `${group}/note.${format}`;
  const next: WebState = {
    ...state,
    workspace: {
      ...state.workspace,
      files: { ...state.workspace.files, [key]: '' },
      groups: { ...state.workspace.groups, [key]: group },
      selected: key,
      entry: key,
      sequence,
    },
    documents: {
      ...state.documents,
      [key]: {
        title: titleText(title),
        folder: normalized,
        created: now,
        updated: now,
      },
    },
    folders: withFolder(state, normalized),
    recentIds: addRecent(state.recentIds, key),
    mode: 'source',
  };
  return { state: validateWebState(next), key };
}

export function updateDocumentSource(
  state: WebState,
  key: string,
  source: string,
  now = Date.now(),
): WebState {
  assert(
    Object.hasOwn(state.documents, key) && !state.documents[key]!.trashedAt,
    'This document is unavailable.',
  );
  if (state.workspace.files[key] === source) return state;
  return validateWebState({
    ...state,
    workspace: {
      ...state.workspace,
      files: { ...state.workspace.files, [key]: source },
    },
    documents: {
      ...state.documents,
      [key]: { ...state.documents[key]!, updated: now },
    },
  });
}

export function renameDocument(
  state: WebState,
  key: string,
  title: string,
): WebState {
  assert(Object.hasOwn(state.documents, key), 'This document is unavailable.');
  return preserveWikilinkTargets(state, {
    ...state,
    documents: {
      ...state.documents,
      [key]: {
        ...state.documents[key]!,
        title: titleText(title),
        updated: Date.now(),
      },
    },
  });
}

export function moveDocument(
  state: WebState,
  key: string,
  folder: string,
): WebState {
  assert(Object.hasOwn(state.documents, key), 'This document is unavailable.');
  const normalized = normalizeFolder(folder);
  return preserveWikilinkTargets(state, {
    ...state,
    documents: {
      ...state.documents,
      [key]: {
        ...state.documents[key]!,
        folder: normalized,
        updated: Date.now(),
      },
    },
    folders: withFolder(state, normalized),
  });
}

/** Rename/move metadata and every affected source reference as one checked state. */
function preserveWikilinkTargets(before: WebState, after: WebState): WebState {
  const descriptor = (state: WebState) =>
    Object.entries(state.documents).map(([id, meta]) => ({
      id,
      title: meta.title,
      folder: meta.folder,
      trashed: Boolean(meta.trashedAt),
      source: state.workspace.files[id]!,
    }));
  const oldDocuments = descriptor(before);
  const nextDocuments = descriptor(after);
  const changed = oldDocuments.filter((document) => {
    const next = after.documents[document.id];
    return (
      next && (next.title !== document.title || next.folder !== document.folder)
    );
  });
  if (!changed.length) return after;
  const oldCatalog = buildLinkCatalog(oldDocuments);
  const nextCatalog = buildLinkCatalog(nextDocuments);
  const files = { ...after.workspace.files };
  const documents = { ...after.documents };
  let sourceChanged = false;
  for (const origin of oldDocuments) {
    if (!isMdxSource(origin.id) || !origin.source.includes('[[')) continue;
    let spans;
    try {
      spans = parseSourceWikilinks(origin.source, origin.id);
    } catch {
      throw new Error(
        'Fix the Markdown/MDX syntax in linked notes before renaming or moving. No sources or names were changed.',
      );
    }
    const resolutions = resolveWithCatalog(spans, oldCatalog);
    const patches: {
      from: number;
      to: number;
      expected: string;
      replacement: string;
    }[] = [];
    for (const link of resolutions) {
      if (
        link.status === 'ambiguous' &&
        changed.some(
          (target) =>
            link.span.target === target.title ||
            link.span.target ===
              (target.folder ? target.folder + '/' : '') + target.title,
        )
      ) {
        throw new Error(
          'A link to this note is ambiguous. Qualify its folder path before renaming or moving.',
        );
      }
      if (link.status !== 'resolved' || !link.targetId) continue;
      const unchanged = resolveWithCatalog([link.span], nextCatalog)[0];
      if (
        unchanged?.status === 'resolved' &&
        unchanged.targetId === link.targetId
      )
        continue;
      const target = after.documents[link.targetId];
      assert(target && !target.trashedAt, 'The linked note is unavailable.');
      const replacement =
        (target.folder ? target.folder + '/' : '') + target.title;
      const candidate = resolveWithCatalog(
        [{ ...link.span, target: replacement }],
        nextCatalog,
      )[0];
      assert(
        candidate?.status === 'resolved' &&
          candidate.targetId === link.targetId,
        'This name or destination would make an existing link ambiguous. Choose a unique note title or folder.',
      );
      const from = link.span.from + 2;
      const to = from + link.span.target.length;
      assert(
        origin.source.slice(from, to) === link.span.target,
        'A linked source changed during rename. Retry without losing the current edit.',
      );
      patches.push({ from, to, expected: link.span.target, replacement });
    }
    if (!patches.length) continue;
    sourceChanged = true;
    assert(
      files[origin.id] === origin.source,
      'A linked source changed during rename. No sources were overwritten.',
    );
    let source = origin.source;
    for (const patch of patches.sort((a, b) => b.from - a.from)) {
      assert(
        source.slice(patch.from, patch.to) === patch.expected,
        'The link edit no longer matches its original source.',
      );
      source =
        source.slice(0, patch.from) +
        patch.replacement +
        source.slice(patch.to);
    }
    files[origin.id] = source;
    documents[origin.id] = { ...documents[origin.id]!, updated: Date.now() };
  }
  if (!sourceChanged) return validateWebState(after);
  return validateWebState({
    ...after,
    workspace: { ...after.workspace, files },
    documents,
  });
}

export function addFolder(state: WebState, path: string): WebState {
  const normalized = normalizeFolder(path);
  assert(normalized, 'Enter a folder name.');
  return validateWebState({ ...state, folders: withFolder(state, normalized) });
}

export function trashDocument(
  state: WebState,
  key: string,
  now = Date.now(),
): WebState {
  assert(Object.hasOwn(state.documents, key), 'This document is unavailable.');
  let next: WebState = {
    ...state,
    documents: {
      ...state.documents,
      [key]: { ...state.documents[key]!, trashedAt: now, updated: now },
    },
    recentIds: state.recentIds.filter((id) => id !== key),
  };
  const remaining = Object.keys(next.documents).filter(
    (id) => !next.documents[id]!.trashedAt,
  );
  const entry = remaining.find(isMdxSource);
  if (!entry) next = createDocument(next).state;
  else
    next = {
      ...next,
      workspace: {
        ...next.workspace,
        selected:
          next.workspace.selected === key ? entry : next.workspace.selected,
        entry: next.workspace.entry === key ? entry : next.workspace.entry,
      },
    };
  return validateWebState(next);
}

export function restoreDocument(state: WebState, key: string): WebState {
  assert(Object.hasOwn(state.documents, key), 'This document is unavailable.');
  const metadata = { ...state.documents[key]!, updated: Date.now() };
  delete metadata.trashedAt;
  return selectDocument(
    { ...state, documents: { ...state.documents, [key]: metadata } },
    key,
  );
}

export function importSources(
  state: WebState,
  sources: ImportedSource[],
  now = Date.now(),
): WebState {
  assert(
    sources.length > 0 && sources.length <= MAX_FILES,
    'Import between 1 and 32 related source files at a time.',
  );
  const paths = new Set<string>();
  let total = 0;
  for (const item of sources) {
    assert(
      validPath(item.logicalPath) && isSupportedSource(item.logicalPath),
      'Select Markdown, MDX, JavaScript or TypeScript files.',
    );
    assert(
      !paths.has(item.logicalPath),
      'The import contains duplicate paths.',
    );
    paths.add(item.logicalPath);
    const bytes = encoder.encode(item.source).byteLength;
    assert(bytes <= MAX_FILE_BYTES, 'A source exceeds the 500 KB limit.');
    total += bytes;
  }
  assert(total <= MAX_TOTAL_BYTES, 'A connected import exceeds 8 MiB.');
  let sequence = state.workspace.sequence;
  let group: string;
  do group = `web-${++sequence}`;
  while (Object.values(state.workspace.groups).includes(group));
  const files = { ...state.workspace.files };
  const groups = { ...state.workspace.groups };
  const documents = { ...state.documents };
  let folders = state.folders;
  const keys = sources.map((item) => {
    const key = `${group}/${item.logicalPath}`;
    const parts = item.logicalPath.split('/');
    const name = parts.pop()!;
    const folder = parts.join('/');
    files[key] = item.source;
    groups[key] = group;
    documents[key] = {
      title: titleText(name.replace(/\.(mdx?|tsx?|jsx?)$/i, '')),
      folder,
      created: now,
      updated: now,
    };
    folders = [...new Set([...folders, ...folderAncestors(folder)])];
    return key;
  });
  const selected = keys.find(isMdxSource) ?? keys[0]!;
  return validateWebState({
    ...state,
    workspace: {
      ...state.workspace,
      files,
      groups,
      sequence,
      selected,
      entry: isMdxSource(selected) ? selected : state.workspace.entry,
    },
    documents,
    folders,
    recentIds: addRecent(state.recentIds, selected),
  });
}

export function serializeBackup(state: WebState): string {
  return JSON.stringify({
    format: 'programmable-notes-workspace',
    version: 1,
    exportedAt: new Date().toISOString(),
    state,
  });
}

export function parseBackup(text: string): WebState {
  assert(
    encoder.encode(text).byteLength <= MAX_BACKUP_BYTES,
    'The backup exceeds the 32 MiB import limit.',
  );
  let value: unknown;
  try {
    value = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not valid JSON. The current workspace was not changed.',
    );
  }
  assert(
    object(value) &&
      value.format === 'programmable-notes-workspace' &&
      value.version === 1,
    'Choose a Programmable Notes workspace backup.',
  );
  return validateWebState(value.state);
}
