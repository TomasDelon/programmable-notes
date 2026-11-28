import type { RecoverySnapshot, RecoveryCatalog } from '../documents/recovery';
import { isSupportedSource } from '../sourceTypes';

const hex = (value: unknown, length: number): value is string =>
  typeof value === 'string' && new RegExp(`^[a-f0-9]{${length}}$`).test(value);
export function decodeRecoveryVersion(value: unknown): RecoverySnapshot | null {
  try {
    const record = value as RecoverySnapshot;
    const m = record.metadata;
    if (
      !hex(record.id, 64) ||
      !hex(m.documentId, 32) ||
      m.schema !== 1 ||
      !Number.isSafeInteger(m.generation) ||
      m.generation < 1 ||
      !Number.isSafeInteger(m.createdAtMs) ||
      m.createdAtMs < 0 ||
      m.createdAtMs > 8_640_000_000_000_000 ||
      !Number.isSafeInteger(m.sourceBytes) ||
      m.sourceBytes < 0 ||
      m.sourceBytes > 500_000 ||
      !(m.baseline === null || hex(m.baseline, 64)) ||
      !(m.parent === null || hex(m.parent, 64)) ||
      typeof m.name !== 'string' ||
      !isSupportedSource(m.name) ||
      m.name.lastIndexOf('.') < 1 ||
      new TextEncoder().encode(m.name).length > 255 ||
      m.name.includes('/') ||
      m.name.includes('\\') ||
      [...m.name].some(
        (char) =>
          char.charCodeAt(0) < 32 ||
          (char.charCodeAt(0) >= 127 && char.charCodeAt(0) <= 159),
      ) ||
      record.file !==
        `${m.documentId}-${String(m.generation).padStart(20, '0')}-${record.id}.pnrec`
    )
      return null;
    return Object.freeze({
      file: record.file,
      id: record.id,
      metadata: Object.freeze({
        schema: 1,
        documentId: m.documentId,
        name: m.name,
        baseline: m.baseline,
        parent: m.parent,
        generation: m.generation,
        createdAtMs: m.createdAtMs,
        sourceBytes: m.sourceBytes,
      }),
    });
  } catch {
    return null;
  }
}
export function decodeRecoveryCatalog(value: unknown): RecoveryCatalog {
  const input = value as {
    snapshots?: unknown;
    errors?: unknown;
    capacityExceeded?: unknown;
  } | null;
  if (!input || !Array.isArray(input.snapshots))
    throw Error('Recovery inventory could not be read.');
  let warning =
    input.capacityExceeded !== false ||
    !Array.isArray(input.errors) ||
    input.errors.length > 0 ||
    input.snapshots.length > 65;
  const versions: RecoverySnapshot[] = [];
  const files = new Set<string>();
  for (const item of input.snapshots.slice(0, 65)) {
    const record = decodeRecoveryVersion(item);
    if (!record || files.has(record.file)) {
      warning = true;
      continue;
    }
    files.add(record.file);
    versions.push(record);
  }
  return Object.freeze({ versions: Object.freeze(versions), warning });
}
