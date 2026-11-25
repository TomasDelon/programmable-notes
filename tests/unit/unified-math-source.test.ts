import { describe, expect, it } from 'vitest';
import { EditorState } from 'prosemirror-state';
import { DOMParser, DOMSerializer } from 'prosemirror-model';
import { renderedSchema as schema } from '../../src/editor/rendered/schema';
import {
  parseRenderedSource,
  rebaseRenderedProjection,
  serializeRenderedChange,
  renderedTextSourceOffset,
  renderedPositionFromSourceOffset,
} from '../../src/editor/rendered/sourceBridge';

describe('same-document mathematical source', () => {
  it('projects unfinished inline and display syntax as ordinary editable text', () => {
    for (const source of ['$x \\mathbb{R}', '$$\r\nx \\frac{a}{b}\r\n$']) {
      const projection = parseRenderedSource(source);
      const mathNodes: string[] = [];
      projection.doc.descendants((node) => {
        if (['inline_math', 'math_block'].includes(node.type.name))
          mathNodes.push(node.type.name);
      });
      expect(mathNodes).toEqual([]);
      expect(projection.doc.textContent).toBe(source.replace(/\r\n/g, '\n'));
      expect(serializeRenderedChange(projection, projection.doc)).toBe(source);
    }
  });

  it('stores complete equation source as editable child text', () => {
    const projection = parseRenderedSource('Before $x^2$ after.');
    let equation: import('prosemirror-model').Node | undefined;
    projection.doc.descendants((node) => {
      if (node.type.name === 'inline_math') equation = node;
    });
    expect(equation?.isAtom).toBe(false);
    expect(equation?.textContent).toBe('$x^2$');
  });

  it('does not expose encoded Markdown whitespace when a formula becomes ordinary text', () => {
    const source = 'Before $x tail&#32;';
    const projection = parseRenderedSource(source);
    expect(projection.doc.textContent).toBe('Before $x tail ');
    expect(serializeRenderedChange(projection, projection.doc)).toBe(source);
  });

  it('keeps an explicitly escaped entity literal instead of globally decoding source', () => {
    const source = '$x \\&#32;';
    const projection = parseRenderedSource(source);
    expect(projection.doc.textContent).toBe('$x &#32;');
    expect(serializeRenderedChange(projection, projection.doc)).toBe(source);
  });

  it('patches raw incomplete TeX without escaping it or changing unrelated CRLF and JSX', () => {
    const prefix = '\uFEFFimport Counter from "./Counter"\r\n\r\n';
    const suffix = '\r\n\r\n<Counter value={1} />\r\n';
    const source = prefix + 'Before $x \\mathbb{R}' + suffix;
    const projection = parseRenderedSource(source);
    let position = -1;
    projection.doc.descendants((node, offset) => {
      if (node.isText && node.text!.includes('mathbb'))
        position = offset + node.text!.indexOf('mathbb');
    });
    expect(position).toBeGreaterThan(0);
    const state = EditorState.create({ doc: projection.doc });
    const transaction = state.tr.insertText('mathbf', position, position + 6);
    const next = serializeRenderedChange(
      projection,
      transaction.doc,
      transaction,
    );
    expect(next).toBe(prefix + 'Before $x \\mathbf{R}' + suffix);
    expect(
      rebaseRenderedProjection(projection, transaction.doc, next).doc
        .textContent,
    ).toContain('Before $x \\mathbf{R}');
  });

  it('patches complete equation child text through the full original math span', () => {
    const source = '\uFEFFBefore $x^2$ after.\r\n\r\n<Counter />\r\n';
    const projection = parseRenderedSource(source);
    let position = -1;
    projection.doc.descendants((node, offset) => {
      if (node.isText && node.text === '$x^2$') position = offset + 3;
    });
    expect(position).toBeGreaterThan(0);
    const state = EditorState.create({ doc: projection.doc });
    const transaction = state.tr.insertText('3', position, position + 1);
    const next = serializeRenderedChange(
      projection,
      transaction.doc,
      transaction,
    );
    expect(next).toBe(source.replace('$x^2$', '$x^3$'));
  });
});

