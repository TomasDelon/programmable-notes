import { createProcessor } from '@mdx-js/mdx';

export interface MarkdownRange {
  from: number;
  to: number;
  text: string;
  headingDepth?: 1 | 2 | 3 | 4 | 5 | 6;
  quoteFrom?: number;
  /** Exact continuation markers, excluded from the editable logical text. */
  quotePrefixes?: string[];
  list?: { from: number; ordered: boolean; start: number };
}

const plain = /^[\P{Cc}\t\r\n]+$/u;
const processor = createProcessor();
// One exact-source AST, shared only by this module's read-only projections.
// Callers receive fresh ranges, never parser nodes. Public entry points retain
// the source-size bound; revision/context/candidate validation still runs.
let parsed:
  | {
      source: string;
      end: number;
      tree: ReturnType<typeof processor.parse>;
    }
  | undefined;

// Front matter is opaque source, not a new MDX grammar or runtime transform.
function metadataEnd(source: string) {
  const opening = /^\uFEFF?---[ \t]*\r?\n/.exec(source);
  if (!opening) return 0;
  let mapping = false;
  let inspected = false;
  let offset = opening[0].length;
  while (offset < source.length) {
    const newline = source.indexOf('\n', offset);
    const end = newline < 0 ? source.length : newline + 1;
    const line = source
      .slice(offset, newline < 0 ? source.length : newline)
      .replace(/\r$/, '');
    // Only physical LF/CRLF lines delimit this source contract. JS multiline
    // anchors also match Unicode separators inside a metadata value.
    const marker = line.replace(/[ \t]+$/, '');
    if (marker === '---' || marker === '...') return mapping ? end : 0;
    if (!inspected && line.trim() && !line.trimStart().startsWith('#')) {
      inspected = true;
      mapping =
        /^[ \t]*(?:[\p{L}\p{N}_-]+|"[^"\n]+"|'[^'\n]+')[ \t]*:(?:[ \t]|$)/u.test(
          line,
        );
      if (!mapping) return 0;
    }
    offset = end;
  }
  // An incomplete mapping-style header stays in Source rather than guessing
  // where its body begins. Plain leading Markdown rules remain ordinary.
  return mapping ? source.length : 0;
}
function parsedSource(source: string) {
  if (parsed?.source === source) return parsed;
  const end = metadataEnd(source);
  // Preserve UTF-16 offsets and line endings. No author bytes are rewritten.
  const masked = (
    source.slice(0, end).replace(/[^\r\n]/g, ' ') + source.slice(end)
  )
    // The MDX parser strips an initial BOM and otherwise shifts every offset.
    // A private blank line keeps its one UTF-16 unit without indenting imports
    // or JSX. Only offsets are consumed; original source bytes stay untouched.
    .replace(/^\uFEFF/, '\n');
  const tree = processor.parse(masked);
  parsed = { source, end, tree };
  return parsed;
}

