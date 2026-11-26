import { createProcessor } from '@mdx-js/mdx';
import type { Processor } from 'unified';
import type { Extension } from 'mdast-util-from-markdown';
import remarkGfm from 'remark-gfm';
import { remarkMathAuthoring } from '../../plugins/core/mathSyntax';
import { visualAnalysisLimited } from '../markdownEdits';

export interface SyntaxNode {
  type: string;
  value?: string;
  depth?: number;
  data?: {
    pnMathDraft?: boolean;
    continuationPrefixes?: Map<number, number> | null;
  };
  children?: SyntaxNode[];
  position?: { start: { offset?: number }; end: { offset?: number } };
}

export interface MathSpan {
  kind: 'inline' | 'display';
  literal?: boolean;
  from: number;
  to: number;
  innerFrom: number;
  innerTo: number;
  originalInner: string;
  originalOuter: string;
}

/** Observe compiler tokens without changing how mdast builds the tree. Each
 * root owns its witnesses; overflow discards all evidence for that parse. */
function remarkContainerPrefixes(this: Processor) {
  const extension: Extension = {
    beforeEnter(token) {
      if (
        token.type !== 'blockQuotePrefix' &&
        token.type !== 'listItemIndent' &&
        token.type !== 'linePrefix'
      )
        return;
      const root = this.stack[0] as SyntaxNode;
      if (root.data?.continuationPrefixes === null) return;
      if (
        !this.stack.some(
          (node) => node.type === 'blockquote' || node.type === 'listItem',
        )
      )
        return;
      const data = (root.data ??= {});
      const prefixes = (data.continuationPrefixes ??= new Map());
      if (prefixes.size >= 4096) data.continuationPrefixes = null;
      else prefixes.set(token.start.offset, token.end.offset);
    },
  };
  (this.data().fromMarkdownExtensions ??= []).push(extension);
}

const markdownProcessor = createProcessor({
  format: 'md',
  remarkPlugins: [remarkGfm, remarkMathAuthoring, remarkContainerPrefixes],
});
const mdxProcessor = createProcessor({
  format: 'mdx',
  remarkPlugins: [remarkGfm, remarkMathAuthoring, remarkContainerPrefixes],
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

export function analyzeLiveSource(
  source: string,
  path = 'note.mdx',
): { tree: SyntaxNode | null; diagnostic: string | null } {
  if (visualAnalysisLimited(source)) return { tree: null, diagnostic: null };
  try {
    const processor = /\.md$/i.test(path) ? markdownProcessor : mdxProcessor;
    return {
      tree: processor.parse(parserSource(source)) as SyntaxNode,
      diagnostic: null,
    };
  } catch (reason) {
    return {
      tree: null,
      diagnostic:
        reason instanceof Error
          ? 'Source analysis failed. ' + reason.message.slice(0, 2000)
          : 'Source analysis failed.',
    };
  }
}

export function parseLiveSource(
  source: string,
  path = 'note.mdx',
): SyntaxNode | null {
  return analyzeLiveSource(source, path).tree;
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
  const originalOuter = source.slice(from, to);
  if (node.data?.pnMathDraft)
    return {
      kind: originalOuter.startsWith('$$') ? 'display' : 'inline',
      literal: true,
      from,
      to,
      innerFrom: from,
      innerTo: to,
      originalInner: originalOuter,
      originalOuter,
    };
  const kind =
    node.type === 'math' || originalOuter.startsWith('$$')
      ? 'display'
      : 'inline';
  const delimiter = kind === 'display' ? '$$' : '$';
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
    originalInner.replace(/\r\n?|\n/g, '\n').trim() !==
      node.value?.replace(/\r\n?|\n/g, '\n').trim()
  )
    return null;
  return { kind, from, to, innerFrom, innerTo, originalInner, originalOuter };
}

export function collectLiveMath(
  source: string,
  path = 'note.mdx',
  includeLiteral = false,
): MathSpan[] {
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
    if (span && (!span.literal || includeLiteral)) spans.push(span);
    if (!span) node.children?.forEach(visit);
  }
  if (tree) visit(tree);
  return spans;
}

/** Editable surfaces normalize breaks; retain existing physical breaks when possible. */
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

/** Completed pairs alone are mathematics. Unfinished delimiters are ordinary text. */
export function completedMath(raw: string): MathSpan | null {
  const spans = collectLiveMath(raw, 'note.md');
  return spans.length === 1 &&
    spans[0]!.from === 0 &&
    spans[0]!.to === raw.length
    ? spans[0]!
    : null;
}

/** Replace the explicitly activated source span, including its delimiters. */
export function planMathSourceReplacement(
  source: string,
  expectedSource: string,
  span: MathSpan,
  input: string,
  path = 'note.mdx',
):
  | { ok: true; source: string; replacement: string }
  | { ok: false; reason: string } {
  if (source !== expectedSource)
    return { ok: false, reason: 'The source changed. Your text is retained.' };
  if (
    !collectLiveMath(source, path, true).some(
      (item) =>
        item.from === span.from &&
        item.to === span.to &&
        item.originalOuter === span.originalOuter &&
        item.kind === span.kind &&
        !!item.literal === !!span.literal,
    )
  )
    return {
      ok: false,
      reason:
        'The original source range is no longer available. Your text is retained.',
    };
  const replacement = preserveMathBreaks(span.originalOuter, input);
  const candidate =
    source.slice(0, span.from) + replacement + source.slice(span.to);
  if (!mathSourceContextPreserved(source, candidate, span.from, span.to, path))
    return {
      ok: false,
      reason:
        'The edit cannot be mapped without changing unrelated React source. Your text is retained.',
    };
  return { ok: true, source: candidate, replacement };
}

/** Retain every pre-existing opaque MDX range outside an explicitly owned patch. */
export function mathSourceContextPreserved(
  source: string,
  candidate: string,
  from: number,
  to: number,
  path: string,
): boolean {
  const before = parseLiveSource(source, path),
    after = parseLiveSource(candidate, path);
  if (!before || !after) return false;
  const shift = candidate.length - source.length;
  const opaque = (
    tree: SyntaxNode,
    text: string,
    adjust: boolean,
  ): string[] => {
    const result: string[] = [];
    const visit = (node: SyntaxNode) => {
      const start = node.position?.start.offset,
        end = node.position?.end.offset;
      if (
        node.type.startsWith('mdx') &&
        start !== undefined &&
        end !== undefined
      ) {
        const boundary = adjust ? to + shift : to;
        if (end <= from || start >= boundary)
          result.push(
            JSON.stringify([
              node.type,
              start >= boundary && adjust ? start - shift : start,
              text.slice(start, end),
            ]),
          );
        return;
      }
      node.children?.forEach(visit);
    };
    visit(tree);
    return result;
  };
  return (
    JSON.stringify(opaque(before, source, false)) ===
    JSON.stringify(opaque(after, candidate, true))
  );
}
