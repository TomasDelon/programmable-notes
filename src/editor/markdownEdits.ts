import { createProcessor } from '@mdx-js/mdx';

export interface MarkdownRange {
  from: number;
  to: number;
  text: string;
  headingDepth?: 1 | 2 | 3 | 4 | 5 | 6;
  list?: { from: number; ordered: boolean; start: number };
}

const plain = /^[\P{Cc}\t\r\n]+$/u;
const processor = createProcessor();

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
  const end = metadataEnd(source);
  // Preserve UTF-16 offsets and line endings. No author bytes are rewritten.
  const masked =
    source.slice(0, end).replace(/[^\r\n]/g, ' ') + source.slice(end);
  return { end, tree: processor.parse(masked) };
}

export function editableMarkdown(source: string): MarkdownRange[] {
  if (source.length > 500_000) return [];
  try {
    const { tree, end } = parsedSource(source);
    return tree.children.flatMap((root): MarkdownRange[] => {
      if ((root.position?.start.offset ?? -1) < end) return [];
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
    a.list?.from === b.list?.from &&
    a.list?.ordered === b.list?.ordered &&
    a.list?.start === b.list?.start
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
  // New lines inherit this document's line ending; untouched spans remain exact.
  text = text.replace(/\r?\n/g, source.includes('\r\n') ? '\r\n' : '\n');
  const next = source.slice(0, range.from) + text + source.slice(range.to);
  return editableMarkdown(next).some(
    (node) =>
      node.from === range.from &&
      node.to === range.from + text.length &&
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
