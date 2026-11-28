import { MAX_FILES, validateFiles } from '../documents/workspace';
import { resolveFile } from './resolve';

interface Resolution {
  specifier: string;
  importer: string;
  path: string;
}
export interface WorkspaceDependencies {
  reads: string[];
  resolutions: Resolution[];
}

// An oversized graph still compiles normally. Only the optional reuse proof is dropped.
const maxResolutions = 128;
function boundedName(name: unknown): name is string {
  return typeof name === 'string' && name.length > 0 && name.length <= 1024;
}

export class WorkspaceDependencyTracker {
  dependencies: WorkspaceDependencies | undefined = {
    reads: [],
    resolutions: [],
  };

  read(path: string) {
    const reads = this.dependencies?.reads;
    if (!reads || reads.includes(path)) return;
    if (reads.length === MAX_FILES || !boundedName(path))
      this.dependencies = undefined;
    else reads.push(path);
  }

  resolved(specifier: string, importer: string, path: string) {
    const resolutions = this.dependencies?.resolutions;
    if (!resolutions) return;
    if (
      resolutions.length === maxResolutions ||
      ![specifier, importer, path].every(boundedName)
    )
      this.dependencies = undefined;
    else resolutions.push({ specifier, importer, path });
  }
}

function hasFields(value: unknown, fields: string[]) {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

export function verifiedDependencies(
  value: WorkspaceDependencies | undefined,
  entry: string,
  files: Record<string, string>,
): WorkspaceDependencies | undefined {
  if (
    !hasFields(value, ['reads', 'resolutions']) ||
    !Array.isArray(value?.reads) ||
    !Array.isArray(value.resolutions) ||
    value.reads.length > MAX_FILES ||
    value.resolutions.length > maxResolutions
  )
    return;
  const reads = new Set(value.reads);
  if (!reads.has(entry) || reads.size !== value.reads.length) return;
  for (const path of reads)
    if (!boundedName(path) || !Object.hasOwn(files, path)) return;
  const resolved = new Set<string>();
  let hasEntry = false;
  try {
    for (const edge of value.resolutions) {
      if (
        !hasFields(edge, ['specifier', 'importer', 'path']) ||
        !boundedName(edge.specifier) ||
        !boundedName(edge.importer) ||
        !boundedName(edge.path) ||
        !reads.has(edge.path)
      )
        return;
      if (
        (edge.importer === '<stdin>' || edge.importer === 'entry.js') &&
        edge.specifier === './' + entry &&
        edge.path === entry
      )
        hasEntry = true;
      else if (!reads.has(edge.importer)) return;
      if (resolveFile(edge.specifier, edge.importer, files) !== edge.path)
        return;
      resolved.add(edge.path);
    }
  } catch {
    return;
  }
  if (hasEntry && resolved.size === reads.size) return value;
}

export function workspaceDependenciesMatch(
  dependencies: WorkspaceDependencies,
  compiledFiles: Record<string, string>,
  nextFiles: Record<string, string>,
) {
  try {
    validateFiles(nextFiles);
    return (
      dependencies.reads.every(
        (path) =>
          Object.hasOwn(nextFiles, path) &&
          nextFiles[path] === compiledFiles[path],
      ) &&
      dependencies.resolutions.every(
        ({ specifier, importer, path }) =>
          resolveFile(specifier, importer, nextFiles) === path,
      )
    );
  } catch {
    return false;
  }
}
