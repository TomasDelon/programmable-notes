import type { Backlink, LinkDocument, SourceLinkResolutions } from './types';
import { buildLinkCatalog, resolveWithCatalog } from './resolve';

/**
 * Re-derives all backlinks from the provided exact current source/catalog.
 * Stale source spans or resolver outcomes are dropped. Trashed sources do not
 * contribute active backlinks; Trash recovery can rebuild this index.
 */
export function deriveBacklinks(
  documents: readonly LinkDocument[],
  sources: readonly SourceLinkResolutions[],
): Readonly<Record<string, readonly Backlink[]>> {
  const byId = new Map<string, LinkDocument>();
  const collidingIds = new Set<string>();
  for (const doc of documents) {
    if (byId.has(doc.id)) collidingIds.add(doc.id);
    byId.set(doc.id, doc);
  }
  const catalog = buildLinkCatalog(documents);
  const entries = new Map<string, Backlink[]>();
  const sourceCounts = new Map<string, number>();
  for (const source of sources)
    sourceCounts.set(
      source.sourceDocumentId,
      (sourceCounts.get(source.sourceDocumentId) ?? 0) + 1,
    );
  for (const source of sources) {
    // One source revision per identity. Ambiguous duplicated cache entries are dropped.
    if (
      collidingIds.has(source.sourceDocumentId) ||
      sourceCounts.get(source.sourceDocumentId) !== 1
    )
      continue;
    const origin = byId.get(source.sourceDocumentId);
    if (!origin || origin.trashed) continue;
    for (const link of source.links) {
      if (
        link.status !== 'resolved' ||
        !link.targetId ||
        collidingIds.has(link.targetId)
      )
        continue;
      if (origin.source.slice(link.span.from, link.span.to) !== link.span.raw)
        continue;
      const fresh = resolveWithCatalog([link.span], catalog)[0];
      if (fresh?.status !== 'resolved' || fresh.targetId !== link.targetId)
        continue;
      const backlink: Backlink = Object.freeze({
        sourceDocumentId: origin.id,
        targetDocumentId: link.targetId,
        sourceTitle: origin.title,
        from: link.span.from,
        to: link.span.to,
        raw: link.span.raw,
        displayText: link.span.alias ?? link.span.target.split('/').at(-1)!,
      });
      const list = entries.get(link.targetId) ?? [];
      list.push(backlink);
      entries.set(link.targetId, list);
    }
  }
  const result: Record<string, readonly Backlink[]> = Object.create(
    null,
  ) as Record<string, readonly Backlink[]>;
  for (const [targetId, backlinks] of [...entries].sort(([a], [b]) =>
    a.localeCompare(b, 'en'),
  )) {
    backlinks.sort((a, b) => {
      const da = byId.get(a.sourceDocumentId)!;
      const db = byId.get(b.sourceDocumentId)!;
      return (
        da.folder.localeCompare(db.folder, 'en') ||
        da.title.localeCompare(db.title, 'en') ||
        a.sourceDocumentId.localeCompare(b.sourceDocumentId, 'en') ||
        a.from - b.from ||
        a.to - b.to
      );
    });
    result[targetId] = Object.freeze(backlinks);
  }
  return Object.freeze(result);
}
