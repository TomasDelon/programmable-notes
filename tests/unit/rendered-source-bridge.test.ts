import { describe, expect, it } from 'vitest';
import {
  EditorState,
  TextSelection,
  type Transaction,
} from 'prosemirror-state';
import {
  sinkListItem,
  splitListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import { addRowAfter } from 'prosemirror-tables';
import type { Node as ProseMirrorNode } from 'prosemirror-model';
import { parseSourceWikilinks } from '../../src/links';
import {
  renderedSchema as schema,
  safeRenderedHref,
} from '../../src/editor/rendered/schema';
import {
  parseRenderedSource,
  rebaseRenderedProjection,
  renderedPositionFromSourceOffset,
  renderedSourceRange,
  renderedTextSourceOffset,
  serializeRenderedChange,
  type RenderedProjection,
} from '../../src/editor/rendered/sourceBridge';

function findText(doc: ProseMirrorNode, value: string) {
  let result = -1;
  doc.descendants((node, position) => {
    if (node.isText && node.text!.includes(value) && result < 0)
      result = position + node.text!.indexOf(value);
  });
  if (result < 0) throw new Error(`Missing text: ${value}`);
  return result;
}
function findNode(doc: ProseMirrorNode, type: string) {
  let result: { node: ProseMirrorNode; pos: number } | undefined;
  doc.descendants((node, pos) => {
    if (node.type.name === type && !result) result = { node, pos };
  });
  if (!result) throw new Error(`Missing node: ${type}`);
  return result;
}
function apply(projection: RenderedProjection, transaction: Transaction) {
  const source = serializeRenderedChange(
    projection,
    transaction.doc,
    transaction,
  );
  return rebaseRenderedProjection(projection, transaction.doc, source);
}
function replace(
  projection: RenderedProjection,
  before: string,
  after: string,
) {
  const state = EditorState.create({ doc: projection.doc });
  const from = findText(state.doc, before);
  return apply(
    projection,
    state.tr.insertText(after, from, from + before.length),
  );
}

describe('rendered Markdown source bridge', () => {
  it.each([
    'and tea',
    '&amp; tea',
    '&#38; and &#x26;',
    'first&#13;second&#xD;&#10;third',
    '&#x1F9EA; and &NotEqualTilde;',
    String.raw`\&amp; and \[brackets\] and &#91;&#91;Ghost]]`,
  ])('preserves authored wikilinks and source spelling beside %s', (prose) => {
    const source =
      '\uFEFFexport const A = 1\r\n\r\nCafé ' +
      prose +
      '.\r\nSee [[Other]].\r\n\r\nPrice $5\n\n<Thing />\r\n';
    const projection = parseRenderedSource(source);
    const state = EditorState.create({ doc: projection.doc });
    const result = apply(
      projection,
      state.tr.insertText('!', findText(state.doc, 'Café') + 4),
    );
    expect(
      parseSourceWikilinks(result.mapping.source, 'note.mdx').map(
        (link) => link.raw,
      ),
    ).toEqual(['[[Other]]']);
    expect(result.mapping.source).toBe(source.replace('Café', 'Café!'));
    expect(findNode(projection.doc, 'wikilink').node.attrs.raw).toBe(
      '[[Other]]',
    );
  });

  it.each([
    ['&#x1F9EA;', '🧪'],
    ['&NotEqualTilde;', '≂\u0338'],
  ])('maps only complete boundaries of %s', (raw, visible) => {
    const source = 'Before ' + raw + ' &amp; [[Other]]';
    const projection = parseRenderedSource(source);
    const from = findText(projection.doc, visible);
    const start = source.indexOf(raw);
    expect(renderedTextSourceOffset(projection, from)).toBe(start);
    expect(renderedTextSourceOffset(projection, from + 1)).toBeNull();
    expect(renderedTextSourceOffset(projection, from + visible.length)).toBe(
      start + raw.length,
    );
    expect(renderedPositionFromSourceOffset(projection, start)).toBe(from);
    expect(renderedPositionFromSourceOffset(projection, start + 1)).toBeNull();
    expect(
      renderedPositionFromSourceOffset(projection, start + raw.length),
    ).toBe(from + visible.length);
  });

  it('replaces the whole reference when editing one of its decoded characters', () => {
    const source = 'Before &NotEqualTilde; &amp; [[Other]]';
    const projection = parseRenderedSource(source);
    const result = replace(projection, '\u0338', '!');
    expect(result.mapping.source).toBe(source.replace('&NotEqualTilde;', '≂!'));
    expect(findNode(result.doc, 'wikilink').node.attrs.raw).toBe('[[Other]]');
  });

  it.each([
    ['quote', '> ', '> '],
    ['list', '- ', '  '],
    ['nested quote/list', '> - ', '>   '],
    ['tabbed continuation', '> ', '> \t'],
  ])(
    'preserves %s continuation bytes when typing on either side',
    (_label, opening, continuation) => {
      const source =
        '\uFEFF---\nname: note\r\n---\n\n' +
        opening +
        'Café &amp; &#10; tea\r\n' +
        continuation +
        'See [[Other]] 🧪 and &NotEqualTilde;.\n\n<Thing />\r\n';
      const projection = parseRenderedSource(source);
      const state = EditorState.create({ doc: projection.doc });
      const step = state.tr.insertText('!', findText(state.doc, 'Café') + 4);
      const first = apply(projection, step);
      expect(first.mapping.source).toBe(source.replace('Café', 'Café!'));
      expect(findNode(first.doc, 'wikilink').node.attrs.raw).toBe('[[Other]]');
      const second = apply(
        first,
        EditorState.create({ doc: first.doc }).tr.insertText(
          '?',
          findText(first.doc, 'See') + 3,
        ),
      );
      expect(second.mapping.source).toBe(
        source.replace('Café', 'Café!').replace('See', 'See?'),
      );
      const undone = apply(
        first,
        EditorState.create({ doc: first.doc }).tr.step(
          step.steps[0]!.invert(state.doc),
        ),
      );
      expect(undone.mapping.source).toBe(source);
    },
  );

  it.each(['> Café\r\n> a', 'Café a'])(
    'preserves the untouched spelling when adjacent entities display identically after %s',
    (prefix) => {
      const source = prefix + '&#38;&amp; [[Other]]';
      const projection = parseRenderedSource(source);
      const from = findText(projection.doc, '&&');
      const result = apply(
        projection,
        EditorState.create({ doc: projection.doc }).tr.delete(from, from + 1),
      );
      expect(result.mapping.source).toBe(source.replace('&#38;', ''));
    },
  );

  it('preserves the surviving physical line ending when deleting repeated prose', () => {
    const source = 'a\r\na\na';
    const projection = parseRenderedSource(source);
    const state = EditorState.create({ doc: projection.doc });
    expect(projection.doc.textContent).toBe('a\na\na');
    const removeFirst = state.tr.delete(1, 3);
    expect(apply(projection, removeFirst).mapping.source).toBe('a\na');
    expect(apply(projection, state.tr.delete(3, 5)).mapping.source).toBe(
      'a\r\na',
    );
  });

  it('refuses a snapshot with an ambiguous physical line ending', () => {
    const projection = parseRenderedSource('a\r\na\na');
    const state = EditorState.create({ doc: projection.doc });
    const candidate = state.tr.delete(1, 3).doc;
    expect(() => serializeRenderedChange(projection, candidate)).toThrow(
      'source spelling',
    );
    expect(projection.mapping.source).toBe('a\r\na\na');
  });

  it('refuses an unwitnessed deletion with ambiguous raw spelling and accepts plain repetitions', () => {
    const source = 'Café &#38;&amp; tea';
    const projection = parseRenderedSource(source);
    const state = EditorState.create({ doc: projection.doc });
    const from = findText(state.doc, '&&');
    expect(() =>
      serializeRenderedChange(projection, state.tr.delete(from, from + 1).doc),
    ).toThrow('source spelling');
    expect(projection.mapping.source).toBe(source);
    const e = findText(state.doc, 'tea') + 2;
    expect(
      serializeRenderedChange(projection, state.tr.insertText('e', e).doc),
    ).toBe(source.replace('tea', 'teea'));
  });

  it('keeps lazy continuation and escaped literal greater-than prose editable across successive parses', () => {
    for (const [source, shown] of [
      ['> A &amp;\r\n> \\> See [[Other]]', '> See'],
      ['> B &#13;\rSee [[Other]]', 'See'],
      ['- D\n  See &#x1F9EA; &NotEqualTilde; [[Other]]', 'See'],
    ] as const) {
      const projection = parseRenderedSource(source);
      const pos = findText(projection.doc, shown) + shown.length;
      const result = apply(
        projection,
        EditorState.create({ doc: projection.doc }).tr.insertText('!', pos),
      );
      expect(result.mapping.source).toBe(source.replace('See', 'See!'));
      expect(findNode(result.doc, 'wikilink').node.attrs.raw).toBe('[[Other]]');
    }
  });

  it('discards a partial prefix witness at its per-parse bound', () => {
    const source = '- A [[Other]]\n' + '  more\n'.repeat(4097);
    const projection = parseRenderedSource(source);
    expect(() => replace(projection, 'more', 'more!')).toThrow('wikilink');
    expect(projection.mapping.source).toBe(source);
    const next = replace(
      parseRenderedSource('- A [[Other]]\n  more tea'),
      'tea',
      'tea!',
    );
    expect(next.mapping.source).toBe('- A [[Other]]\n  more tea!');
  });

  it('refuses ambiguous caret, cross-prefix and structural edits in visible quoted prose', () => {
    const source =
      '> Café &amp; tea\r\n> See [[Other]] and **bold**.\n\nOutside.';
    const projection = parseRenderedSource(source);
    expect(parseSourceWikilinks(source).map((link) => link.raw)).toEqual([
      '[[Other]]',
    ]);
    const body = projection.doc.firstChild!.firstChild!;
    expect(body.firstChild?.isText).toBe(true);
    expect(body.textContent).toBe('Café & tea\nSee  and bold.');
    expect(findNode(body, 'wikilink').node.attrs.raw).toBe('[[Other]]');
    const boundary = findText(projection.doc, 'See');
    const rawPrefix = source.indexOf('> See');
    expect(renderedTextSourceOffset(projection, boundary)).toBeNull();
    for (const offset of [rawPrefix, rawPrefix + 1, rawPrefix + 2])
      expect(renderedPositionFromSourceOffset(projection, offset)).toBeNull();
    const typing = EditorState.create({ doc: projection.doc });
    expect(() =>
      apply(projection, typing.tr.insertText('S', boundary)),
    ).toThrow('wikilink');
    expect(() =>
      apply(projection, typing.tr.insertText('!', boundary - 2, boundary + 2)),
    ).toThrow('wikilink');
    expect(projection.mapping.source).toBe(source);
    const adjacent = replace(projection, 'bold', 'bright');
    expect(adjacent.mapping.source).toBe(source.replace('bold', 'bright'));
    expect(replace(adjacent, 'Outside', 'After').mapping.source).toBe(
      source.replace('bold', 'bright').replace('Outside', 'After'),
    );
    const state = EditorState.create({ doc: projection.doc });
    expect(() =>
      apply(
        projection,
        state.tr.delete(0, projection.doc.firstChild!.nodeSize),
      ),
    ).toThrow('wikilink');
  });

  it('reports an explicit work budget refusal while preserving the accepted source', () => {
    const projection = parseRenderedSource('a b');
    const state = EditorState.create({ doc: projection.doc });
    const transaction = state.tr.insertText('a' + ' '.repeat(8193) + 'b', 1, 4);
    const candidate = serializeRenderedChange(projection, transaction.doc);
    expect(() =>
      rebaseRenderedProjection(projection, transaction.doc, candidate),
    ).toThrow('visual editing work budget');
    expect(projection.mapping.source).toBe('a b');
  });

  it('handles a long internal whitespace run without retrying it at every offset', () => {
    const projection = parseRenderedSource('a b');
    const value = 'a' + ' '.repeat(100_000) + 'b';
    const state = EditorState.create({ doc: projection.doc });
    const transaction = state.tr.insertText(value, 1, 4);
    const started = performance.now();
    expect(serializeRenderedChange(projection, transaction.doc)).toBe(value);
    // A generous host-work regression bound: the quadratic matcher previously
    // took tens of seconds. Parsing has its own measured Source-only work budget.
    expect(performance.now() - started).toBeLessThan(5000);
  }, 10_000);

  it('keeps sibling list markers and mixed physical breaks after a trailing space is followed by text', () => {
    let projection = parseRenderedSource('+ one\r\n+ untouched\n');
    projection = replace(projection, 'one', 'one ');
    projection = replace(projection, 'one ', 'one next');
    expect(projection.mapping.source).toBe('+ one&#32;next\r\n+ untouched\n');
  });

  it.each(['#', '##', '1.', '+', '-'])(
    'keeps %s literal before physical soft line breaks',
    (prefix) => {
      for (const newline of ['\n', '\r\n']) {
        const result = replace(
          parseRenderedSource('a' + newline + 'tail'),
          'a',
          prefix,
        );
        expect(result.doc.childCount).toBe(1);
        expect(result.doc.textContent).toBe(prefix + '\ntail');
        expect(result.mapping.source.endsWith(newline + 'tail')).toBe(true);
      }
    },
  );
  it.each(['#', '##', '1.', '+', '---'])(
    'keeps %s literal in compact quote containers',
    (prefix) => {
      for (const source of ['>foo', '>>foo', '- >foo']) {
        const result = replace(parseRenderedSource(source), 'foo', prefix);
        expect(result.doc.textContent).toBe(prefix);
        expect(
          result.mapping.source.startsWith(
            source.slice(0, source.indexOf('foo')),
          ),
        ).toBe(true);
      }
    },
  );
  it.each([
    '1.',
    '+',
    '-',
    '*',
    '2)',
    '>',
    '##',
    '###',
    '####',
    '#####',
    '######',
    '---',
  ])(
    'keeps the incomplete typed prefix %s literal until an input rule transforms it',
    (prefix) => {
      let projection = parseRenderedSource(
        'Before.\r\n\r\n<span>Opaque</span>\r\n',
      );
      let state = EditorState.create({ doc: projection.doc });
      projection = apply(projection, state.tr.split(8));
      for (const character of prefix) {
        state = EditorState.create({ doc: projection.doc });
        projection = apply(
          projection,
          state.tr.insertText(
            character,
            10 + projection.doc.child(1).content.size,
          ),
        );
      }
      expect(projection.doc.child(1).type).toBe(schema.nodes.paragraph);
      expect(projection.doc.child(1).textContent).toBe(prefix);
      expect(projection.mapping.source).toContain('<span>Opaque</span>\r\n');
    },
  );
  it('keeps heading-like text literal inside a nested list item', () => {
    const source = '+ outer\r\n  + inner\r\n+ tail\r\n';
    const result = replace(parseRenderedSource(source), 'inner', '##');
    expect(result.doc.firstChild!.child(0).lastChild!.textContent).toBe('##');
  });
  it('preserves list markers and mixed breaks while a nested heading prefix is typed incrementally', () => {
    const source = '+ outer\r\n  + inner\n+ tail\r\n';
    let projection = replace(parseRenderedSource(source), 'inner', '#');
    expect(projection.mapping.source).toBe(source.replace('inner', '\\#'));
    projection = replace(projection, '#', '##');
    expect(projection.mapping.source).toBe(source.replace('inner', '\\##'));
  });
  it('preserves an ordinary hyphen-led paragraph without normalizing unrelated punctuation', () => {
    const source = '-not-a-list has  spaces  here.\r\n';
    const projection = replace(parseRenderedSource(source), 'here.', 'there.');
    expect(projection.mapping.source).toBe(source.replace('here.', 'there.'));
  });
  it('reopens an unfinished blockquote as an editable empty paragraph', () => {
    const projection = parseRenderedSource('> ');
    expect(projection.doc.firstChild!.firstChild?.type.name).toBe('paragraph');
    const state = EditorState.create({ doc: projection.doc });
    const result = apply(projection, state.tr.insertText('quote', 2));
    expect(result.mapping.source).toContain('> quote');
  });
  it.each(['bullet_list', 'ordered_list'])(
    'accepts a newly wrapped empty %s before its first character',
    (type) => {
      let projection = parseRenderedSource('');
      const state = EditorState.create({
        doc: projection.doc,
        selection: TextSelection.create(projection.doc, 1),
      });
      let transaction: Transaction | undefined;
      expect(
        wrapInList(schema.nodes[type]!)(state, (tr) => {
          transaction = tr;
        }),
      ).toBe(true);
      projection = apply(projection, transaction!);
      const next = EditorState.create({ doc: projection.doc });
      projection = apply(projection, next.tr.insertText('first', 3));
      expect(projection.doc.textContent).toBe('first');
      expect(projection.mapping.source).toContain(
        type === 'bullet_list' ? '- first' : '1. first',
      );
    },
  );
  it('projects all ordinary Markdown structures into editable semantic nodes', () => {
    const source =
      '# Heading\n\nA **bold**, *italic*, ~~deleted~~ and `code` paragraph.\n\n- item\n  - nested\n- [ ] task\n\n3. three\n4. four\n\n> quote\n\n---\n\n```ts\nconst x = 1;\n```\n\n| A | B |\n| :--- | ---: |\n| x | y |\n\n$x$\n\n$$\nx^2\n$$\n\n[[Target|Label]] and ![Alt](attachment:abc)';
    const projection = parseRenderedSource(source);
    const names = new Set<string>();
    projection.doc.descendants((node) => {
      names.add(node.type.name);
      node.marks.forEach((mark) => names.add(mark.type.name));
    });
    for (const name of [
      'heading',
      'paragraph',
      'strong',
      'em',
      'strike',
      'code',
      'bullet_list',
      'ordered_list',
      'list_item',
      'blockquote',
      'horizontal_rule',
      'code_block',
      'table',
      'table_header',
      'table_cell',
      'inline_math',
      'math_block',
      'wikilink',
      'image',
    ])
      expect(names.has(name), name).toBe(true);
    expect(serializeRenderedChange(projection, projection.doc)).toBe(source);
  });

  it('keeps BOM, metadata, mixed physical newlines, ESM and JSX exact through an ordinary text edit', () => {
    const source =
      '\uFEFF---\r\ntitle: Keep\r\n---\r\n\r\nimport { Counter } from "./Counter.jsx";\r\n\r\n# Title\r\n\r\nA **bold** paragraph.\n\r\n<Counter initial={3} />\r\n\r\nTail 🧠\r';
    const initial = parseRenderedSource(source);
    const edited = replace(initial, 'paragraph.', 'edited paragraph.');
    expect(edited.mapping.source).toBe(
      source.replace('paragraph.', 'edited paragraph.'),
    );
    expect(edited.doc).not.toBe(initial.doc);
  });

  it('keeps the caller node identities across repeated edits and refreshes source offsets', () => {
    const initial = parseRenderedSource('Before.\r\n\r\n$x$ and [[Target]].\n');
    let projection = replace(
      initial,
      'Before.',
      'A much longer first paragraph.',
    );
    projection = replace(projection, 'longer', 'longer edited');
    const math = findNode(projection.doc, 'inline_math').node;
    const range = renderedSourceRange(projection, math)!;
    expect(projection.mapping.source.slice(range.from, range.to)).toBe('$x$');
    expect(range.from).toBe(projection.mapping.source.indexOf('$x$'));
    expect(serializeRenderedChange(projection, projection.doc)).toBe(
      projection.mapping.source,
    );
  });

  it('changes exactly one checklist character, retaining original list markers and spacing', () => {
    const source =
      '\uFEFF# Tasks\r\n\r\n*  [ ] First **task**\r\n*  [X] Second\n\nEnd';
    const projection = parseRenderedSource(source);
    const { node, pos } = findNode(projection.doc, 'list_item');
    const state = EditorState.create({ doc: projection.doc });
    const next = apply(
      projection,
      state.tr.setNodeMarkup(pos, undefined, { ...node.attrs, checked: true }),
    );
    expect(next.mapping.source).toBe(source.replace('[ ]', '[x]'));
  });

  it('normalizes only the editing projection of CR and CRLF inside multiline text', () => {
    const source = '\uFEFF# Title\r\n\r\n- [ ] task\n- other\rTail';
    const initial = parseRenderedSource(source);
    expect(initial.doc.textContent).not.toContain('\r');
    const next = replace(initial, 'other', 'changed');
    expect(next.mapping.source).toBe(source.replace('other', 'changed'));
    const after = replace(next, 'Tail', 'Later');
    expect(after.mapping.source).toBe(
      source.replace('other', 'changed').replace('Tail', 'Later'),
    );
  });

  it('retains CR, LF and CRLF soft breaks within one changed paragraph', () => {
    const source = 'First\rSecond\r\nThird\nFourth\r\n';
    const next = replace(parseRenderedSource(source), 'Third', 'New third');
    expect(next.mapping.source).toBe(source.replace('Third', 'New third'));
  });

  it('edits nested list text without normalizing surrounding markers or indentation', () => {
    const source = '+  Alpha\r\n   *  Nested **value**\r\n+  Omega\n';
    const next = replace(parseRenderedSource(source), 'value', 'changed');
    expect(next.mapping.source).toBe(source.replace('value', 'changed'));
  });

  it('preserves exact table pipes and alignment during a cell text change', () => {
    const source =
      '|  Name  | Value |\r\n| :--- | ---: |\r\n| Original | 7 |\n\nTail';
    const next = replace(parseRenderedSource(source), 'Original', 'Updated');
    expect(next.mapping.source).toBe(source.replace('Original', 'Updated'));
  });

  it('preserves physical code-block breaks during an ordinary code edit', () => {
    const source = '~~~js title\r\nconst x = 1;\nconst y = 2;\r\n~~~\r\n';
    const next = replace(parseRenderedSource(source), 'x = 1', 'x = 3');
    expect(next.mapping.source).toBe(source.replace('x = 1', 'x = 3'));
  });

  it('retains a new empty paragraph through Enter and subsequent typing', () => {
    const initial = parseRenderedSource('First.\r\n');
    const state = EditorState.create({ doc: initial.doc });
    const end = findText(state.doc, 'First.') + 6;
    const split = state.tr.split(end);
    let projection = apply(initial, split);
    expect(projection.doc.childCount).toBe(2);
    const emptyStart = projection.doc.content.size - 1;
    const next = EditorState.create({ doc: projection.doc }).tr.insertText(
      'Second.',
      emptyStart,
    );
    projection = apply(projection, next);
    expect(projection.mapping.source).toBe('First.\r\n\r\nSecond.\r\n');
  });

  it('retains multiple empty paragraphs without accumulating extra blank lines per keystroke', () => {
    let projection = parseRenderedSource('First');
    for (let count = 0; count < 2; count++) {
      const state = EditorState.create({ doc: projection.doc });
      projection = apply(
        projection,
        state.tr.split(state.doc.content.size - 1),
      );
    }
    const state = EditorState.create({ doc: projection.doc });
    projection = apply(
      projection,
      state.tr.insertText('A', state.doc.content.size - 1),
    );
    projection = replace(projection, 'A', 'AB');
    expect(projection.mapping.source).toBe('First\n\n\n\nAB');
  });

  it.each([
    '**one**\n\ntwo',
    '| one | two |\n| --- | --- |\n| a | b |',
    '- one\r- two',
  ])(
    'types trailing whitespace inside marks, cells and CR paragraphs: %s',
    (source) => {
      expect(
        replace(parseRenderedSource(source), 'one', 'one ').doc.textContent,
      ).toContain('one ');
    },
  );
  it.each([
    '- one\n- two',
    '> one\n>\n> two',
    '- one\n  - two',
    '- one\n\n  two',
  ])(
    'types a space at the end of a nonfinal nested paragraph: %s',
    (source) => {
      const result = replace(parseRenderedSource(source), 'one', 'one ');
      expect(result.doc.textContent).toContain('one ');
      expect(result.mapping.source).toContain('two');
    },
  );
  it('preserves a typed space at the end of a paragraph', () => {
    const projection = parseRenderedSource('Write here.\n\n<Probe />\n');
    const result = replace(projection, 'Write here.', 'Write here. ');
    expect(result.doc.textContent).toContain('Write here. ');
  });
  it('indents an empty list item before typing its text', () => {
    const projection = parseRenderedSource('- bullet\n- \n');
    const state = EditorState.create({
      doc: projection.doc,
      selection: TextSelection.create(
        projection.doc,
        projection.doc.content.size - 3,
      ),
    });
    let transaction: Transaction | undefined;
    expect(
      sinkListItem(schema.nodes.list_item!)(state, (tr) => {
        transaction = tr;
      }),
    ).toBe(true);
    const result = apply(projection, transaction!);
    expect(result.mapping.source).toContain('  - ');
  });
  it('indents an empty ordered list item before typing its text', () => {
    const projection = parseRenderedSource('1. first\n2. \n');
    const state = EditorState.create({
      doc: projection.doc,
      selection: TextSelection.create(
        projection.doc,
        projection.doc.content.size - 3,
      ),
    });
    let transaction: Transaction | undefined;
    expect(
      sinkListItem(schema.nodes.list_item!)(state, (tr) => {
        transaction = tr;
      }),
    ).toBe(true);
    const next = apply(projection, transaction!);
    expect(next.doc.firstChild!.firstChild!.lastChild!.type.name).toBe(
      'ordered_list',
    );
  });
  it('continues a list with Enter and accepts text in the new list item', () => {
    const initial = parseRenderedSource('- First\n');
    const end = findText(initial.doc, 'First') + 5;
    const state = EditorState.create({
      doc: initial.doc,
      selection: TextSelection.create(initial.doc, end),
    });
    let transaction: Transaction | undefined;
    expect(
      splitListItem(schema.nodes.list_item!)(state, (tr) => {
        transaction = tr;
      }),
    ).toBe(true);
    const split = apply(initial, transaction!);
    const nextState = EditorState.create({
      doc: split.doc,
      selection: transaction!.selection,
    });
    const filled = apply(split, nextState.tr.insertText('Second'));
    expect(filled.mapping.source).toBe('- First\n- Second\n');
  });

  it('continues a checked task into an unchecked empty task before typing', () => {
    const initial = parseRenderedSource('- [x] First\r\n');
    const end = findText(initial.doc, 'First') + 5;
    const state = EditorState.create({
      doc: initial.doc,
      selection: TextSelection.create(initial.doc, end),
    });
    let transaction: Transaction | undefined;
    expect(
      splitListItem(schema.nodes.list_item!, { checked: false })(
        state,
        (tr) => {
          transaction = tr;
        },
      ),
    ).toBe(true);
    let projection = apply(initial, transaction!);
    expect(projection.mapping.source).toBe('- [x] First\r\n- [ ] \r\n');
    const nextState = EditorState.create({
      doc: projection.doc,
      selection: transaction!.selection,
    });
    projection = apply(projection, nextState.tr.insertText('Second'));
    expect(projection.mapping.source).toBe('- [x] First\r\n- [ ] Second\r\n');
  });

  it('inserts an empty two-by-two table and accepts a subsequent row', () => {
    const initial = parseRenderedSource('');
    const row = (header: boolean) =>
      schema.nodes.table_row!.create(
        null,
        Array.from({ length: 2 }, () =>
          schema.nodes[
            header ? 'table_header' : 'table_cell'
          ]!.createAndFill()!,
        ),
      );
    const table = schema.nodes.table!.create(null, [row(true), row(false)]);
    let projection = apply(
      initial,
      EditorState.create({ doc: initial.doc }).tr.replaceSelectionWith(table),
    );
    expect(findNode(projection.doc, 'table').node.childCount).toBe(2);
    const cell = findNode(projection.doc, 'table_header');
    const state = EditorState.create({
      doc: projection.doc,
      selection: TextSelection.create(projection.doc, cell.pos + 2),
    });
    let transaction: Transaction | undefined;
    expect(
      addRowAfter(state, (tr) => {
        transaction = tr;
      }),
    ).toBe(true);
    projection = apply(projection, transaction!);
    expect(findNode(projection.doc, 'table').node.childCount).toBe(3);
  });

  it('preserves code pipes when a table formatting change requires serialization', () => {
    const initial = parseRenderedSource(
      '| a | `x\\|y` |\n| --- | --- |\n| b | c |\n',
    );
    const from = findText(initial.doc, 'b');
    const state = EditorState.create({ doc: initial.doc });
    const next = apply(
      initial,
      state.tr.addMark(from, from + 1, schema.marks.strong!.create()),
    );
    expect(next.mapping.source).toContain('`x\\|y`');
    expect(next.doc.textContent).toContain('x|y');
  });

  it('inserts a new display equation with valid source delimiters', () => {
    const initial = parseRenderedSource('');
    const state = EditorState.create({ doc: initial.doc });
    const next = apply(
      initial,
      state.tr.replaceSelectionWith(
        schema.nodes.math_block!.create(
          { value: 'x^2' },
          schema.text('$$\nx^2\n$$'),
        ),
      ),
    );
    expect(next.mapping.source).toBe('$$\nx^2\n$$');
    expect(renderedSourceRange(next, next.doc.firstChild!)).toEqual({
      from: 0,
      to: 9,
    });
  });

  it('creates a directly editable empty document without inserting placeholder source', () => {
    const initial = parseRenderedSource('');
    expect(initial.doc.firstChild?.type.name).toBe('paragraph');
    expect(serializeRenderedChange(initial, initial.doc)).toBe('');
    const next = apply(
      initial,
      EditorState.create({ doc: initial.doc }).tr.insertText('Hello', 1),
    );
    expect(next.mapping.source).toBe('Hello');
  });

  it('keeps a terminal Shift+Enter break while the next line is still empty, then accepts text', () => {
    const initial = parseRenderedSource('First line.');
    const state = EditorState.create({ doc: initial.doc });
    let projection = apply(
      initial,
      state.tr.insert(
        state.doc.content.size - 1,
        schema.nodes.hard_break!.create(),
      ),
    );
    expect(projection.mapping.source).toBe('First line.\\\n');
    expect(projection.doc.firstChild!.lastChild!.type.name).toBe('hard_break');
    const nextState = EditorState.create({ doc: projection.doc });
    projection = apply(
      projection,
      nextState.tr.insertText('Second line.', nextState.doc.content.size - 1),
    );
    expect(projection.mapping.source).toBe('First line.\\\nSecond line.');
    const reopened = parseRenderedSource(projection.mapping.source);
    expect(reopened.doc.firstChild!.child(1).type.name).toBe('hard_break');
  });

  it('retains repeated terminal hard breaks and the surrounding CRLF source', () => {
    const source = '\uFEFFFirst.\r\n\r\nOther.';
    let projection = parseRenderedSource(source);
    for (let index = 0; index < 2; index++) {
      const state = EditorState.create({ doc: projection.doc });
      projection = apply(
        projection,
        state.tr.insert(
          projection.doc.firstChild!.nodeSize - 1,
          schema.nodes.hard_break!.create(),
        ),
      );
    }
    const state = EditorState.create({ doc: projection.doc });
    projection = apply(
      projection,
      state.tr.insertText('Next.', projection.doc.firstChild!.nodeSize - 1),
    );
    expect(projection.mapping.source).toBe(
      '\uFEFFFirst.\\\r\n\\\r\nNext.\r\n\r\nOther.',
    );
  });

  it('preserves an existing backslash hard break and mixed EOL bytes when its text is edited', () => {
    const source = '\uFEFFFirst\\\r\nSecond\n\nUnchanged';
    const next = replace(parseRenderedSource(source), 'Second', 'Changed');
    expect(next.mapping.source).toBe(source.replace('Second', 'Changed'));
  });

  it('supports heading structure changes while preserving surrounding blocks', () => {
    const source = '\uFEFFParagraph\r\n\r\n<Counter />\r\n';
    const initial = parseRenderedSource(source);
    const state = EditorState.create({ doc: initial.doc });
    const next = apply(
      initial,
      state.tr.setNodeMarkup(0, schema.nodes.heading, { level: 2 }),
    );
    expect(next.mapping.source).toBe(
      '\uFEFF## Paragraph\r\n\r\n<Counter />\r\n',
    );
  });

  it('serializes formatting changes only within the edited top-level block', () => {
    const source = 'A plain paragraph.\r\n \r\n+ Original\r\n\r\n<Counter />\n';
    const initial = parseRenderedSource(source);
    const from = findText(initial.doc, 'plain');
    const state = EditorState.create({ doc: initial.doc });
    const next = apply(
      initial,
      state.tr.addMark(from, from + 5, schema.marks.strong!.create()),
    );
    expect(next.mapping.source).toBe(source.replace('plain', '**plain**'));
  });

  it('writes inserted Markdown punctuation as literal text rather than executing markup', () => {
    const initial = parseRenderedSource('Text.');
    const next = replace(
      initial,
      'Text.',
      'Text <script>{evil}</script> $literal$.',
    );
    expect(next.doc.textContent).toBe(
      'Text <script>{evil}</script> $literal$.',
    );
    expect(next.mapping.source).toContain('\\<script\\>\\{evil\\}');
    expect(findNode(next.doc, 'paragraph').node.textContent).toContain(
      '<script>',
    );
  });

  it('keeps escaped text and entities semantically correct when its block must be serialized', () => {
    const source = 'A &amp; B and \\*literal\\*.\r\n\r\nUntouched &copy;\n';
    const initial = parseRenderedSource(source, 'note.md');
    const next = replace(initial, 'B and', 'C and');
    expect(next.doc.textContent).toContain('A & C and *literal*.');
    expect(next.mapping.source.endsWith('\r\n\r\nUntouched &copy;\n')).toBe(
      true,
    );
  });

  it('preserves supplementary Unicode through a sparse replacement', () => {
    const source = '\uFEFFA 🧠 value\r\n\r\nUntouched 😀\n';
    const next = replace(parseRenderedSource(source), '🧠', '🎉');
    expect(next.mapping.source).toBe(source.replace('🧠', '🎉'));
  });

  it('edits math after earlier text has shifted source positions', () => {
    let projection = replace(
      parseRenderedSource('Before\r\n\r\n$x$\n'),
      'Before',
      'Before plus more',
    );
    const { pos } = findNode(projection.doc, 'inline_math');
    const state = EditorState.create({ doc: projection.doc });
    projection = apply(projection, state.tr.insertText('^2', pos + 3));
    expect(projection.mapping.source).toBe('Before plus more\r\n\r\n$x^2$\n');
  });

  it('keeps malformed MDX source as an opaque non-executing block', () => {
    const source = '# Heading\n\n<unclosed';
    const projection = parseRenderedSource(source);
    expect(projection.doc.firstChild?.type.name).toBe('source_block');
    expect(projection.doc.firstChild?.attrs.value).toBe(source);
    expect(serializeRenderedChange(projection, projection.doc)).toBe(source);
  });

  it('renders executable MDX syntax only as opaque atoms with raw source provenance', () => {
    const source =
      'export const secret = window.localStorage;\n\n<Component />\n\nA {secret} value.';
    const projection = parseRenderedSource(source);
    expect(projection.doc.firstChild?.attrs.kind).toBe('mdxjsEsm');
    expect(projection.doc.child(1).attrs.kind).toBe('mdxJsxFlowElement');
    const inline = findNode(projection.doc, 'source_inline').node;
    const range = renderedSourceRange(projection, inline)!;
    expect(source.slice(range.from, range.to)).toBe('{secret}');
  });

  it('refuses host navigation to executable URL schemes', () => {
    for (const href of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.test',
      'java\nscript:alert(1)',
    ])
      expect(safeRenderedHref(href)).toBeNull();
    expect(safeRenderedHref('https://example.com/path')).toBe(
      'https://example.com/path',
    );
  });

  it('serializes URL-labelled links as valid Markdown instead of MDX angle-bracket syntax', () => {
    const initial = parseRenderedSource('https://example.com');
    const state = EditorState.create({ doc: initial.doc });
    const next = apply(
      initial,
      state.tr.addMark(
        1,
        state.doc.content.size - 1,
        schema.marks.link!.create({ href: 'https://example.com/path' }),
      ),
    );
    expect(next.mapping.source).toBe(
      '[https://example.com](https://example.com/path)',
    );
  });
});

it('does not invent closing dollars when changing a paragraph containing unfinished mathematical text into a heading', () => {
  const source = '\uFEFFBefore $x \\mathbb{R}\r\n\r\n<Counter />\r\n';
  const projection = parseRenderedSource(source);
  const node = projection.doc.firstChild!;
  const state = EditorState.create({ doc: projection.doc });
  const changed = apply(
    projection,
    state.tr.setNodeMarkup(0, schema.nodes.heading, {
      ...node.attrs,
      level: 2,
    }),
  );
  expect(changed.mapping.source).toBe(source.replace('Before', '## Before'));
});
