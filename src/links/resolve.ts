import type { LinkDocument, LinkResolution, LinkSourceSpan } from './types';
import { validLinkTarget } from './parse';

/** Folder paths never carry a leading slash or transient opened-N prefix. */
export function validFolder(folder: string): boolean {
  if (folder === '') return true;
  return (
    validLinkTarget(folder) && folder.split('/').every((part) => part !== '.')
  );
}

function validDescriptor(doc: LinkDocument): boolean {
  return (
    typeof doc.id === 'string' &&
    doc.id.length > 0 &&
    typeof doc.title === 'string' &&
    validLinkTarget(doc.title) &&
    !doc.title.includes('/') &&
    typeof doc.folder === 'string' &&
    validFolder(doc.folder) &&
    typeof doc.trashed === 'boolean' &&
    typeof doc.source === 'string'
  );
}

export type LinkCatalog = Readonly<{
  byTitle: ReadonlyMap<string, readonly LinkDocument[]>;
  byPath: ReadonlyMap<string, readonly LinkDocument[]>;
}>;

export function buildLinkCatalog(
  documents: readonly LinkDocument[],
): LinkCatalog {
  const byTitle = new Map<string, LinkDocument[]>();
  const byPath = new Map<string, LinkDocument[]>();
  const idCounts = new Map<string, number>();
  for (const doc of documents)
    idCounts.set(doc.id, (idCounts.get(doc.id) ?? 0) + 1);
  for (const doc of documents) {
    // Corrupt duplicate identities must not silently designate the wrong note.
    if (idCounts.get(doc.id) !== 1 || !validDescriptor(doc)) continue;
    const path = doc.folder ? `${doc.folder}/${doc.title}` : doc.title;
    for (const [map, key] of [
      [byTitle, doc.title],
      [byPath, path],
    ] as const) {
      const matches = map.get(key) ?? [];
      matches.push(doc);
      map.set(key, matches);
    }
  }
  return { byTitle, byPath };
}

/**
 * Never resolves by iteration order. `targetId` exists only when exactly
 * one live match exists. All-trashed matches return `trashed`.
 */
export function resolveWikilinks(
  spans: readonly LinkSourceSpan[],
  documents: readonly LinkDocument[],
): readonly LinkResolution[] {
  return resolveWithCatalog(spans, buildLinkCatalog(documents));
}

export function resolveWithCatalog(
  spans: readonly LinkSourceSpan[],
  catalog: LinkCatalog,
): readonly LinkResolution[] {
  const results = spans.map((span): LinkResolution => {
    if (!validLinkTarget(span.target))
      return Object.freeze({ span, status: 'missing' });
    const possible = span.target.includes('/')
      ? (catalog.byPath.get(span.target) ?? [])
      : (catalog.byTitle.get(span.target) ?? []);
    const live = possible.filter((doc) => !doc.trashed);
    if (live.length === 1)
      return Object.freeze({ span, status: 'resolved', targetId: live[0]!.id });
    if (live.length > 1) return Object.freeze({ span, status: 'ambiguous' });
    return Object.freeze({
      span,
      status: possible.length ? 'trashed' : 'missing',
    });
  });
  return Object.freeze(results);
}
