import { createProcessor } from '@mdx-js/mdx';

export interface MarkdownRange {
  from: number;
  to: number;
  text: string;
  headingDepth?: 1 | 2 | 3 | 4 | 5 | 6;
  list?: { from: number; ordered: boolean; start: number };
}

const plain = /^[\p{L}\p{M}\p{N} ,.!?'"’–—]+$/u;
const processor = createProcessor();

export function editableMarkdown(source: string): MarkdownRange[] {
  if (source.length > 500_000) return [];
  try {
    return processor.parse(source).children.flatMap((root): MarkdownRange[] => {
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
          if (text !== child.value || !plain.test(text)) return;
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
      if (text !== child.value || !plain.test(text)) return [];
      if (node.type === 'paragraph')
        return start === from && node.position?.end.offset === to
          ? [{ from, to, text }]
          : [];
      if (!/^#{1,6}[ \t]+$/.test(source.slice(start, from))) return [];
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
