import { type Mark, type Node as ProseMirrorNode } from 'prosemirror-model';
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { parseWikilinks, type LinkSourceSpan } from '../../links';
import {
  parseLiveSource,
  safeMathSpan,
  type SyntaxNode,
} from '../math/mathSource';
import { renderedSchema as schema } from './schema';

interface AstNode extends SyntaxNode {
  children?: AstNode[];
  url?: string;
  title?: string | null;
  identifier?: string;
  checked?: boolean | null;
  ordered?: boolean;
  spread?: boolean;
  start?: number | null;
  lang?: string | null;
  meta?: string | null;
  align?: (string | null)[];
  alt?: string | null;
}

export interface RenderedSourceRange {
  from: number;
  to: number;
}
interface TextRange extends RenderedSourceRange {
  /** Literal parser text, which need not equal its escaped source bytes. */
  text: string;
  code: boolean;
}
export interface RenderedBlockMapping extends RenderedSourceRange {
  id: string;
  node: ProseMirrorNode;
}
export interface RenderedProjection {
  doc: ProseMirrorNode;
  mapping: {
    source: string;
    path: string;
    prefix: string;
    suffix: string;
    blocks: RenderedBlockMapping[];
    ranges: Map<ProseMirrorNode, RenderedSourceRange>;
    texts: Map<ProseMirrorNode, TextRange[]>;
    tasks: Map<ProseMirrorNode, RenderedSourceRange>;
  };
}

function rangeOf(node: AstNode): RenderedSourceRange | null {
  const from = node.position?.start.offset;
  const to = node.position?.end.offset;
  return from === undefined || to === undefined ? null : { from, to };
}
const normalized = (value: string) => value.replace(/\r\n?|\n/g, '\n');
const newlineOf = (value: string, fallback = '\n') =>
  /\r\n|\r|\n/.exec(value)?.[0] ?? fallback;
const sourceAttrs = new Set(['sourceId', 'sourceFrom', 'sourceTo', 'raw']);

function semanticAttrs(node: ProseMirrorNode): string {
  return JSON.stringify(
    Object.fromEntries(
      Object.entries(node.attrs).filter(([name]) => !sourceAttrs.has(name)),
    ),
  );
}

function semanticEqual(a: ProseMirrorNode, b: ProseMirrorNode): boolean {
  if (
    a.type !== b.type ||
    a.text !== b.text ||
    semanticAttrs(a) !== semanticAttrs(b) ||
    a.marks.length !== b.marks.length ||
    !a.marks.every((mark, index) => mark.eq(b.marks[index]!))
  )
    return false;
  const ac = childrenForComparison(a),
    bc = childrenForComparison(b);
  if (ac.length !== bc.length) return false;
  for (let index = 0; index < ac.length; index++)
    if (!semanticEqual(ac[index]!, bc[index]!)) return false;
  return true;
}

function emptyParagraph(node: ProseMirrorNode) {
  return node.type.name === 'paragraph' && node.content.size === 0;
}
function childrenForComparison(node: ProseMirrorNode): ProseMirrorNode[] {
  const children: ProseMirrorNode[] = [];
  node.forEach((child) => children.push(child));
  if (
    ['blockquote', 'list_item', 'table_cell', 'table_header'].includes(
      node.type.name,
    )
  )
    return children.filter((child) => !emptyParagraph(child));
  return children;
}