it('maps unified text selections through CRLF and encoded whitespace without landing inside an entity', () => {
  const source = '\uFEFFBefore $x&#32;\r\ny';
  const projection = parseRenderedSource(source);
  const afterSpace = source.indexOf('&#32;') + '&#32;'.length;
  const position = renderedPositionFromSourceOffset(projection, afterSpace);
  expect(position).not.toBeNull();
  expect(renderedTextSourceOffset(projection, position!)).toBe(afterSpace);
  expect(
    renderedPositionFromSourceOffset(projection, afterSpace - 1),
  ).toBeNull();
  const afterBreak = source.indexOf('\r\n') + 2;
  const nextLine = renderedPositionFromSourceOffset(projection, afterBreak);
  expect(nextLine).not.toBeNull();
  expect(renderedTextSourceOffset(projection, nextLine!)).toBe(afterBreak);
});

it('preserves raw TeX ampersands but escapes a newly typed literal whitespace reference', () => {
  for (const [before, inserted, expected] of [
    ['$x ', '& y', '$x & y'],
    ['$x &#32', ';', '$x \\&#32;'],
  ]) {
    const projection = parseRenderedSource(before!);
    const state = EditorState.create({ doc: projection.doc });
    const transaction = state.tr.insertText(
      inserted!,
      state.doc.content.size - 1,
    );
    const next = serializeRenderedChange(
      projection,
      transaction.doc,
      transaction,
    );
    expect(next).toBe(expected);
    expect(
      rebaseRenderedProjection(projection, transaction.doc, next).doc
        .textContent,
    ).toBe(before! + inserted!);
  }
});

it('maps a whole-equation replacement to undelimited adjacent TeX text tokens exactly', () => {
  const source = 'Before x \\in \\mathbb{R} after.';
  const projection = parseRenderedSource(source);
  let merged = false;
  projection.doc.descendants((node) => {
    if ((projection.mapping.texts.get(node)?.length ?? 0) > 1) merged = true;
  });
  expect(merged).toBe(true);
  for (let offset = 0; offset <= source.length; offset++) {
    const position = renderedPositionFromSourceOffset(projection, offset);
    if (position !== null)
      expect(renderedTextSourceOffset(projection, position)).toBe(offset);
  }
  const end = source.indexOf('} after.') + 1;
  const position = renderedPositionFromSourceOffset(projection, end);
  expect(position).not.toBeNull();
  expect(renderedTextSourceOffset(projection, position!)).toBe(end);
  const state = EditorState.create({ doc: projection.doc });
  const transaction = state.tr.insertText('^2', position!);
  const next = serializeRenderedChange(
    projection,
    transaction.doc,
    transaction,
  );
  expect(next).toBe(source.slice(0, end) + '^2' + source.slice(end));
});

it('preserves unfinished formula line breaks through a native DOM mutation and exact source serialization', () => {
  const raw = "$$\r\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\r\n$";
  const prefix = '\uFEFF# Mathematics\r\n\r\n';
  const suffix = '\r\n\r\n<Counter value={1} />\r\n';
  const projection = parseRenderedSource(prefix + raw + suffix);
  const paragraph = projection.doc.child(1);
  const dom = document.createElement('div');
  dom.append(
    DOMSerializer.fromSchema(schema).serializeFragment(
      schema.nodes.doc!.create(null, paragraph).content,
    ),
  );
  const literal = dom.querySelector('[data-math-source]')!;
  literal.firstChild!.nodeValue += '$';
  // Firefox's DOM observer reparses this ordinary paragraph before forwarding
  // its native text insertion. CSS white-space alone cannot control that parse.
  const parsed = DOMParser.fromSchema(schema).parse(dom);
  expect(parsed.textContent).toBe(raw.replace(/\r\n/g, '\n') + '$');
  const nativeDoc = projection.doc.copy(
    projection.doc.content.replaceChild(
      1,
      paragraph.copy(parsed.firstChild!.content),
    ),
  );
  const source = serializeRenderedChange(projection, nativeDoc);
  expect(source).toBe(prefix + raw + '$' + suffix);
  expect(parseRenderedSource(source).doc.child(1).type.name).toBe('math_block');
});

it('preserves authored paragraph soft breaks while leaving heading DOM normalization unchanged', () => {
  const dom = document.createElement('div');
  const paragraph = document.createElement('p');
  paragraph.textContent = 'ordinary\nparagraph';
  dom.append(paragraph);
  expect(DOMParser.fromSchema(schema).parse(dom).textContent).toBe(
    'ordinary\nparagraph',
  );
  const heading = document.createElement('h2');
  heading.textContent = 'ordinary\nheading';
  dom.replaceChildren(heading);
  expect(DOMParser.fromSchema(schema).parse(dom).textContent).toBe(
    'ordinary heading',
  );
});