export function editableMarkdown(source: string): MarkdownRange[] {
  if (source.length > 500_000) return [];
  try {
    const { tree, end } = parsedSource(source);
    return tree.children.flatMap((root): MarkdownRange[] => {
      if ((root.position?.start.offset ?? -1) < end) return [];
      if (root.type === 'blockquote') {
        const paragraph = root.children[0];
        if (root.children.length !== 1 || paragraph?.type !== 'paragraph')
          return [];
        const child = paragraph.children[0];
        if (paragraph.children.length !== 1 || child?.type !== 'text')
          return [];
        const quoteFrom = root.position?.start.offset;
        const from = child.position?.start.offset;
        const to = child.position?.end.offset;
        if (
          quoteFrom === undefined ||
          from === undefined ||
          to === undefined ||
          paragraph.position?.start.offset !== from ||
          paragraph.position?.end.offset !== to ||
          root.position?.end.offset !== to ||
          !/^>[ \t]*$/.test(source.slice(quoteFrom, from))
        )
          return [];
        const raw = source.slice(from, to);
        if (/\r(?!\n)/.test(raw)) return [];
        const pieces = raw.split(/(\r?\n)/);
        const quotePrefixes: string[] = [];
        let text = pieces[0]!;
        for (let index = 1; index < pieces.length; index += 2) {
          const line = pieces[index + 1]!;
          const prefix = /^ {0,3}>[ \t]*/.exec(line)?.[0];
          // Every physical continuation must be explicit; never infer lazy markup.
          if (!prefix) return [];
          quotePrefixes.push(prefix);
          text += pieces[index]! + line.slice(prefix.length);
        }
        if (
          text.replace(/\r\n/g, '\n') !== child.value.replace(/\r\n/g, '\n') ||
          !plain.test(text)
        )
          return [];
        return [
          {
            from,
            to,
            text,
            quoteFrom,
            ...(quotePrefixes.length ? { quotePrefixes } : {}),
          },
        ];
      }
      if (root.type === 'list') {
        const from = root.position?.start.offset;
        if (from === undefined || root.spread) return [];
        const list = {
          from,
          ordered: root.ordered === true,
          start: root.start ?? 1,
        };
        const items = root.children.map((item): MarkdownRange | undefined => {
          const paragraph = item.children[0];
          if (
            item.children.length !== 1 ||
            paragraph?.type !== 'paragraph' ||
            item.checked != null
          )
            return;
          const child = paragraph.children[0];
          if (paragraph.children.length !== 1 || child?.type !== 'text') return;
          const start = item.position?.start.offset;
          const from = child.position?.start.offset;
          const to = child.position?.end.offset;
          if (
            start === undefined ||
            from === undefined ||
            to === undefined ||
            to !== item.position?.end.offset
          )
            return;
          const marker = source.slice(start, from);
          if (!/^(?:[-+*]|[0-9]{1,9}[.)])[ \t]+$/.test(marker)) return;
          const text = source.slice(from, to);
          if (
            text.replace(/\r\n/g, '\n') !==
              child.value.replace(/\r\n/g, '\n') ||
            !plain.test(text)
          )
            return;
          return { from, to, text, list };
        });
        return items.every((item) => item !== undefined) ? items : [];
      }
      const node = root;
      if (node.type !== 'paragraph' && node.type !== 'heading') return [];
      const child = node.children[0];
      if (node.children.length !== 1 || child?.type !== 'text') return [];
      const from = child.position?.start.offset;
      const to = child.position?.end.offset;
      const start = node.position?.start.offset;
      if (from === undefined || to === undefined || start === undefined)
        return [];
      const text = source.slice(from, to);
      if (
        text.replace(/\r\n/g, '\n') !== child.value.replace(/\r\n/g, '\n') ||
        !plain.test(text)
      )
        return [];
      if (node.type === 'paragraph')
        return start === from && node.position?.end.offset === to
          ? [{ from, to, text }]
          : [];
      const atx = /^#{1,6}[ \t]+$/.test(source.slice(start, from));
      const setext =
        start === from &&
        /^[ \t]*\r?\n {0,3}(?:=+|-+)[ \t]*$/.test(
          source.slice(to, node.position?.end.offset),
        );
      if (!atx && !setext) return [];
      return [{ from, to, text, headingDepth: node.depth }];
    });
  } catch {
    return [];
  }
}

function sameContext(a: MarkdownRange, b: MarkdownRange) {
  return (
    a.headingDepth === b.headingDepth &&
    a.quoteFrom === b.quoteFrom &&
    a.quotePrefixes?.length === b.quotePrefixes?.length &&
    (a.quotePrefixes?.every(
      (prefix, index) => prefix === b.quotePrefixes?.[index],
    ) ??
      true) &&
    a.list?.from === b.list?.from &&
    a.list?.ordered === b.list?.ordered &&
    a.list?.start === b.list?.start
  );
}