/** Parse source as data. JSX, ESM, HTML and expressions never become host DOM. */
export function parseRenderedSource(
  source: string,
  path = 'note.mdx',
): RenderedProjection {
  const tree = parseLiveSource(source, path) as AstNode | null;
  const ranges = new Map<ProseMirrorNode, RenderedSourceRange>();
  const texts = new Map<ProseMirrorNode, TextRange[]>();
  const tasks = new Map<ProseMirrorNode, RenderedSourceRange>();
  const definitions = new Map<string, AstNode>();
  for (const node of tree?.children ?? [])
    if (node.type === 'definition' && node.identifier)
      definitions.set(node.identifier.toLowerCase(), node);
  const links: readonly LinkSourceSpan[] = tree
    ? parseWikilinks(source, tree, [], true)
    : [];

  function remember(node: ProseMirrorNode, ast: AstNode): ProseMirrorNode {
    const range = rangeOf(ast);
    if (range) ranges.set(node, range);
    return node;
  }
  function atomAttrs(ast: AstNode) {
    const range = rangeOf(ast);
    return {
      sourceFrom: range?.from ?? null,
      sourceTo: range?.to ?? null,
      raw: range ? source.slice(range.from, range.to) : (ast.value ?? ''),
    };
  }
  function text(
    value: string,
    marks: readonly Mark[],
    range?: RenderedSourceRange,
    code = false,
  ): ProseMirrorNode[] {
    value = normalized(value);
    if (!value) return [];
    const result = schema.text(value, marks);
    if (range) {
      ranges.set(result, range);
      texts.set(result, [{ ...range, text: value, code }]);
    }
    return [result];
  }
  // Fragment.fromArray merges adjacent identically marked text. Merge here so
  // those exact text-node identities retain their source provenance as well.
  function mergeText(nodes: ProseMirrorNode[]): ProseMirrorNode[] {
    const result: ProseMirrorNode[] = [];
    for (const node of nodes) {
      const last = result.at(-1);
      if (last?.isText && node.isText && last.sameMarkup(node)) {
        const merged = schema.text(last.text! + node.text!, node.marks);
        const parts = [...(texts.get(last) ?? []), ...(texts.get(node) ?? [])];
        if (parts.length) texts.set(merged, parts);
        if (parts.length)
          ranges.set(merged, {
            from: parts[0]!.from,
            to: parts.at(-1)!.to,
          });
        result[result.length - 1] = merged;
      } else result.push(node);
    }
    return result;
  }
  function childrenInline(ast: AstNode, marks: readonly Mark[] = []) {
    return mergeText(
      (ast.children ?? []).flatMap((child) => inline(child, marks)),
    );
  }
  function paragraphContent(ast: AstNode): ProseMirrorNode[] {
    const children = childrenInline(ast);
    const range = rangeOf(ast);
    if (!range) return children;
    // A hard break at a paragraph's current end has no following text yet.
    // CommonMark drops it from the AST, but its marker/newline source is
    // already real. Keep that editable intermediate state without inserting
    // an artificial character just to persuade the Markdown parser.
    const raw = source.slice(range.from, range.to);
    const finalSlashes = /\\+$/.exec(raw)?.[0];
    const last = children.at(-1);
    if (
      finalSlashes &&
      finalSlashes.length % 2 &&
      /^(?:\r\n|\r|\n)/.test(source.slice(range.to)) &&
      last?.isText &&
      last.text!.endsWith('\\')
    ) {
      const shorter = last.text!.slice(0, -1);
      children.pop();
      if (shorter) {
        const node = schema.text(shorter, last.marks);
        const parts = texts.get(last);
        if (parts?.length === 1) {
          const part = { ...parts[0]!, to: parts[0]!.to - 1, text: shorter };
          texts.set(node, [part]);
          ranges.set(node, part);
        }
        children.push(node);
      }
      const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(range.to))![0];
      const br = schema.nodes.hard_break!.create();
      ranges.set(br, { from: range.to - 1, to: range.to + newline.length });
      children.push(br);
      return children;
    }
    const trailing = / {2,}$/.exec(raw);
    if (!trailing) return children;
    let from = range.to - trailing[0].length;
    let cursor = range.to;
    while (true) {
      const newline = /^(?:\r\n|\r|\n)/.exec(source.slice(cursor));
      if (!newline) break;
      const br = schema.nodes.hard_break!.create();
      cursor += newline[0].length;
      ranges.set(br, { from, to: cursor });
      children.push(br);
      const additional = /^ {2,}(?=\r\n|\r|\n)/.exec(source.slice(cursor));
      if (!additional) break;
      from = cursor;
      cursor += additional[0].length;
    }
    return children;
  }
  function inline(ast: AstNode, marks: readonly Mark[]): ProseMirrorNode[] {
    const range = rangeOf(ast);
    const attrs = atomAttrs(ast);
    if (ast.type === 'text') {
      const selected = range
        ? links.filter((link) => link.from >= range.from && link.to <= range.to)
        : [];
      // Escaped/entity text needs a decoded-to-source map before splitting.
      if (
        selected.length &&
        range &&
        normalized(source.slice(range.from, range.to)) === ast.value
      ) {
        const result: ProseMirrorNode[] = [];
        let from = range.from;
        for (const link of selected) {
          result.push(
            ...text(normalized(source.slice(from, link.from)), marks, {
              from,
              to: link.from,
            }),
          );
          const node = schema.nodes.wikilink!.create(
            {
              raw: link.raw,
              target: link.target,
              alias: link.alias ?? null,
              sourceFrom: link.from,
              sourceTo: link.to,
            },
            null,
            marks,
          );
          ranges.set(node, { from: link.from, to: link.to });
          result.push(node);
          from = link.to;
        }
        result.push(
          ...text(normalized(source.slice(from, range.to)), marks, {
            from,
            to: range.to,
          }),
        );
        return result;
      }
      return text(ast.value ?? '', marks, range ?? undefined);
    }
    const markName = {
      strong: 'strong',
      emphasis: 'em',
      delete: 'strike',
    }[ast.type];
    if (markName)
      return childrenInline(
        ast,
        schema.marks[markName]!.create().addToSet(marks),
      );
    if (ast.type === 'inlineCode') {
      const raw = attrs.raw;
      const fence = /^`+/.exec(raw)?.[0];
      const innerRange =
        range && fence && raw.endsWith(fence)
          ? { from: range.from + fence.length, to: range.to - fence.length }
          : undefined;
      return text(
        ast.value ?? '',
        [schema.marks.code!.create()],
        innerRange,
        true,
      );
    }
    if (ast.type === 'inlineMath') {
      const span = safeMathSpan(source, ast);
      if (span)
        return [
          remember(
            schema.nodes.inline_math!.create(
              {
                ...attrs,
                value: normalized(span.originalInner),
                kind: 'inline',
              },
              null,
              marks,
            ),
            ast,
          ),
        ];
    }
    if (ast.type === 'break')
      return [
        remember(schema.nodes.hard_break!.create(null, null, marks), ast),
      ];
    if (ast.type === 'link' || ast.type === 'linkReference') {
      const definition = ast.identifier
        ? definitions.get(ast.identifier.toLowerCase())
        : undefined;
      const href = ast.url ?? definition?.url;
      if (href)
        return childrenInline(
          ast,
          schema.marks
            .link!.create({
              href,
              title: ast.title ?? definition?.title ?? null,
            })
            .addToSet(marks),
        );
    }
    if (ast.type === 'image' || ast.type === 'imageReference') {
      const definition = ast.identifier
        ? definitions.get(ast.identifier.toLowerCase())
        : undefined;
      return [
        remember(
          schema.nodes.image!.create(
            {
              ...attrs,
              src: ast.url ?? definition?.url ?? '',
              alt: ast.alt ?? '',
              title: ast.title ?? definition?.title ?? null,
            },
            null,
            marks,
          ),
          ast,
        ),
      ];
    }
    return [
      remember(
        schema.nodes.source_inline!.create(
          { ...attrs, kind: ast.type, value: normalized(attrs.raw) },
          null,
          marks,
        ),
        ast,
      ),
    ];
  }
  function block(ast: AstNode): ProseMirrorNode {
    let result: ProseMirrorNode;
    const attrs = atomAttrs(ast);
    switch (ast.type) {
      case 'paragraph':
        result = schema.nodes.paragraph!.create(null, paragraphContent(ast));
        break;
      case 'heading':
        result = schema.nodes.heading!.create(
          { level: ast.depth ?? 1 },
          childrenInline(ast),
        );
        break;
      case 'blockquote':
        result = schema.nodes.blockquote!.create(
          null,
          (ast.children ?? []).map(block),
        );
        break;
      case 'list':
        result = schema.nodes[
          ast.ordered ? 'ordered_list' : 'bullet_list'
        ]!.create(
          { order: ast.start ?? 1, tight: !ast.spread },
          (ast.children ?? []).map(block),
        );
        break;
      case 'listItem': {
        let children = (ast.children ?? []).map(block);
        let checked = ast.checked ?? null;
        // GFM does not recognize an empty task as a checkbox until it has
        // content. Retain this source-backed empty editor state so Enter can
        // create a task and typing can fill it without any placeholder bytes.
        const emptyTask = /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\][ \t]*$/.exec(
          attrs.raw,
        );
        if (
          checked === null &&
          emptyTask &&
          children.length === 1 &&
          children[0]!.type === schema.nodes.paragraph &&
          /^\[[ xX]\]$/.test(children[0]!.textContent)
        ) {
          checked = emptyTask[1]!.toLowerCase() === 'x';
          children = [schema.nodes.paragraph!.create()];
        }
        if (children[0]?.type !== schema.nodes.paragraph)
          children.unshift(schema.nodes.paragraph!.create());
        result = schema.nodes.list_item!.create({ checked }, children);
        if (typeof checked === 'boolean' && attrs.sourceFrom !== null) {
          const match = /^(?:[-+*]|\d+[.)])[ \t]+\[([ xX])\]/.exec(attrs.raw);
          if (match) {
            const from = attrs.sourceFrom + match[0].length - 2;
            tasks.set(result, { from, to: from + 1 });
          }
        }
        break;
      }
      case 'thematicBreak':
        result = schema.nodes.horizontal_rule!.create();
        break;
      case 'code': {
        const value = ast.value ?? '';
        let textRange: RenderedSourceRange | undefined;
        const opening = /^ {0,3}(?:`{3,}|~{3,})[^\r\n]*(?:\r\n|\r|\n)/.exec(
          attrs.raw,
        );
        if (opening && attrs.sourceFrom !== null) {
          const from = attrs.sourceFrom + opening[0].length;
          const closing = /(?:\r\n|\r|\n) {0,3}(?:`{3,}|~{3,})[ \t]*$/.exec(
            attrs.raw,
          );
          if (closing) {
            const to = attrs.sourceFrom + closing.index;
            if (normalized(source.slice(from, to)) === value)
              textRange = { from, to };
          }
        }
        result = schema.nodes.code_block!.create(
          { language: [ast.lang, ast.meta].filter(Boolean).join(' ') },
          text(value, [], textRange, true),
        );
        break;
      }
      case 'math': {
        const span = safeMathSpan(source, ast);
        result = span
          ? schema.nodes.math_block!.create({
              ...attrs,
              value: normalized(ast.value ?? span.originalInner.trim()),
              kind: 'display',
            })
          : opaque(ast);
        break;
      }
      case 'table':
        result = schema.nodes.table!.create(
          null,
          (ast.children ?? []).map((row, rowIndex) =>
            remember(
              schema.nodes.table_row!.create(
                null,
                (row.children ?? []).map((cell, column) =>
                  remember(
                    schema.nodes[
                      rowIndex === 0 ? 'table_header' : 'table_cell'
                    ]!.create(
                      { align: ast.align?.[column] ?? null },
                      schema.nodes.paragraph!.create(
                        null,
                        childrenInline(cell),
                      ),
                    ),
                    cell,
                  ),
                ),
              ),
              row,
            ),
          ),
        );
        break;
      default:
        result = opaque(ast);
    }
    return remember(result, ast);
  }
  function opaque(ast: AstNode) {
    const attrs = atomAttrs(ast);
    return schema.nodes.source_block!.create({
      ...attrs,
      kind: ast.type,
      value: normalized(attrs.raw),
    });
  }
  const blocks: RenderedBlockMapping[] = [];
  const sourceNodes: AstNode[] =
    tree?.children ??
    (source
      ? [
          {
            type: 'unparsed',
            value: source,
            position: { start: { offset: 0 }, end: { offset: source.length } },
          },
        ]
      : []);
  for (const ast of sourceNodes) {
    const range = rangeOf(ast);
    if (!range || range.to <= range.from) continue;
    // Include horizontal trailing bytes in the owning block. In particular,
    // the space after an empty task marker must not become a trailing suffix
    // that gets appended after every subsequent typed task label.
    while (range.to < source.length && /[ \t]/.test(source[range.to]!))
      range.to++;
    const original = block(ast);
    // A terminal virtual break owns its physical newline. Otherwise it would
    // be counted again as a document suffix after the next typed character.
    original.descendants((child) => {
      if (child.type.name === 'hard_break')
        range.to = Math.max(range.to, ranges.get(child)?.to ?? range.to);
    });
    const id = `block-${blocks.length}-${range.from}`;
    const node = original.type.create(
      { ...original.attrs, sourceId: id },
      original.content,
      original.marks,
    );
    ranges.set(node, range);
    blocks.push({ ...range, id, node });
  }
  const doc = schema.nodes.doc!.create(
    null,
    blocks.length
      ? blocks.map((item) => item.node)
      : schema.nodes.paragraph!.create(),
  );
  return {
    doc,
    mapping: {
      source,
      path,
      prefix: blocks.length ? source.slice(0, blocks[0]!.from) : source,
      suffix: blocks.length ? source.slice(blocks.at(-1)!.to) : '',
      blocks,
      ranges,
      texts,
      tasks,
    },
  };
}

function atomMarkdown(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case 'inline_math':
      return `$${node.attrs.value}$`;
    case 'math_block':
      return `$$\n${node.attrs.value}\n$$`;
    case 'wikilink':
      return `[[${node.attrs.target}${node.attrs.alias === null ? '' : `|${node.attrs.alias}`}]]`;
    case 'source_inline':
    case 'source_block':
      return node.attrs.value;
    default:
      return '';
  }
}

const serializer = new MarkdownSerializer(
  {
    ...defaultMarkdownSerializer.nodes,
    bullet_list(state, node) {
      state.renderList(node, '  ', () => '- ');
    },
    list_item(state, node) {
      if (typeof node.attrs.checked === 'boolean')
        state.write(node.attrs.checked ? '[x] ' : '[ ] ');
      state.renderContent(node);
    },
    code_block(state, node) {
      const longest = Math.max(
        2,
        ...(node.textContent.match(/`+/g) ?? []).map((match) => match.length),
      );
      const fence = '`'.repeat(longest + 1);
      state.write(fence + (node.attrs.language || '') + '\n');
      state.text(node.textContent, false);
      state.write('\n' + fence);
      state.closeBlock(node);
    },
    hard_break(state) {
      // Backslash markers remain nonblank lines when several consecutive hard
      // breaks are inserted, so later text stays in the same paragraph.
      state.write('\\\n');
    },
    inline_math(state, node) {
      state.write(atomMarkdown(node));
    },
    math_block(state, node) {
      state.write(atomMarkdown(node));
      state.closeBlock(node);
    },
    wikilink(state, node) {
      state.write(atomMarkdown(node));
    },
    source_inline(state, node) {
      state.write(atomMarkdown(node));
    },
    source_block(state, node) {
      state.write(atomMarkdown(node));
      state.closeBlock(node);
    },
    table(state, node) {
      const rows: string[][] = [];
      node.forEach((row) => {
        const cells: string[] = [];
        row.forEach((cell) => {
          if (cell.attrs.colspan !== 1 || cell.attrs.rowspan !== 1)
            throw new Error('Merged table cells cannot be saved as Markdown.');
          cells.push(
            serializer
              .serialize(schema.nodes.doc!.create(null, cell.content))
              .replace(/\n+/g, ' ')
              // GFM recognizes table pipes before inline code parsing. Code
              // marks intentionally bypass ordinary Markdown escaping, so
              // every still-unescaped pipe needs its table-level escape.
              .replace(/(\\*)\|/g, (match, slashes: string) =>
                slashes.length % 2 ? match : `${slashes}\\|`,
              ),
          );
        });
        rows.push(cells);
      });
      if (!rows.length) return;
      const writeRow = (cells: string[]) =>
        state.write(`| ${cells.join(' | ')} |\n`);
      writeRow(rows[0]!);
      const alignments: string[] = [];
      node.firstChild!.forEach((cell) =>
        alignments.push(
          cell.attrs.align === 'center'
            ? ':---:'
            : cell.attrs.align === 'right'
              ? '---:'
              : cell.attrs.align === 'left'
                ? ':---'
                : '---',
        ),
      );
      writeRow(alignments);
      rows.slice(1).forEach(writeRow);
      state.closeBlock(node);
    },
  },
  {
    ...defaultMarkdownSerializer.marks,
    // Angle-bracket autolinks are JSX syntax in MDX. Explicit Markdown links
    // round-trip in both .md and .mdx documents, including URL-as-label links.
    link: {
      open: '[',
      close: (_state, mark) =>
        `](${String(mark.attrs.href).replace(/[()"\\]/g, '\\$&')}${mark.attrs.title ? ` "${String(mark.attrs.title).replace(/["\\]/g, '\\$&')}"` : ''})`,
      mixable: true,
    },
    strike: {
      open: '~~',
      close: '~~',
      mixable: true,
      expelEnclosingWhitespace: true,
    },
  },
  { escapeExtraCharacters: /[{}<>$|&]/g },
);

