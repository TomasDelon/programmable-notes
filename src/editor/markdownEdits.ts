import { createProcessor } from '@mdx-js/mdx';

export interface MarkdownRange {
  from: number;
  to: number;
  text: string;
  headingDepth?: 1 | 2 | 3 | 4 | 5 | 6;
}

const plain = /^[\p{L}\p{M}\p{N} ,.!?'"’–—]+$/u;
const processor = createProcessor();

export function editableMarkdown(source: string): MarkdownRange[] {
  if (source.length > 500_000) return [];
  try {
    return processor.parse(source).children.flatMap((node) => {
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
        node.headingDepth === range.headingDepth,
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
      node.headingDepth === range.headingDepth,
  )
    ? next
    : null;
}
