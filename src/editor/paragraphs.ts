import { createProcessor } from '@mdx-js/mdx';

export interface Paragraph {
  from: number;
  to: number;
  text: string;
}

const plain = /^[\p{L}\p{M}\p{N} ,.!?'"’–—]+$/u;

export function paragraphs(source: string): Paragraph[] {
  if (source.length > 500_000) return [];
  try {
    return createProcessor()
      .parse(source)
      .children.flatMap((node) => {
        const from = node.position?.start.offset;
        const to = node.position?.end.offset;
        if (node.type !== 'paragraph' || from === undefined || to === undefined)
          return [];
        const text = source.slice(from, to);
        return node.children.length === 1 &&
          node.children[0]?.type === 'text' &&
          node.children[0].value === text &&
          plain.test(text)
          ? [{ from, to, text }]
          : [];
      });
  } catch {
    return [];
  }
}

export function patchParagraph(source: string, range: Paragraph, text: string) {
  if (text === range.text) return source;
  if (!plain.test(text) || text.trim() !== text) return null;
  const next = source.slice(0, range.from) + text + source.slice(range.to);
  return paragraphs(next).some(
    (node) => node.from === range.from && node.to === range.from + text.length,
  )
    ? next
    : null;
}