interface Patch extends RenderedSourceRange {
  value: string;
}
function offsetsFor(raw: string): number[] {
  const offsets = [0];
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] === '\r' && raw[index + 1] === '\n') index++;
    offsets.push(index + 1);
  }
  return offsets;
}
function escapedText(value: string): string {
  return value
    .replace(/[\\`*_[\]{}<>$|&~]/g, '\\$&')
    .replace(/(^|\n)([ \t]*)([-+#>]|\d+[.)])(?=[ \t])/g, '$1$2\\$3');
}
function sparseBlock(
  previous: RenderedProjection,
  block: RenderedBlockMapping,
  next: ProseMirrorNode,
): string | null {
  const { mapping } = previous;
  const patches: Patch[] = [];
  function walk(before: ProseMirrorNode, after: ProseMirrorNode): boolean {
    if (before.eq(after)) return true;
    if (before.type !== after.type || before.childCount !== after.childCount)
      return false;
    if (!before.sameMarkup(after)) {
      if (
        before.type.name === 'list_item' &&
        typeof before.attrs.checked === 'boolean' &&
        typeof after.attrs.checked === 'boolean' &&
        mapping.tasks.has(before)
      ) {
        patches.push({
          ...mapping.tasks.get(before)!,
          value: after.attrs.checked ? 'x' : ' ',
        });
      } else if (
        before.isAtom &&
        [
          'inline_math',
          'math_block',
          'wikilink',
          'source_inline',
          'source_block',
        ].includes(before.type.name) &&
        mapping.ranges.has(before)
      ) {
        const range = mapping.ranges.get(before)!;
        patches.push({
          ...range,
          value: normalized(atomMarkdown(after)).replace(
            /\n/g,
            newlineOf(mapping.source.slice(range.from, range.to)),
          ),
        });
        return true;
      } else return false;
    }
    if (before.isText) {
      const spans = mapping.texts.get(before);
      // A merged decoded entity / escape needs block serialization; it cannot
      // safely be addressed with raw character offsets.
      if (!spans || spans.length !== 1) return false;
      const span = spans[0]!;
      const raw = mapping.source.slice(span.from, span.to);
      if (normalized(raw) !== before.text) return false;
      const oldValue = before.text!,
        newValue = after.text!;
      let start = 0;
      while (
        start < oldValue.length &&
        start < newValue.length &&
        oldValue[start] === newValue[start]
      )
        start++;
      let end = oldValue.length,
        nextEnd = newValue.length;
      while (
        end > start &&
        nextEnd > start &&
        oldValue[end - 1] === newValue[nextEnd - 1]
      ) {
        end--;
        nextEnd--;
      }
      // Never bisect a supplementary Unicode scalar in the source patch.
      if (start > 0 && /[\uDC00-\uDFFF]/.test(oldValue[start] ?? '')) start--;
      if (
        end < oldValue.length &&
        /[\uDC00-\uDFFF]/.test(oldValue[end] ?? '')
      ) {
        end++;
        nextEnd++;
      }
      const inserted = newValue.slice(start, nextEnd);
      if (
        span.code &&
        before.marks.some((mark) => mark.type.name === 'code') &&
        /[`\r\n]/.test(inserted)
      )
        return false;
      const offsets = offsetsFor(raw);
      const value = (span.code ? inserted : escapedText(inserted)).replace(
        /\n/g,
        newlineOf(raw, newlineOf(mapping.source)),
      );
      patches.push({
        from: span.from + offsets[start]!,
        to: span.from + offsets[end]!,
        value,
      });
      return true;
    }
    for (let index = 0; index < before.childCount; index++)
      if (!walk(before.child(index), after.child(index))) return false;
    return true;
  }
  if (!walk(block.node, next)) return null;
  let result = mapping.source.slice(block.from, block.to);
  patches.sort((a, b) => b.from - a.from);
  let boundary = block.to;
  for (const patch of patches) {
    if (patch.from < block.from || patch.to > boundary) return null;
    result =
      result.slice(0, patch.from - block.from) +
      patch.value +
      result.slice(patch.to - block.from);
    boundary = patch.from;
  }
  return result;
}

