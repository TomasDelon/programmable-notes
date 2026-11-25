import { Schema, type NodeSpec, type MarkSpec } from 'prosemirror-model';
import { tableNodes } from 'prosemirror-tables';

const sourceId = { default: null };
const origin = {
  raw: { default: '' },
  sourceFrom: { default: null },
  sourceTo: { default: null },
};

/** Host-rendered links never turn document text into script authority. */
export function safeRenderedHref(value: unknown): string | null {
  if (
    typeof value !== 'string' ||
    [...value].some(
      (character) =>
        character.charCodeAt(0) <= 32 || character.charCodeAt(0) === 127,
    )
  )
    return null;
  return /^(?:https?:|mailto:|tel:|#|\/(?!\/)|\.{1,2}\/)/i.test(value)
    ? value
    : null;
}

const tables = tableNodes({
  tableGroup: 'block',
  cellContent: 'paragraph+',
  cellAttributes: {
    align: {
      default: null,
      getFromDOM: (dom) => dom.style.textAlign || null,
      setDOMAttr: (value, attrs) => {
        if (value === 'left' || value === 'center' || value === 'right')
          attrs.style = `text-align: ${value}`;
      },
    },
  },
});

const nodes: Record<string, NodeSpec> = {
  doc: { content: 'block+' },
  paragraph: {
    content: 'inline*',
    group: 'block',
    attrs: { sourceId },
    parseDOM: [{ tag: 'p' }],
    toDOM: () => ['p', 0],
  },
  heading: {
    content: 'inline*',
    group: 'block',
    defining: true,
    attrs: { sourceId, level: { default: 1 } },
    parseDOM: [1, 2, 3, 4, 5, 6].map((level) => ({
      tag: `h${level}`,
      attrs: { level },
    })),
    toDOM: (node) => [`h${Math.min(6, Math.max(1, node.attrs.level))}`, 0],
  },
  blockquote: {
    content: 'block+',
    group: 'block',
    defining: true,
    attrs: { sourceId },
    parseDOM: [{ tag: 'blockquote' }],
    toDOM: () => ['blockquote', 0],
  },
  bullet_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { sourceId, tight: { default: true } },
    parseDOM: [{ tag: 'ul' }],
    toDOM: () => ['ul', 0],
  },
  ordered_list: {
    content: 'list_item+',
    group: 'block',
    attrs: { sourceId, order: { default: 1 }, tight: { default: true } },
    parseDOM: [
      {
        tag: 'ol',
        getAttrs: (dom) => ({ order: Number(dom.getAttribute('start')) || 1 }),
      },
    ],
    toDOM: (node) => ['ol', { start: node.attrs.order }, 0],
  },
  list_item: {
    content: 'paragraph block*',
    defining: true,
    attrs: { checked: { default: null } },
    parseDOM: [
      {
        tag: 'li',
        getAttrs: (dom) => ({
          checked: dom.hasAttribute('data-checked')
            ? dom.getAttribute('data-checked') === 'true'
            : null,
        }),
      },
    ],
    toDOM: (node) =>
      node.attrs.checked === null
        ? ['li', 0]
        : [
            'li',
            {
              class: 'task-list-item',
              'data-checked': String(node.attrs.checked),
            },
            [
              'input',
              {
                type: 'checkbox',
                ...(node.attrs.checked ? { checked: '' } : {}),
                'data-task-toggle': 'true',
                'aria-label': 'Toggle task',
                contenteditable: 'false',
              },
            ],
            ['div', { class: 'rendered-task-content' }, 0],
          ],
  },
  code_block: {
    content: 'text*',
    marks: '',
    group: 'block',
    code: true,
    defining: true,
    attrs: { sourceId, language: { default: '' } },
    parseDOM: [{ tag: 'pre', preserveWhitespace: 'full' }],
    toDOM: (node) => [
      'pre',
      ['code', { 'data-language': node.attrs.language || '' }, 0],
    ],
  },
  horizontal_rule: {
    group: 'block',
    attrs: { sourceId },
    parseDOM: [{ tag: 'hr' }],
    toDOM: () => ['hr'],
  },
  ...tables,
  text: { group: 'inline' },
  hard_break: {
    inline: true,
    group: 'inline',
    selectable: false,
    parseDOM: [{ tag: 'br' }],
    toDOM: () => ['br'],
  },
  inline_math: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      ...origin,
      value: { default: '' },
      kind: { default: 'inline' },
      literal: { default: false },
    },
    toDOM: (node) => [
      'span',
      { class: 'rendered-inline-math', 'data-math': 'inline' },
      node.attrs.value,
    ],
  },
  math_block: {
    group: 'block',
    atom: true,
    attrs: {
      sourceId,
      ...origin,
      value: { default: '' },
      kind: { default: 'display' },
      literal: { default: false },
    },
    toDOM: (node) => [
      'div',
      { class: 'rendered-display-math', 'data-math': 'display' },
      node.attrs.value,
    ],
  },
  wikilink: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      ...origin,
      target: { default: '' },
      alias: { default: null },
    },
    toDOM: (node) => [
      'span',
      { class: 'rendered-wikilink', 'data-wikilink': node.attrs.target },
      node.attrs.alias || node.attrs.target,
    ],
  },
  image: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: {
      ...origin,
      src: { default: '' },
      alt: { default: '' },
      title: { default: null },
    },
    // Image decoding is supplied by the host from its validated asset catalog.
    // A pasted URL never triggers a network request through this schema.
    toDOM: (node) => [
      'span',
      { class: 'rendered-image', role: 'img', 'aria-label': node.attrs.alt },
      node.attrs.alt || 'Image',
    ],
  },
  source_inline: {
    inline: true,
    group: 'inline',
    atom: true,
    attrs: { ...origin, value: { default: '' }, kind: { default: 'unknown' } },
    toDOM: (node) => [
      'code',
      { class: 'rendered-source-inline' },
      node.attrs.value,
    ],
  },
  source_block: {
    group: 'block',
    atom: true,
    attrs: {
      sourceId,
      ...origin,
      value: { default: '' },
      kind: { default: 'unknown' },
    },
    toDOM: (node) => [
      'pre',
      { class: 'rendered-source-block' },
      ['code', node.attrs.value],
    ],
  },
};
nodes.table = { ...nodes.table, attrs: { ...nodes.table?.attrs, sourceId } };

const marks: Record<string, MarkSpec> = {
  strong: {
    parseDOM: [{ tag: 'strong' }, { tag: 'b' }],
    toDOM: () => ['strong', 0],
  },
  em: { parseDOM: [{ tag: 'em' }, { tag: 'i' }], toDOM: () => ['em', 0] },
  strike: {
    parseDOM: [{ tag: 's' }, { tag: 'del' }, { tag: 'strike' }],
    toDOM: () => ['del', 0],
  },
  code: {
    excludes: '_',
    code: true,
    parseDOM: [{ tag: 'code' }],
    toDOM: () => ['code', 0],
  },
  link: {
    attrs: { href: {}, title: { default: null } },
    inclusive: false,
    parseDOM: [
      {
        tag: 'a[href]',
        getAttrs: (dom) => {
          const href = safeRenderedHref(dom.getAttribute('href'));
          return href ? { href, title: dom.getAttribute('title') } : false;
        },
      },
    ],
    toDOM: (mark) => [
      'a',
      {
        href: safeRenderedHref(mark.attrs.href),
        title: mark.attrs.title,
        rel: 'noopener noreferrer',
      },
      0,
    ],
  },
};

export const renderedSchema = new Schema({ nodes, marks });
