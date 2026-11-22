import { createProcessor } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import { visualAnalysisLimited } from '../markdownEdits';

export interface SyntaxNode {
  type: string;
  value?: string;
  depth?: number;
  children?: SyntaxNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export interface MathSpan {
  kind: 'inline' | 'display';
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
  originalInner: string;
  originalOuter: string;
}

const markdownProcessor = createProcessor({
  format: 'md',
  remarkPlugins: [remarkGfm, remarkMath],
});
const mdxProcessor = createProcessor({
  format: 'mdx',
  remarkPlugins: [remarkGfm, remarkMath],
});

/** Keep frontmatter opaque while preserving every original UTF-16 offset. */
function parserSource(source: string): string {
  let value = source;
  const header = /^\uFEFF?---[ \t]*(?:\r\n|\n|\r)/.exec(source);
  if (header) {
    const closing = /(?:\r\n|\n|\r)(?:---|\.\.\.)[ \t]*(?=\r\n|\n|\r|$)/g;
    closing.lastIndex = header[0].length;
    const end = closing.exec(source);
    const body = source.slice(header[0].length, end?.index ?? source.length);
    if (/^[ \t]*[\p{L}\p{N}_-]+[ \t]*:/mu.test(body)) {
      const boundary = end ? end.index + end[0].length : source.length;
      value =
        source.slice(0, boundary).replace(/[^\r\n]/g, ' ') +
        source.slice(boundary);
    }
  }
  // MDX strips a BOM. One parser-only line preserves its offset without
  // indenting the first import/JSX. Original text never passes through this mask.
  return value.replace(/^\uFEFF/, '\n');
}

export function parseLiveSource(
  source: string,
  path = 'note.mdx',
): SyntaxNode | null {
  if (visualAnalysisLimited(source)) return null;
  try {
    const processor = /\.md$/i.test(path) ? markdownProcessor : mdxProcessor;
    return processor.parse(parserSource(source)) as SyntaxNode;
  } catch {
    return null;
  }
}

export function safeMathSpan(
  source: string,
  node: SyntaxNode,
): MathSpan | null {
  if (node.type !== 'inlineMath' && node.type !== 'math') return null;
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  if (
    from === undefined ||
    to === undefined ||
    from < 0 ||
    to <= from ||
    to > source.length
  )
    return null;
  const kind = node.type === 'math' ? 'display' : 'inline';
  const delimiter = kind === 'display' ? '$$' : '$';
  const originalOuter = source.slice(from, to);
  if (
    !originalOuter.startsWith(delimiter) ||
    !originalOuter.endsWith(delimiter) ||
    originalOuter.length <= 2 * delimiter.length
  )
    return null;
  if (
    kind === 'inline' &&
    (originalOuter.startsWith('$$') || originalOuter.endsWith('$$'))
  )
    return null;
  const innerFrom = from + delimiter.length;
  const innerTo = to - delimiter.length;
  const originalInner = source.slice(innerFrom, innerTo);
  // Container continuations and uncommon dollar delimiter variants stay raw.
  // We never present quote/list prefixes as editable LaTeX.
  if (
    kind === 'display' &&
    originalInner.replace(/\r\n?|\n/g, '\n').trim() !== node.value?.trim()
  )
    return null;
  return { kind, from, to, innerFrom, innerTo, originalInner, originalOuter };
}

export function collectLiveMath(source: string, path = 'note.mdx'): MathSpan[] {
  const tree = parseLiveSource(source, path);
  const spans: MathSpan[] = [];
  function visit(node: SyntaxNode): void {
    if (
      node.type.startsWith('mdx') ||
      node.type === 'code' ||
      node.type === 'inlineCode' ||
      node.type === 'html'
    )
      return;
    const span = safeMathSpan(source, node);
    if (span) spans.push(span);
    if (!span) node.children?.forEach(visit);
  }
  if (tree) visit(tree);
  return spans;
}

/** A textarea normalizes breaks; retain existing physical breaks when possible. */
export function preserveMathBreaks(original: string, value: string): string {
  const normalized = value.replace(/\r\n?|\n/g, '\n');
  const originalNormalized = original.replace(/\r\n?|\n/g, '\n');
  if (normalized === originalNormalized) return original;
  const breaks = original.match(/\r\n|\r|\n/g) ?? [];
  const count = normalized.match(/\n/g)?.length ?? 0;
  let index = 0;
  return normalized.replace(/\n/g, () =>
    breaks.length === count ? breaks[index++]! : (breaks[0] ?? '\n'),
  );
}

/** M2's exact snapshot and parser revalidation contract, without fake revisions. */
export function planMathReplacement(
  source: string,
  expectedSource: string,
  span: MathSpan,
  input: string,
  path = 'note.mdx',
):
  | { ok: true; source: string; replacement: string }
  | { ok: false; reason: string } {
  if (source !== expectedSource)
    return {
      ok: false,
      reason:
        'The source changed. Your LaTeX draft is preserved; copy it or cancel and reopen this equation.',
    };
  const before = collectLiveMath(source, path);
  if (
    !before.some(
      (item) =>
        item.from === span.from &&
        item.to === span.to &&
        item.originalOuter === span.originalOuter &&
        item.kind === span.kind,
    )
  ) {
    return {
      ok: false,
      reason:
        'This equation no longer has the original source range. Your draft is preserved.',
    };
  }
  const replacement = preserveMathBreaks(span.originalInner, input);
  if (replacement === span.originalInner)
    return { ok: true, source, replacement };
  const candidate =
    source.slice(0, span.innerFrom) + replacement + source.slice(span.innerTo);
  const shift = replacement.length - span.originalInner.length;
  const after = collectLiveMath(candidate, path);
  if (
    !after.some(
      (item) =>
        item.from === span.from &&
        item.to === span.to + shift &&
        item.kind === span.kind &&
        item.innerFrom === span.innerFrom &&
        item.originalInner === replacement,
    )
  ) {
    return {
      ok: false,
      reason:
        'The edit changes the Markdown math delimiters or surrounding syntax. Your source and draft are preserved.',
    };
  }
  return { ok: true, source: candidate, replacement };
}
