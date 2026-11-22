import type {
  LinkDocument,
  RenamePatch,
  RenameProposal,
  SourceLinkResolutions,
} from './types';
import { validLinkTarget } from './parse';
import { validFolder, buildLinkCatalog, resolveWithCatalog } from './resolve';

/**
 * Pure advisory patch plan. It must not apply changes, persist them, or alter
 * metadata. C0 has NOT frozen atomic rename/move application semantics.
 */
export function proposeRenameReferences(
  documents: readonly LinkDocument[],
  sources: readonly SourceLinkResolutions[],
  targetId: string,
  newTitle: string,
  newFolder: string,
): readonly RenameProposal[] {
  if (
    !newTitle ||
    !validLinkTarget(newTitle) ||
    newTitle.includes('/') ||
    !validFolder(newFolder)
  )
    return [];
  const newTarget = newFolder ? `${newFolder}/${newTitle}` : newTitle;
  if (!validLinkTarget(newTarget)) return [];
  const matchingTargets = documents.filter(
    (doc) => doc.id === targetId && !doc.trashed,
  );
  if (matchingTargets.length !== 1) return [];
  const catalog = buildLinkCatalog(documents);
  const prospective = buildLinkCatalog(
    documents.map((doc) =>
      doc.id === targetId
        ? { ...doc, title: newTitle, folder: newFolder }
        : doc,
    ),
  );
  // A rewritten unqualified root title must still identify this exact note.
  // Never manufacture references that become ambiguous or name a different note.
  const check = resolveWithCatalog(
    [
      {
        from: 0,
        to: newTarget.length + 4,
        raw: `[[${newTarget}]]`,
        target: newTarget,
      },
    ],
    prospective,
  )[0];
  if (check?.status !== 'resolved' || check.targetId !== targetId) return [];
  const proposals: RenameProposal[] = [];
  const sourceCounts = new Map<string, number>();
  for (const source of sources)
    sourceCounts.set(
      source.sourceDocumentId,
      (sourceCounts.get(source.sourceDocumentId) ?? 0) + 1,
    );
  for (const source of sources) {
    if (sourceCounts.get(source.sourceDocumentId) !== 1) continue;
    const origins = documents.filter(
      (doc) => doc.id === source.sourceDocumentId && !doc.trashed,
    );
    if (origins.length !== 1) continue;
    const origin = origins[0]!;
    const patches: RenamePatch[] = [];
    for (const link of source.links) {
      if (link.status !== 'resolved' || link.targetId !== targetId) continue;
      const fresh = resolveWithCatalog([link.span], catalog)[0];
      if (fresh?.status !== 'resolved' || fresh.targetId !== targetId) continue;
      if (origin.source.slice(link.span.from, link.span.to) !== link.span.raw)
        continue;
      const from = link.span.from + 2;
      const to = from + link.span.target.length;
      if (
        origin.source.slice(from, to) !== link.span.target ||
        newTarget === link.span.target
      )
        continue;
      patches.push(
        Object.freeze({
          from,
          to,
          expected: link.span.target,
          replacement: newTarget,
        }),
      );
    }
    patches.sort((a, b) => a.from - b.from);
    if (patches.some((patch, i) => i && patch.from < patches[i - 1]!.to))
      continue;
    if (patches.length)
      proposals.push(
        Object.freeze({
          sourceDocumentId: origin.id,
          expectedSource: origin.source,
          patches: Object.freeze(patches),
        }),
      );
  }
  return Object.freeze(
    proposals.sort((a, b) =>
      a.sourceDocumentId.localeCompare(b.sourceDocumentId, 'en'),
    ),
  );
}
