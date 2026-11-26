import {
  Fragment,
  type Mark,
  type Node as ProseMirrorNode,
} from 'prosemirror-model';
import {
  MarkdownSerializer,
  defaultMarkdownSerializer,
} from 'prosemirror-markdown';
import { Transaction } from 'prosemirror-state';
import { decodeString } from 'micromark-util-decode-string';
import { parseWikilinks, type LinkSourceSpan } from '../../links';
import {
  analyzeLiveSource,
  safeMathSpan,
  type SyntaxNode,
} from '../math/mathSource';
import { renderedSchema as schema } from './schema';
import { visualAnalysisLimited } from '../markdownEdits';

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
  /** Unfinished math is editable text; preserve TeX rather than Markdown-escaping it. */
  rawLiteral: boolean;
}
export interface RenderedBlockMapping extends RenderedSourceRange {
  requiresSparseWikilinkEdit?: boolean;
  id: string;
  node: ProseMirrorNode;
}
export interface RenderedProjection {
  doc: ProseMirrorNode;
  analysisDiagnostic: string | null;
  mapping: {
    source: string;
    path: string;
    prefix: string;
    suffix: string;
    blocks: RenderedBlockMapping[];
    ranges: Map<ProseMirrorNode, RenderedSourceRange>;
    texts: Map<ProseMirrorNode, TextRange[]>;
    tasks: Map<ProseMirrorNode, RenderedSourceRange>;
    containerPrefixEdges: Set<number>;
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
      Object.entries(node.attrs).filter(
        ([name]) =>
          !sourceAttrs.has(name) &&
          !(
            ['inline_math', 'math_block'].includes(node.type.name) &&
            ['value', 'kind', 'literal'].includes(name)
          ),
      ),
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
  const analysis = analyzeLiveSource(source, path);
  const tree = analysis.tree as AstNode | null;
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

  const containerPrefixEdges = new Set<number>();
  let requiresSparseWikilinkEdit: boolean;

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
    rawLiteral = false,
  ): ProseMirrorNode[] {
    value = normalized(value);
    if (!value) return [];
    const result = schema.text(value, marks);
    if (range) {
      ranges.set(result, range);
      texts.set(result, [{ ...range, text: value, code, rawLiteral }]);
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
      if (selected.length && range) {
        const value = normalized(ast.value ?? '');
        const prefixes = tree?.data?.continuationPrefixes;
        const gaps: RenderedSourceRange[] = [];
        if (prefixes?.size) {
          for (const newline of attrs.raw.matchAll(/\r\n?|\n/g)) {
            const from = range.from + newline.index + newline[0].length;
            let to = from;
            let end = prefixes.get(to);
            while (
              end !== undefined &&
              end > to &&
              end <= range.to &&
              /^[> \t]+$/.test(source.slice(to, end))
            ) {
              to = end;
              end = prefixes.get(to);
            }
            if (to !== from) gaps.push({ from, to });
          }
        }
        // A link and every invisible prefix come from the same parser pass.
        // Validate all visible parts together before installing any raw gaps.
        const segments = [...selected, ...gaps].sort((a, b) => a.from - b.from);
        const result: ProseMirrorNode[] = [];
        const visible: string[] = [];
        let from = range.from;
        let pending: TextRange[] = [];
        // A multiline run is a single ProseMirror text node. Keep each
        // source part once, with no node or bytes for the intervening prefix.
        function flushText() {
          if (!pending.length) return;
          const node = schema.text(
            pending.map((part) => part.text).join(''),
            marks,
          );
          texts.set(node, pending);
          ranges.set(node, { from: pending[0]!.from, to: pending.at(-1)!.to });
          result.push(node);
          pending = [];
        }
        function appendText(to: number) {
          const part = normalized(decodeString(source.slice(from, to)));
          visible.push(part);
          if (part)
            pending.push({
              from,
              to,
              text: part,
              rawLiteral: false,
              code: false,
            });
        }
        for (const part of segments) {
          if (part.from < from) {
            requiresSparseWikilinkEdit = true;
            return text(value, marks, range);
          }
          appendText(part.from);
          if ('target' in part) {
            flushText();
            visible.push(normalized(decodeString(part.raw)));
            const node = schema.nodes.wikilink!.create(
              {
                raw: part.raw,
                target: part.target,
                alias: part.alias ?? null,
                sourceFrom: part.from,
                sourceTo: part.to,
              },
              null,
              marks,
            );
            ranges.set(node, { from: part.from, to: part.to });
            result.push(node);
          }
          from = part.to;
        }
        appendText(range.to);
        flushText();
        const verified = visible.join('') === value;
        if (gaps.length || !verified) requiresSparseWikilinkEdit = true;
        if (!verified) return text(value, marks, range);
        for (const gap of gaps) {
          containerPrefixEdges.add(gap.from);
          containerPrefixEdges.add(gap.to);
        }
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
      if (span?.literal)
        return text(
          literalMathText(span.originalOuter),
          schema.marks.math_source!.create().addToSet(marks),
          span,
          false,
          true,
        );
      if (span)
        return [
          remember(
            schema.nodes.inline_math!.create(
              {
                ...attrs,
                value: normalized(span.originalInner),
                kind: span.kind,
                literal: false,
              },
              text(normalized(span.originalOuter), [], span, true),
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
      case 'paragraph': {
        result = schema.nodes.paragraph!.create(null, paragraphContent(ast));
        break;
      }
      case 'heading':
        result = schema.nodes.heading!.create(
          { level: ast.depth ?? 1 },
          childrenInline(ast),
        );
        break;
      case 'blockquote':
        result = schema.nodes.blockquote!.create(
          null,
          ast.children?.length
            ? ast.children.map(block)
            : schema.nodes.paragraph!.create(),
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
          ? schema.nodes.math_block!.create(
              {
                ...attrs,
                value: normalized(ast.value ?? span.originalInner.trim()),
                kind: 'display',
              },
              text(normalized(span.originalOuter), [], span, true),
            )
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
    requiresSparseWikilinkEdit = false;
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
    blocks.push({ ...range, id, node, requiresSparseWikilinkEdit });
  }
  const doc = schema.nodes.doc!.create(
    null,
    blocks.length
      ? blocks.map((item) => item.node)
      : schema.nodes.paragraph!.create(),
  );
  return {
    doc,
    analysisDiagnostic: analysis.diagnostic,
    mapping: {
      source,
      path,
      prefix: blocks.length ? source.slice(0, blocks[0]!.from) : source,
      suffix: blocks.length ? source.slice(blocks.at(-1)!.to) : '',
      blocks,
      ranges,
      texts,
      tasks,
      containerPrefixEdges,
    },
  };
}

function atomMarkdown(node: ProseMirrorNode): string {
  switch (node.type.name) {
    case 'inline_math':
    case 'math_block':
      return node.textContent;
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
    text(state, node, parent, index) {
      // A marker is literal until the editor's space input rule transforms it.
      // Escape once, including incomplete list prefixes ("+", "1."). The
      // default escaper followed by escapeExtraCharacters double-escapes ">".
      state.text(
        node.marks.some((mark) => mark.type.name === 'math_source')
          ? literalMathEscaped(node.text!)
          : escapedText(node.text!, index === parent.childCount - 1),
        false,
      );
    },
    bullet_list(state, node) {
      // An empty list cannot interrupt a paragraph; '-' would become a
      // Setext underline. Flush the paragraph's blank separator first.
      if (node.childCount === 1 && emptyParagraph(node.firstChild!.firstChild!))
        state.write();
      state.renderList(node, '  ', () => '- ');
    },
    ordered_list(state, node, parent, index) {
      if (node.childCount === 1 && emptyParagraph(node.firstChild!.firstChild!))
        state.write();
      defaultMarkdownSerializer.nodes.ordered_list!(state, node, parent, index);
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
    math_source: {
      open: '',
      close: '',
      mixable: true,
      expelEnclosingWhitespace: false,
    },
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
/** Decode only Markdown whitespace references and their explicit ampersand
 * escape in unfinished source. This is text projection, never HTML parsing. */
function literalMathProjection(raw: string): {
  text: string;
  offsets: number[];
} {
  let text = '';
  const offsets = [0];
  for (let index = 0; index < raw.length;) {
    const escaped = /^\\(&#(?:32|9);)/.exec(raw.slice(index));
    const reference = /^&#(32|9);/.exec(raw.slice(index));
    if (escaped) {
      index++;
      for (const character of escaped[1]!) {
        text += character;
        offsets.push(++index);
      }
    } else if (reference) {
      text += reference[1] === '32' ? ' ' : '\t';
      index += reference[0].length;
      offsets.push(index);
    } else if (raw[index] === '\r') {
      text += '\n';
      index += raw[index + 1] === '\n' ? 2 : 1;
      offsets.push(index);
    } else {
      text += raw[index++];
      offsets.push(index);
    }
  }
  return { text, offsets };
}
function literalMathText(raw: string): string {
  return literalMathProjection(raw).text;
}
const literalMathEscaped = (value: string) =>
  value.replace(/&(?=#(?:32|9);)/g, '\\&');

function offsetsFor(raw: string): number[] {
  const offsets = [0];
  for (let index = 0; index < raw.length; index++) {
    if (raw[index] === '\r' && raw[index + 1] === '\n') index++;
    offsets.push(index + 1);
  }
  return offsets;
}
function escapedPrefixes(value: string): string {
  return value
    .replace(/(^|[\r\n])([ \t]*)([-+>]|#{1,6})(?=[ \t\r\n]|$)/g, '$1$2\\$3')
    .replace(
      /(^|[\r\n])([ \t]*)(-(?:[ \t]*-){2,})(?=[ \t]*(?:[\r\n]|$))/g,
      '$1$2\\$3',
    )
    .replace(/(^|[\r\n])([ \t]*\d+)([.)])(?=[ \t\r\n]|$)/g, '$1$2\\$3');
}
const escapedInline = (value: string) =>
  value.replace(/[\\`*_[\]{}<>$|&~]/g, '\\$&');
// CommonMark discards spaces at a line end. Encode these authored characters
// rather than weakening reparse equality or inserting invisible placeholders.
const escapeTrailingSpaces = (value: string, atEnd = true) =>
  value.replace(/[ \t]+/g, (part, offset: number) => {
    const end = offset + part.length;
    if (
      value[end] !== '\r' &&
      value[end] !== '\n' &&
      !(atEnd && end === value.length)
    )
      return part;
    return [...part].map((char) => (char === ' ' ? '&#32;' : '&#9;')).join('');
  });

function escapedText(value: string, atEnd = true): string {
  return escapeTrailingSpaces(escapedPrefixes(escapedInline(value)), atEnd);
}

/** Return the first visible boundary for a raw offset. Interior UTF-16
 * positions of a single decoded reference repeat its starting offset. */
function textOffsetIndex(offsets: number[], raw: number): number | null {
  let low = 0;
  let high = offsets.length;
  while (low < high) {
    const middle = (low + high) >>> 1;
    if (offsets[middle]! < raw) low = middle + 1;
    else high = middle;
  }
  return offsets[low] === raw ? low : null;
}

function textOffsets(
  raw: string,
  expected: string,
  code: boolean,
  rawLiteral = false,
): number[] | null {
  if (rawLiteral) {
    const literal = literalMathProjection(raw);
    return literal.text === expected ? literal.offsets : null;
  }
  if (normalized(raw) === expected) return offsetsFor(raw);
  if (code) return null;
  let decoded = '';
  const offsets = [0];
  const reference = /&(?:#(?:\d{1,7}|x[\da-f]{1,6})|[\da-z]{1,31});/iy;
  for (let index = 0; index < raw.length;) {
    reference.lastIndex = index;
    const token = raw[index] === '&' && reference.exec(raw)?.[0];
    const value = token && decodeString(token);
    if (token && value && value !== token) {
      decoded += value;
      for (let unit = 1; unit < value.length; unit++) offsets.push(index);
      index += token.length;
    } else if (
      raw[index] === '\\' &&
      /[\x21-\x2f\x3a-\x40\x5b-\x60\x7b-\x7e]/.test(raw[index + 1] ?? '')
    ) {
      decoded += raw[index + 1];
      index += 2;
    } else decoded += raw[index++];
    offsets.push(index);
  }
  // The editor normalizes decoded line endings, including CR/LF pairs
  // assembled from separate character references.
  if (decoded.includes('\r'))
    return normalized(decoded) === expected
      ? offsetsFor(decoded).map((index) => offsets[index]!)
      : null;
  return decoded === expected ? offsets : null;
}
function changedTextRange(oldValue: string, newValue: string) {
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
  return { start, end, nextEnd };
}

/** Map a single editor replacement to one literal part. The transaction's
 * range disambiguates hidden prefixes and equal characters with different
 * source spellings (such as adjacent numeric and named references). */
function witnessedTextEdit(
  before: ProseMirrorNode,
  after: ProseMirrorNode,
  spans: TextRange[],
  edges: Set<number> | null,
  transaction: Transaction | null,
) {
  if (transaction?.steps.length !== 1) return null;
  const changes: { from: number; to: number }[] = [];
  transaction.mapping.maps[0]!.forEach((from, to) =>
    changes.push({ from, to }),
  );
  if (changes.length !== 1) return null;
  const { from, to } = changes[0]!;
  const start = transaction.before.resolve(from);
  const end = transaction.before.resolve(to);
  if (start.parent !== end.parent) return null;
  const index = start.index();
  let localFrom = start.textOffset;
  if (start.parent.maybeChild(index) !== before) {
    if (
      localFrom !== 0 ||
      index === 0 ||
      start.parent.child(index - 1) !== before
    )
      return null;
    localFrom = before.nodeSize;
  }
  const localTo = localFrom + to - from;
  let pos = 0;
  for (const part of spans) {
    const limit = pos + part.text.length;
    if (
      localFrom >= pos &&
      localTo <= limit &&
      !(localFrom === pos && edges?.has(part.from)) &&
      !(localTo === limit && edges?.has(part.to))
    ) {
      const changedFrom = localFrom - pos;
      const changedTo = localTo - pos;
      const insertedEnd = localTo + after.nodeSize - before.nodeSize;
      const inserted = after.text!.slice(localFrom, insertedEnd);
      const removed = part.text.slice(changedFrom, changedTo);
      if (
        insertedEnd < localFrom ||
        before.text!.slice(0, localFrom) +
          inserted +
          before.text!.slice(localTo) !==
          after.text ||
        (edges && (/[\r\n]/.test(removed) || /[\r\n]/.test(inserted)))
      )
        return null;
      const difference = changedTextRange(removed, inserted);
      return {
        span: part,
        oldValue: part.text,
        newValue:
          part.text.slice(0, changedFrom) +
          inserted +
          part.text.slice(changedTo),
        start: changedFrom + difference.start,
        end: changedFrom + difference.end,
        nextEnd: changedFrom + difference.nextEnd,
      };
    }
    pos = limit;
  }
  return null;
}

function sparseBlock(
  previous: RenderedProjection,
  block: RenderedBlockMapping,
  next: ProseMirrorNode,
  transaction: Transaction | null,
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
      if (!spans?.length) return false;
      const first = spans[0]!;
      let span = { ...first, to: spans.at(-1)!.to };
      let oldValue = before.text!,
        newValue = after.text!;
      const acrossPrefixes = spans.some(
        (part) =>
          mapping.containerPrefixEdges.has(part.from) ||
          mapping.containerPrefixEdges.has(part.to),
      );
      if (
        !acrossPrefixes &&
        !spans.every(
          (part, index) =>
            part.code === first.code &&
            part.rawLiteral === first.rawLiteral &&
            (index === 0 || spans[index - 1]!.to === part.from),
        )
      )
        return false;
      let raw = mapping.source.slice(span.from, span.to);
      const decodedProse = !span.code && !span.rawLiteral && raw !== oldValue;
      const edit =
        (acrossPrefixes || decodedProse) && transaction
          ? witnessedTextEdit(
              before,
              after,
              acrossPrefixes ? spans : [{ ...span, text: oldValue }],
              acrossPrefixes ? mapping.containerPrefixEdges : null,
              transaction,
            )
          : null;
      if (acrossPrefixes && !edit) return false;
      if (edit) {
        ({ span, oldValue, newValue } = edit);
        raw = mapping.source.slice(span.from, span.to);
      }
      const offsets = textOffsets(raw, oldValue, span.code, span.rawLiteral);
      if (!offsets) return false;
      let { start, end, nextEnd } =
        edit ?? changedTextRange(oldValue, newValue);
      if (decodedProse && !edit) {
        // A snapshot can place the same insertion/deletion at multiple offsets.
        // Only slide across text whose source spelling is literal throughout.
        let shift = 0;
        while (
          shift < start &&
          oldValue[end - shift - 1] === newValue[nextEnd - shift - 1]
        )
          shift++;
        if (
          shift &&
          raw.slice(offsets[start - shift], offsets[end]) !==
            oldValue.slice(start - shift, end)
        )
          throw new Error(
            'This edit has ambiguous source spelling. Use Source to choose the text to change.',
          );
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
      // A character reference can produce multiple visible UTF-16 units.
      // An edit inside it must replace the complete raw token.
      while (start > 0 && offsets[start] === offsets[start - 1]) start--;
      while (end < oldValue.length && offsets[end] === offsets[end - 1]) {
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
      const value = (
        span.code
          ? inserted
          : span.rawLiteral
            ? literalMathEscaped(inserted)
            : escapedInline(inserted)
      ).replace(/\n/g, newlineOf(raw, newlineOf(mapping.source)));
      let replacement =
        raw.slice(0, offsets[start]!) + value + raw.slice(offsets[end]!);
      // A typed semicolon can complete an entity across the insertion boundary.
      // Preserve that authored literal text rather than decoding it as a space.
      // This normalization is confined to the changed source-owned text span.
      if (span.rawLiteral && literalMathText(replacement) !== newValue)
        replacement = literalMathEscaped(newValue).replace(
          /\n/g,
          newlineOf(raw, newlineOf(mapping.source)),
        );
      if (!span.code && !span.rawLiteral) {
        const lineStart =
          Math.max(
            mapping.source.lastIndexOf('\n', span.from - 1),
            mapping.source.lastIndexOf('\r', span.from - 1),
          ) + 1;
        const prefix = mapping.source
          .slice(lineStart, span.from)
          .replace(/^\uFEFF/, '');
        // Heading/mark/table delimiters protect an existing inline prefix.
        // Paragraphs in list/quote containers still need prefix escaping.
        const atStart =
          /^[ \t]*(?:>[ \t]*|(?:[-+*]|\d+[.)])[ \t]+)*[ \t]*$/.test(prefix);
        const sentinel = atStart ? '' : 'x';
        replacement = escapeTrailingSpaces(
          escapedPrefixes(sentinel + replacement).slice(sentinel.length),
          span.to === block.to ||
            /[\r\n]/.test(mapping.source[span.to] ?? '') ||
            end === oldValue.length,
        );
      }
      patches.push({ from: span.from, to: span.to, value: replacement });
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
  transaction?: unknown,
): string {
  const witnessed =
    transaction instanceof Transaction &&
    transaction.before === previous.doc &&
    transaction.doc === newDoc
      ? transaction
      : null;
  if (previous.doc.eq(newDoc)) return previous.mapping.source;
  const { mapping } = previous;
  const used = new Set<RenderedBlockMapping>();
  const linkFidelityMessage =
    'This edit could change an authored wikilink or its continuation prefix. Use Source to edit this passage.';
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
        ? sparseBlock(previous, matched.block, node, witnessed)
        : null;
      if (sparse !== null) result += sparse;
      else {
        if (matched?.block.requiresSparseWikilinkEdit)
          throw new Error(linkFidelityMessage);
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
  // A structural change can also replace a whole block without retaining its
  // identity, bypassing the matched-block serializer above.
  if (
    mapping.blocks.some(
      (block) => block.requiresSparseWikilinkEdit && !used.has(block),
    )
  )
    throw new Error(linkFidelityMessage);
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
  if (visualAnalysisLimited(source))
    throw new Error(
      'This change exceeds the visual editing work budget. Your accepted source is unchanged. Review the retained draft before continuing in Source.',
    );
  const parsed = parseRenderedSource(source, previous.mapping.path);
  return mapRenderedDocument(previous, newDoc, parsed);
}

/** A math delimiter can change the node type at the edit. Preserve exact
 * surrounding blocks so their mounted node views survive that reparse. */
export function reparseRenderedMathEdit(
  previous: RenderedProjection,
  source: string,
  from: number,
  oldEnd: number,
  newEnd: number,
): RenderedProjection {
  const parsed = parseRenderedSource(source, previous.mapping.path);
  const oldBlocks = new Map(
    previous.mapping.blocks.map((block) => [block.from, block]),
  );
  const parsedIds = new Set(parsed.mapping.blocks.map((block) => block.id));
  const nodes = parsed.mapping.blocks.map((block) => {
    const delta =
      block.to <= from ? 0 : block.from >= newEnd ? newEnd - oldEnd : null;
    if (delta === null) return block.node;
    const old = oldBlocks.get(block.from - delta);
    if (
      !old ||
      old.to !== block.to - delta ||
      (old.id !== block.id && parsedIds.has(old.id)) ||
      previous.mapping.source.slice(old.from, old.to) !==
        source.slice(block.from, block.to) ||
      old.node.nodeSize !== block.node.nodeSize ||
      !semanticEqual(old.node, block.node)
    )
      return block.node;
    return old.node;
  });
  if (nodes.every((node, index) => node === parsed.doc.child(index)))
    return parsed;
  return mapRenderedDocument(
    previous,
    parsed.doc.copy(Fragment.fromArray(nodes)),
    parsed,
  );
}

function mapRenderedDocument(
  previous: RenderedProjection,
  newDoc: ProseMirrorNode,
  parsed: RenderedProjection,
): RenderedProjection {
  const { source } = parsed.mapping;
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
    analysisDiagnostic: parsed.analysisDiagnostic,
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

/** Exact text caret mapping for editor-owned dollar authoring, never DOM messages. */
export function renderedTextSourceOffset(
  projection: RenderedProjection,
  position: number,
): number | null {
  const candidates = new Set<number>();
  projection.doc.descendants((node, start) => {
    if (!node.isText || position < start || position > start + node.nodeSize)
      return;
    const parts = projection.mapping.texts.get(node);
    if (!parts?.length || parts.map((part) => part.text).join('') !== node.text)
      return;
    let preceding = 0;
    for (const part of parts) {
      const local = position - start - preceding;
      preceding += part.text.length;
      if (local < 0 || local > part.text.length) continue;
      if (
        part.code &&
        !['inline_math', 'math_block'].includes(
          projection.doc.resolve(position).parent.type.name,
        )
      )
        continue;
      const offsets = textOffsets(
        projection.mapping.source.slice(part.from, part.to),
        part.text,
        part.code,
        part.rawLiteral,
      );
      const offset = offsets?.[local];
      if (
        offset !== undefined &&
        !projection.mapping.containerPrefixEdges.has(part.from + offset) &&
        (local === 0 || offset !== offsets![local - 1])
      )
        candidates.add(part.from + offset);
    }
  });
  if (candidates.size === 1) return [...candidates][0]!;
  if (candidates.size > 1) return null;
  const caret = projection.doc.resolve(position);
  const range = projection.mapping.ranges.get(caret.parent);
  if (
    caret.parent.isTextblock &&
    caret.parent.content.size === 0 &&
    range?.from === range?.to &&
    range
  )
    return range.from;
  if (!projection.mapping.source.trim() && caret.parent.isTextblock)
    return projection.mapping.source.length;
  return null;
}

/** Inverse of the verified editor-text mapping, including physical breaks and
 * generated whitespace references. Never invent a caret inside an escape. */
export function renderedPositionFromSourceOffset(
  projection: RenderedProjection,
  sourceOffset: number,
): number | null {
  if (projection.mapping.containerPrefixEdges.has(sourceOffset)) return null;
  let result: number | null = null;
  projection.doc.descendants((node, position) => {
    if (!node.isText) return;
    const parts = projection.mapping.texts.get(node);
    if (!parts?.length || parts.map((part) => part.text).join('') !== node.text)
      return;
    let preceding = 0;
    for (const part of parts) {
      const textPosition = position + preceding;
      preceding += part.text.length;
      if (sourceOffset < part.from || sourceOffset > part.to) continue;
      const offsets = textOffsets(
        projection.mapping.source.slice(part.from, part.to),
        part.text,
        part.code,
        part.rawLiteral,
      );
      if (!offsets) continue;
      const index = textOffsetIndex(offsets, sourceOffset - part.from);
      if (index !== null) result = textPosition + index;
    }
  });
  if (result !== null) return result;
  projection.doc.descendants((node, position) => {
    if (!node.isTextblock || node.content.size !== 0) return;
    const range = projection.mapping.ranges.get(node);
    if (range?.from === sourceOffset && range.to === sourceOffset)
      result = position + 1;
  });
  return result;
}
