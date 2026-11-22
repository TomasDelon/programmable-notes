import type { LinkSourceSpan, RawRange, SyntaxNode } from './types';

/** Conservative budgets, to avoid unbounded synchronous analysis in editors. */
export const MAX_LINK_SOURCE_UNITS = 500_000;
export const MAX_LINK_MARKERS = 4_096;
const MAX_AST_NODES = 100_000;
const MAX_AST_DEPTH = 64;

const textContainers = new Set([
  'root',
  'paragraph',
  'heading',
  'blockquote',
  'list',
  'listItem',
  'strong',
  'emphasis',
  'delete',
  'table',
  'tableRow',
  'tableCell',
]);

function validRange(range: RawRange, length: number): boolean {
  return (
    Number.isSafeInteger(range.from) &&
    Number.isSafeInteger(range.to) &&
    range.from >= 0 &&
    range.to >= range.from &&
    range.to <= length
  );
}

function nodeRange(node: SyntaxNode): RawRange | null {
  const from = node.position?.start?.offset;
  const to = node.position?.end?.offset;
  return typeof from === 'number' && typeof to === 'number'
    ? { from, to }
    : null;
}

/** Returns true if a note's raw source is safe to analyze on the editor thread. */
export function withinLinkAnalysisBudget(source: string): boolean {
  if (source.length > MAX_LINK_SOURCE_UNITS) return false;
  let markers = 0;
  for (let i = 0; i < source.length; i++) {
    if (source[i] === '[' || source[i] === ']') {
      markers++;
      if (markers > MAX_LINK_MARKERS) return false;
    }
  }
  return true;
}

/**
 * Extract *only* literal `text` node ranges from an already parsed MD/MDX AST.
 * Unknown/opaque node kinds are not traversed, including JSX, JS, links,
 * code, math, frontmatter and HTML. Invalid or overlapping positions fail
 * the entire extraction closed. This function does not parse MDX itself.
 */
export function collectLiteralTextRanges(
  source: string,
  syntax: SyntaxNode,
): readonly RawRange[] {
  if (!withinLinkAnalysisBudget(source) || syntax.type !== 'root') return [];
  const root = nodeRange(syntax);
  if (!root || root.from !== 0 || root.to !== source.length) return [];
  const ranges: RawRange[] = [];
  let nodes = 0;
  function walk(node: SyntaxNode, enclosing: RawRange, depth: number): boolean {
    nodes++;
    if (nodes > MAX_AST_NODES || depth > MAX_AST_DEPTH) return false;
    const range = nodeRange(node);
    if (
      !range ||
      !validRange(range, source.length) ||
      range.from < enclosing.from ||
      range.to > enclosing.to
    )
      return false;
    if (node.type === 'text') {
      if (node.children?.length) return false;
      ranges.push(range);
      return true;
    }
    if (!textContainers.has(node.type)) return true;
    const children = node.children ?? [];
    let previousEnd = range.from;
    for (const child of children) {
      const childRange = nodeRange(child);
      if (!childRange || childRange.from < previousEnd) return false;
      if (!walk(child, range, depth + 1)) return false;
      previousEnd = childRange.to;
    }
    return true;
  }
  if (!walk(syntax, root, 0)) return [];
  return ranges;
}

function containsControlCharacters(value: string): boolean {
  return Array.from(value).some(
    (character) =>
      character.charCodeAt(0) < 32 || character.charCodeAt(0) === 127,
  );
}

/** Source grammar for v0.1: root-relative slash segments, exact case. */
export function validLinkTarget(target: string): boolean {
  if (!target || target.length > 1_024 || target.trim().length === 0)
    return false;
  if (
    containsControlCharacters(target) ||
    ['[', ']', '\\', '|'].some((symbol) => target.includes(symbol))
  )
    return false;
  return target
    .split('/')
    .every((part) => part !== '' && part !== '.' && part !== '..');
}

function validAlias(alias: string): boolean {
  return (
    alias.length > 0 &&
    alias.length <= 1_024 &&
    alias.trim().length > 0 &&
    !containsControlCharacters(alias) &&
    !['[', ']', '|'].some((symbol) => alias.includes(symbol))
  );
}

function escapedOpening(source: string, index: number): boolean {
  let precedingBackslashes = 0;
  for (let i = index - 1; i >= 0 && source[i] === '\\'; i--)
    precedingBackslashes++;
  return precedingBackslashes % 2 === 1;
}

function intersects(a: RawRange, b: RawRange): boolean {
  return a.from < b.to && b.from < a.to;
}

/**
 * Read-only extraction from a trusted Markdown/MDX parser's positional AST.
 * The returned positions always address the original, untouched JS source.
 * A text node containing raw '$' or '`' is withheld, since it could denote
 * unparsed math/code if the caller omitted the required syntax plugins.
 */
export function parseWikilinks(
  source: string,
  syntax: SyntaxNode,
  opaqueRanges: readonly RawRange[] = [],
  syntaxConfirmed = false,
): readonly LinkSourceSpan[] {
  if (!withinLinkAnalysisBudget(source)) return [];
  if (opaqueRanges.some((range) => !validRange(range, source.length)))
    return [];
  const texts = collectLiteralTextRanges(source, syntax);
  const spans: LinkSourceSpan[] = [];
  for (const textRange of texts) {
    if (textRange.from === textRange.to) continue;
    const text = source.slice(textRange.from, textRange.to);
    // False negatives are preferable to executable/opaque false positives.
    if (!syntaxConfirmed && (text.includes('$') || text.includes('`')))
      continue;
    let start = 0;
    while (start < text.length) {
      const opening = text.indexOf('[[', start);
      if (opening < 0) break;
      const from = textRange.from + opening;
      const closing = text.indexOf(']]', opening + 2);
      if (closing < 0) break;
      start = closing + 2;
      const to = textRange.from + start;
      if (
        (from > 0 && source[from - 1] === '[') ||
        (to < source.length && source[to] === ']') ||
        escapedOpening(source, from)
      )
        continue;
      const inside = text.slice(opening + 2, closing);
      // Nested markers, newlines and zero/extra separators are ambiguous.
      if (
        inside.includes('[') ||
        inside.includes(']') ||
        inside.includes('\n') ||
        inside.includes('\r')
      )
        continue;
      const divider = inside.indexOf('|');
      if (divider >= 0 && inside.indexOf('|', divider + 1) >= 0) continue;
      const target = divider < 0 ? inside : inside.slice(0, divider);
      const alias = divider < 0 ? undefined : inside.slice(divider + 1);
      if (
        !validLinkTarget(target) ||
        (alias !== undefined && !validAlias(alias))
      )
        continue;
      if (opaqueRanges.some((range) => intersects({ from, to }, range)))
        continue;
      const raw = source.slice(from, to);
      if (raw !== `[[${target}${alias === undefined ? '' : '|' + alias}]]`)
        continue;
      spans.push(
        Object.freeze({
          from,
          to,
          raw,
          target,
          ...(alias === undefined ? {} : { alias }),
        }),
      );
    }
  }
  spans.sort((a, b) => a.from - b.from || a.to - b.to);
  // Corrupt/overlapping AST spans must never emit overlapping decorations.
  if (spans.some((span, i) => i > 0 && span.from < spans[i - 1]!.to)) return [];
  return Object.freeze(spans);
}