/** Textareas normalize CRLF; that must not rewrite existing source breaks. */
function preserveTextBreaks(original: string, input: string, fallback: string) {
  const before = original.replace(/\r\n/g, '\n');
  const after = input.replace(/\r\n/g, '\n');
  if (before === after) return original;
  const endings = original.match(/\r?\n/g) ?? [];
  if (endings.length === (after.match(/\n/g) ?? []).length) {
    let index = 0;
    return after.replace(/\n/g, () => endings[index++]!);
  }

  // Keep the equal prefix/suffix byte-for-byte, even inside the edited block.
  let start = 0;
  while (
    start < before.length &&
    start < after.length &&
    before[start] === after[start]
  )
    start++;
  let beforeEnd = before.length,
    afterEnd = after.length;
  while (
    beforeEnd > start &&
    afterEnd > start &&
    before[beforeEnd - 1] === after[afterEnd - 1]
  ) {
    beforeEnd--;
    afterEnd--;
  }
  function sourceOffset(offset: number) {
    let raw = 0;
    for (let normalized = 0; normalized < offset; normalized++, raw++) {
      if (original[raw] === '\r' && original[raw + 1] === '\n') raw++;
    }
    return raw;
  }
  // Repeated lines may permit several insert/delete alignments. A greedy
  // prefix alone must not decide which of two different old endings survives.
  let suffix = 0;
  const shorter = Math.min(before.length, after.length);
  while (
    suffix < shorter &&
    before[before.length - suffix - 1] === after[after.length - suffix - 1]
  )
    suffix++;
  if (start + suffix > shorter) {
    const earliest = sourceOffset(shorter - suffix);
    const latest = sourceOffset(
      start + Math.max(0, before.length - after.length),
    );
    if (
      new Set(original.slice(earliest, latest).match(/\r?\n/g) ?? []).size > 1
    )
      return null;
  }
  const from = sourceOffset(start),
    to = sourceOffset(beforeEnd);
  const changedEndings = original.slice(from, to).match(/\r?\n/g) ?? [];
  const middle = after.slice(start, afterEnd);
  // A changed multiline middle with different mixed-break counts has no unique
  // assignment. Retain input for Source editing instead of normalizing it.
  if (middle.includes('\n') && new Set(changedEndings).size > 1) return null;
  const ending =
    changedEndings[0] ??
    original.slice(to).match(/\r?\n/)?.[0] ??
    original.slice(0, from).match(/\r?\n/g)?.at(-1) ??
    fallback;
  return (
    original.slice(0, from) + middle.replace(/\n/g, ending) + original.slice(to)
  );
}

export function patchMarkdown(
  source: string,
  range: MarkdownRange,
  text: string,
) {
  if (
    !editableMarkdown(source).some(
      (node) =>
        node.from === range.from &&
        node.to === range.to &&
        node.text === range.text &&
        sameContext(node, range),
    )
  )
    return null;
  if (text === range.text) return source;
  if (!plain.test(text) || text.trim() !== text) return null;
  if (
    range.quotePrefixes &&
    (text.match(/\r?\n/g)?.length ?? 0) !== range.quotePrefixes.length
  )
    return null;
  const preserved = preserveTextBreaks(
    range.text,
    text,
    source.includes('\r\n') ? '\r\n' : '\n',
  );
  if (preserved === null) return null;
  text = preserved;
  if (text === range.text) return source;
  let index = 0;
  const replacement = range.quotePrefixes
    ? text.replace(
        /\r?\n/g,
        (ending) => ending + range.quotePrefixes![index++]!,
      )
    : text;
  const next =
    source.slice(0, range.from) + replacement + source.slice(range.to);
  return editableMarkdown(next).some(
    (node) =>
      node.from === range.from &&
      node.to === range.from + replacement.length &&
      node.text === text &&
      sameContext(node, range),
  )
    ? next
    : null;
}

/** Only parser-owned root positions are used. Opaque blocks are displayed as text. */
export function markdownBlocks(source: string) {
  if (source.length > 500_000) return [];
  try {
    const { tree, end } = parsedSource(source);
    const blocks = tree.children.flatMap((node) => {
      const from = node.position?.start.offset;
      const to = node.position?.end.offset;
      return from === undefined || to === undefined ? [] : [{ from, to }];
    });
    return end
      ? [{ from: 0, to: end }, ...blocks.filter((block) => block.from >= end)]
      : blocks;
  } catch {
    return [];
  }
}