/** Only changed top-level blocks are serialized. Every other source slice is reused. */
export function serializeRenderedChange(
  previous: RenderedProjection,
  newDoc: ProseMirrorNode,
  _transaction?: unknown,
): string {
  void _transaction;
  if (previous.doc.eq(newDoc)) return previous.mapping.source;
  const { mapping } = previous;
  const used = new Set<RenderedBlockMapping>();
  const newline = newlineOf(mapping.source);
  let result = mapping.prefix;
  let previousIndex: number | null = null;
  newDoc.forEach((node, _offset, index) => {
    const id: unknown = node.attrs.sourceId;
    let matchIndex = mapping.blocks.findIndex(
      (item) => !used.has(item) && item.node === node,
    );
    if (matchIndex < 0 && typeof id === 'string')
      matchIndex = mapping.blocks.findIndex(
        (item) => !used.has(item) && item.id === id,
      );
    if (
      matchIndex < 0 &&
      id === null &&
      mapping.blocks[index]?.node.attrs.sourceId === null &&
      !used.has(mapping.blocks[index]!)
    )
      matchIndex = index;
    const matched =
      matchIndex < 0
        ? undefined
        : { block: mapping.blocks[matchIndex]!, index: matchIndex };
    if (matched) used.add(matched.block);
    if (index) {
      if (
        matched &&
        previousIndex !== null &&
        matched.index === previousIndex + 1
      )
        result += mapping.source.slice(
          mapping.blocks[previousIndex]!.to,
          matched.block.from,
        );
      else result += newline + newline;
    } else if (
      !mapping.blocks.length &&
      result &&
      !/[\r\n]$/.test(result) &&
      result !== '\uFEFF'
    ) {
      result += newline + newline;
    }
    if (matched && matched.block.node.eq(node))
      result += mapping.source.slice(matched.block.from, matched.block.to);
    else {
      const sparse = matched
        ? sparseBlock(previous, matched.block, node)
        : null;
      if (sparse !== null) result += sparse;
      else {
        const raw = serializer.serialize(schema.nodes.doc!.create(null, node), {
          tightLists: true,
        });
        result += normalized(raw).replace(
          /\n/g,
          matched
            ? newlineOf(
                mapping.source.slice(matched.block.from, matched.block.to),
                newline,
              )
            : newline,
        );
      }
    }
    previousIndex = matched?.index ?? null;
  });
  return result + mapping.suffix;
}

