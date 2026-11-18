export interface NativeDocument {
  id: string;
  revision: string;
  name: string;
  logicalPath: string;
  displayPath: string;
  source: string;
  durabilityWarning: boolean;
}
export interface Binding {
  displayPath?: string;
  id: string;
  revision: string;
  name: string;
}
export interface Workspace {
  files: Record<string, string>;
  saved: Record<string, string>;
  groups: Record<string, string>;
  bindings: Record<string, Binding>;
  selected: string;
  entry: string;
  sequence: number;
}
export const MAX_FILE_BYTES = 500_000,
  MAX_FILES = 32,
  MAX_TOTAL_BYTES = 8 * 1024 * 1024;
export function validateFiles(files: Record<string, string>): void {
  const values = Object.values(files);
  if (values.length > MAX_FILES)
    throw Error('Workspace exceeds 32 files; close unused sources.');
  const sizes = values.map(
    (source) => new TextEncoder().encode(source).byteLength,
  );
  if (sizes.some((size) => size > MAX_FILE_BYTES))
    throw Error('File exceeds 500 KB limit; source retained.');
  if (sizes.reduce((a, b) => a + b, 0) > MAX_TOTAL_BYTES)
    throw Error('Workspace exceeds 8 MiB of source; close unused sources.');
}
export function initialWorkspace(
  files: Record<string, string>,
  entry: string,
): Workspace {
  return {
    files: { ...files },
    saved: { ...files },
    groups: Object.fromEntries(
      Object.keys(files).map((key) => [key, 'initial']),
    ),
    bindings: {},
    selected: entry,
    entry,
    sequence: 0,
  };
}
export function addDocuments(
  state: Workspace,
  documents: { logicalPath: string; source: string; native?: NativeDocument }[],
): Workspace {
  if (!documents.length) return state;
  const group = `opened-${state.sequence + 1}`,
    files = { ...state.files },
    saved = { ...state.saved },
    groups = { ...state.groups },
    bindings = { ...state.bindings };
  const keys = new Set<string>();
  for (const doc of documents) {
    const path = doc.logicalPath;
    if (
      !path ||
      path.startsWith('/') ||
      path.includes('\\') ||
      path.split('/').some((part) => !part || part === '.' || part === '..')
    )
      throw Error('Unsupported source path.');
    const key = `${group}/${path}`;
    if (keys.has(key)) throw Error('Duplicate source names in selection.');
    keys.add(key);
    files[key] = doc.source;
    saved[key] = doc.source;
    groups[key] = group;
    if (doc.native)
      bindings[key] = {
        id: doc.native.id,
        revision: doc.native.revision,
        name: doc.native.name,
        displayPath: doc.native.displayPath,
      };
  }
  validateFiles(files);
  const entry = [...keys].find((key) => /\.mdx?$/.test(key)) || state.entry;
  return {
    ...state,
    files,
    saved,
    groups,
    bindings,
    entry,
    selected: entry === state.entry ? [...keys][0]! : entry,
    sequence: state.sequence + 1,
  };
}
export function compilerFiles(
  state: Pick<Workspace, 'files' | 'groups' | 'entry'>,
): Record<string, string> {
  return Object.fromEntries(
    Object.entries(state.files).filter(
      ([key]) => state.groups[key] === state.groups[state.entry],
    ),
  );
}
export function isDirty(state: Workspace): boolean {
  return Object.keys(state.files).some(
    (key) => state.files[key] !== state.saved[key],
  );
}
export function completeSave(
  state: Workspace,
  key: string,
  snapshot: string,
  binding?: Binding,
  expectedId?: string,
): Workspace {
  if (
    !(key in state.files) ||
    (expectedId !== undefined && state.bindings[key]?.id !== expectedId)
  )
    return state;
  return {
    ...state,
    saved: { ...state.saved, [key]: snapshot },
    bindings: binding ? { ...state.bindings, [key]: binding } : state.bindings,
  };
}
export function removeDocument(state: Workspace, key: string): Workspace {
  const files = { ...state.files },
    saved = { ...state.saved },
    groups = { ...state.groups },
    bindings = { ...state.bindings };
  delete files[key];
  delete saved[key];
  delete groups[key];
  delete bindings[key];
  const first = Object.keys(files)[0];
  if (!first) throw Error('Keep at least one source open.');
  const entry =
    state.entry === key
      ? Object.keys(files).find((k) => /\.mdx?$/.test(k)) || first
      : state.entry;
  return {
    ...state,
    files,
    saved,
    groups,
    bindings,
    entry,
    selected: state.selected === key ? entry : state.selected,
  };
}
