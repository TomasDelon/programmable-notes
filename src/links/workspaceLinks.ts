import { createProcessor } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import { remarkMathAuthoring } from '../plugins/core/mathSyntax';
import { isMdxSource } from '../sourceTypes';
import { parseWikilinks, withinLinkAnalysisBudget } from './parse';
import { buildLinkCatalog, resolveWithCatalog } from './resolve';
import { deriveBacklinks } from './backlinks';
import type {
  Backlink,
  LinkDocument,
  LinkResolution,
  LinkSourceSpan,
  SourceLinkResolutions,
} from './types';

const markdown = createProcessor({
  format: 'md',
  remarkPlugins: [remarkGfm, remarkMathAuthoring],
});
const mdx = createProcessor({
  format: 'mdx',
  remarkPlugins: [remarkGfm, remarkMathAuthoring],
});

/** Metadata is opaque. Masking preserves every raw UTF-16 offset. */
function parserSource(source: string): string {
  let masked = source.replace(/^\uFEFF/, '\n');
  const opening = /^\uFEFF?---[ \t]*(?:\r\n|\r|\n)/.exec(source);
  if (!opening) return masked;
  const rest = source.slice(opening[0].length);
  // A leading Markdown rule remains Markdown unless a mapping follows it.
  const first = rest
    .split(/\r\n|\r|\n/)
    .find((line) => line.trim() && !line.trimStart().startsWith('#'));
  if (
    !first ||
    !/^[ \t]*(?:[\p{L}\p{N}_-]+|"[^"\n]+"|'[^'\n]+')[ \t]*:(?:[ \t]|$)/u.test(
      first,
    )
  )
    return masked;
  const closing = /(?:^|\r\n|\r|\n)(?:---|\.\.\.)[ \t]*(?=\r\n|\r|\n|$)/.exec(
    rest,
  );
  const end = closing
    ? opening[0].length + closing.index + closing[0].length
    : source.length;
  masked = masked.slice(0, end).replace(/[^\r\n]/g, ' ') + masked.slice(end);
  return masked;
}

/** Shared positional syntax for trusted read-only host projections. */
export function parseNoteSyntax(source: string, path: string) {
  if (!withinLinkAnalysisBudget(source))
    throw new Error('This note exceeds the bounded syntax analysis budget.');
  return (/\.md$/i.test(path) ? markdown : mdx).parse(parserSource(source));
}

/** Actual MD/MDX parsing, never code execution or a regex-only opaque scan. */
export function parseSourceWikilinks(
  source: string,
  path = 'note.mdx',
): readonly LinkSourceSpan[] {
  if (!source.includes('[[')) return [];
  if (!withinLinkAnalysisBudget(source))
    throw new Error(
      'Link analysis is limited for this large or bracket-dense note. Source remains editable.',
    );
  const tree = parseNoteSyntax(source, path);
  return parseWikilinks(source, tree, [], true);
}

export interface WorkspaceLinkIndex {
  readonly outgoing: Readonly<Record<string, readonly LinkResolution[]>>;
  readonly backlinks: Readonly<Record<string, readonly Backlink[]>>;
  readonly sources: readonly SourceLinkResolutions[];
  readonly issues: Readonly<Record<string, string>>;
}

/** Keep repeated source parsing bounded without persisting a second authority. */
const parsed = new Map<
  string,
  {
    source: string;
    spans: readonly LinkSourceSpan[];
    issue?: string;
  }
>();
const CACHE_SOURCE_UNITS = 4_000_000;
let cachedUnits = 0;

function parseDocument(document: LinkDocument) {
  const previous = parsed.get(document.id);
  if (previous?.source === document.source) return previous;
  if (previous) {
    cachedUnits -= previous.source.length;
    parsed.delete(document.id);
  }
  let spans: readonly LinkSourceSpan[] = [];
  let issue: string | undefined;
  try {
    // Imported TS/JS helpers are not Markdown notes.
    if (isMdxSource(document.id))
      spans = parseSourceWikilinks(document.source, document.id);
  } catch {
    issue = withinLinkAnalysisBudget(document.source)
      ? 'Links could not be indexed until this note has valid Markdown/MDX syntax.'
      : 'Link analysis is limited for this large or bracket-dense note.';
  }
  const result = {
    source: document.source,
    spans,
    ...(issue ? { issue } : {}),
  };
  while (
    parsed.size &&
    (parsed.size >= 1_000 ||
      cachedUnits + document.source.length > CACHE_SOURCE_UNITS)
  ) {
    const first = parsed.keys().next().value!;
    cachedUnits -= parsed.get(first)!.source.length;
    parsed.delete(first);
  }
  if (document.source.length <= CACHE_SOURCE_UNITS) {
    parsed.set(document.id, result);
    cachedUnits += document.source.length;
  }
  return result;
}

/** Stable note IDs are workspace file keys. Titles and folders remain metadata. */
export function indexWorkspaceLinks(
  documents: readonly LinkDocument[],
): WorkspaceLinkIndex {
  const catalog = buildLinkCatalog(documents);
  const outgoing: Record<string, readonly LinkResolution[]> =
    Object.create(null);
  const issues: Record<string, string> = Object.create(null);
  const sources: SourceLinkResolutions[] = [];
  for (const document of documents) {
    if (document.trashed) continue;
    const result = parseDocument(document);
    if (result.issue) issues[document.id] = result.issue;
    const links = resolveWithCatalog(result.spans, catalog);
    outgoing[document.id] = links;
    sources.push({ sourceDocumentId: document.id, links });
  }
  return {
    outgoing: Object.freeze(outgoing),
    backlinks: deriveBacklinks(documents, sources),
    sources: Object.freeze(sources),
    issues: Object.freeze(issues),
  };
}