/** Look up current raw offsets without trusting stale atom attributes. */
export function renderedSourceRange(
  projection: RenderedProjection,
  node: ProseMirrorNode,
): RenderedSourceRange | null {
  return projection.mapping.ranges.get(node) ?? null;
}

/** Refresh provenance while keeping the caller's document nodes and selection. */
export function rebaseRenderedProjection(
  previous: RenderedProjection,
  newDoc: ProseMirrorNode,
  source: string,
): RenderedProjection {
  const parsed = parseRenderedSource(source, previous.mapping.path);
  const ranges = new Map<ProseMirrorNode, RenderedSourceRange>();
  const texts = new Map<ProseMirrorNode, TextRange[]>();
  const tasks = new Map<ProseMirrorNode, RenderedSourceRange>();
  function transfer(parsedNode: ProseMirrorNode, currentNode: ProseMirrorNode) {
    const range = parsed.mapping.ranges.get(parsedNode);
    const text = parsed.mapping.texts.get(parsedNode);
    const task = parsed.mapping.tasks.get(parsedNode);
    if (range) ranges.set(currentNode, range);
    if (text) texts.set(currentNode, text);
    if (task) tasks.set(currentNode, task);
    const parsedChildren = childrenForComparison(parsedNode);
    const currentChildren = childrenForComparison(currentNode);
    for (let index = 0; index < parsedChildren.length; index++)
      transfer(parsedChildren[index]!, currentChildren[index]!);
  }
  const blocks: RenderedBlockMapping[] = [];
  let parsedIndex = 0;
  let cursor = Math.min(previous.mapping.prefix.length, source.length);
  newDoc.forEach((node, _offset, index) => {
    const block = parsed.mapping.blocks[parsedIndex];
    if (block && semanticEqual(block.node, node)) {
      transfer(block.node, node);
      blocks.push({ ...block, id: node.attrs.sourceId ?? block.id, node });
      cursor = block.to;
      parsedIndex++;
      return;
    }
    if (emptyParagraph(node)) {
      if (index) {
        const gap = source.slice(cursor, block?.from ?? source.length);
        const breaks = /^(?:[ \t]*(?:\r\n|\r|\n)){2}/.exec(gap);
        cursor += breaks?.[0].length ?? 0;
      }
      const range = { from: cursor, to: cursor };
      ranges.set(node, range);
      blocks.push({
        ...range,
        id: node.attrs.sourceId ?? `empty-${index}-${cursor}`,
        node,
      });
      return;
    }
    throw new Error(
      'This edit cannot be represented faithfully in Markdown. Undo it or use Source.',
    );
  });
  if (parsedIndex !== parsed.mapping.blocks.length)
    throw new Error(
      'This edit changed the Markdown structure unexpectedly. Your previous source is retained.',
    );
  return {
    doc: newDoc,
    mapping: {
      ...parsed.mapping,
      prefix: blocks.length ? source.slice(0, blocks[0]!.from) : source,
      suffix: blocks.length ? source.slice(blocks.at(-1)!.to) : '',
      blocks,
      ranges,
      texts,
      tasks,
    },
  };
}
