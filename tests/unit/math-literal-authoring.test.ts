import { describe, expect, it } from 'vitest';
import {
  collectLiveMath,
  completedMath,
  planMathSourceReplacement,
} from '../../src/editor/math/mathSource';
import { parseRenderedSource } from '../../src/editor/rendered/sourceBridge';
import { compileDocumentSource } from '../../src/compiler/compileDocumentSource';

describe('literal text while mathematical delimiters are incomplete', () => {
  it.each([
    { tail: '__bold__', mark: 'strong', text: 'bold' },
    { tail: '_italic_', mark: 'em', text: 'italic' },
    { tail: '[link](https://example.com)', mark: 'link', text: 'link' },
    { tail: '\\*literal\\*', mark: null, text: '*literal*' },
    { tail: '\\sqrt[2]{x} + x_{i}', mark: null, text: '\\sqrt[2]{x} + x_{i}' },
  ])(
    'parses $tail independently after an unfinished dollar',
    ({ tail, mark, text }) => {
      const projection = parseRenderedSource('Before $draft ' + tail);
      expect(projection.doc.textContent).toBe('Before $draft ' + text);
      if (mark) {
        const marked: string[] = [];
        projection.doc.descendants((node) => {
          if (
            node.isText &&
            node.marks.some((value) => value.type.name === mark)
          )
            marked.push(node.text!);
        });
        expect(marked).toEqual([text]);
      }
      expect(projection.analysisDiagnostic).toBeNull();
    },
  );
  it('keeps neighboring Markdown formatting independent of an unmatched dollar', () => {
    const projection = parseRenderedSource('$x before **bold** and `code`.');
    const marked: string[] = [];
    projection.doc.descendants((node) => {
      if (node.isText && node.marks.some((mark) => mark.type.name === 'strong'))
        marked.push(node.text!);
    });
    expect(marked).toEqual(['bold']);
  });
  it('retains ordinary prose structure and escapes after an imported unfinished dollar', () => {
    const source =
      'Before $draft __bold__ and _italic_ [link](https://example.com) \\*literal\\* <Safe value={1} />.';
    const projection = parseRenderedSource(source);
    const found: Record<string, string[]> = {
      strong: [],
      em: [],
      link: [],
      source_inline: [],
    };
    projection.doc.descendants((node) => {
      if (node.isText)
        for (const mark of node.marks)
          if (found[mark.type.name]) found[mark.type.name]!.push(node.text!);
      if (node.type.name === 'source_inline')
        found.source_inline!.push(node.attrs.raw as string);
    });
    expect(found.strong).toEqual(['bold']);
    expect(found.em).toEqual(['italic']);
    expect(found.link).toEqual(['link']);
    expect(found.source_inline).toEqual(['<Safe value={1} />']);
    expect(projection.doc.textContent).toContain('*literal*');
    expect(projection.doc.textContent).not.toContain('\\*');
  });
  it('keeps the supplied incomplete display formula editable without consuming later Markdown or JSX', () => {
    const raw = "$$\r\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\r\n$";
    const source =
      '\uFEFF# Mathematics\r\n\r\n' +
      raw +
      '\r\n\r\nFollowing **paragraph**.\r\n\r\n<Counter />\r\n';
    const parsed = parseRenderedSource(source, 'note.mdx');
    expect(parsed.doc.textContent).toContain('Following paragraph.');
    expect(
      collectLiveMath(source, 'note.mdx', true).some(
        (span) => span.originalOuter === raw,
      ),
    ).toBe(true);
    const sourceBlocks: string[] = [];
    parsed.doc.descendants((node) => {
      if (node.type.name === 'source_block')
        sourceBlocks.push(node.attrs.raw as string);
    });
    expect(sourceBlocks).toEqual(['<Counter />']);
  });

  it.each([true, false])(
    'compiles unmatched inline dollars as literal source with mathematics=%s, preserving braces',
    async (enabled) => {
      const output = String(
        await compileDocumentSource(
          'Before $x \\in \\mathbb{R}. After.',
          'note.mdx',
          true,
          enabled,
        ),
      );
      expect(output).toContain('mathbb{R}');
      expect(output).not.toContain('katex');
      expect(output).not.toContain('children: R');
    },
  );

  it('keeps raw TeX literal when an opening dollar is removed', async () => {
    const output = String(
      await compileDocumentSource(
        'A set x \\in \\mathbb{R}$.\n\nA subscript x_{i}$.',
        'note.mdx',
        true,
      ),
    );
    expect(output).toContain('mathbb{R}');
    expect(output).toContain('_{i}');
    expect(output).not.toContain('katex');
  });

  it('leaves dollars in imports, JSX attributes and code fences opaque', () => {
    const setup = 'export const message = "$x \\\\mathbb{R}"';
    const jsx = '<span title="$unclosed">Opaque</span>';
    const source =
      setup + '\n\n```mdx\n$x \\mathbb{R}\n```\n\n' + jsx + '\n\nBefore $x^2';
    const parsed = parseRenderedSource(source, 'note.mdx');
    const raw: string[] = [];
    parsed.doc.descendants((node) => {
      if (
        node.type.name === 'source_block' ||
        node.type.name === 'source_inline'
      )
        raw.push(node.attrs.raw as string);
    });
    expect(raw).toEqual([setup, jsx]);
    expect(
      collectLiveMath(source, 'note.mdx', true).map(
        (span) => span.originalOuter,
      ),
    ).toEqual(['$x^2']);
  });

  it('keeps ordinary React expressions outside literal mathematical tokens executable', async () => {
    const source =
      'export const price = 2\n\nPrice {price}$.\n\n<button>{price}</button>';
    const output = String(
      await compileDocumentSource(source, 'note.mdx', true),
    );
    expect(output).toContain('export const price');
    expect(output).toContain('children: price');
  });
});

describe('exact raw math source patches', () => {
  it('demotes missing delimiters and promotes their correction, preserving BOM and CRLF', () => {
    const raw = '$$\r\n\\frac{a}{b}\r\n$$';
    const source =
      '\uFEFFexport const Keep = 1\r\n\r\n' + raw + '\r\n\r\n<Counter />\r\n';
    const span = collectLiveMath(source)[0]!;
    const entered = span.originalOuter.replace(/\r\n/g, '\n').slice(0, -1);
    const result = planMathSourceReplacement(source, source, span, entered);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.source).toBe(
      source.slice(0, span.to - 1) + source.slice(span.to),
    );
    expect(collectLiveMath(result.source)).toHaveLength(0);
    const draft = collectLiveMath(result.source, 'note.mdx', true)[0]!;
    const restored = planMathSourceReplacement(
      result.source,
      result.source,
      draft,
      entered + '$',
    );
    expect(restored).toMatchObject({ ok: true, source });
  });
  it('rejects stale revisions and protects unrelated JSX from newly paired fences', () => {
    const source = '$x$\n\n<Counter />\n\n$$';
    const span = collectLiveMath(source)[0]!;
    expect(
      planMathSourceReplacement(source + ' ', source, span, '$x'),
    ).toMatchObject({ ok: false });
    expect(
      planMathSourceReplacement(source, source, span, '$$\nx'),
    ).toMatchObject({ ok: false });
  });
  it('distinguishes unfinished literal text from invalid closed mathematics', () => {
    expect(completedMath('$$\nx_{\n$')).toBeNull();
    expect(completedMath('$x \\mathbb{R$')).not.toBeNull();
  });
});

it.each(['$$\nx \\frac{a}{b}\n$', '\\frac{a\nb}', '$x \\mathbb{R}\ncontinued'])(
  'compiles literal source without runtime expressions: %s',
  async (raw) => {
    const source = raw + '\n\nFollowing paragraph.\n\n<button>Safe</button>';
    expect(parseRenderedSource(source).doc.textContent).toContain(
      'Following paragraph.',
    );
    const output = String(
      await compileDocumentSource(source, 'note.mdx', true),
    );
    expect(output).not.toContain('katex');
    expect(output).toContain('Following paragraph.');
  },
);

it('keeps subsequent document links indexed when a display delimiter is unfinished', async () => {
  const { parseSourceWikilinks } =
    await import('../../src/links/workspaceLinks');
  const source = '$$\nx \\mathbb{R}\n$\n\nSee [[Target]].';
  expect(parseSourceWikilinks(source)).toHaveLength(1);
});

it('bounds repeated unfinished display-fence scans and resets the work budget for the next document', async () => {
  const { createProcessor } = await import('@mdx-js/mdx');
  const { remarkMathAuthoring } =
    await import('../../src/plugins/core/mathSyntax');
  const processor = createProcessor({
    format: 'mdx',
    remarkPlugins: [remarkMathAuthoring],
  });
  expect(() => processor.parse('$$draft\n'.repeat(1000))).toThrow(
    'Mathematical source analysis reached its work limit',
  );
  expect(() => processor.parse('$$\nx^2\n$$')).not.toThrow();
  const source = '$$draft\n'.repeat(1000);
  const projection = parseRenderedSource(source);
  expect(projection.doc.firstChild?.type.name).toBe('source_block');
  expect(projection.doc.firstChild?.attrs.raw).toBe(source);
});

it('bounds repeated unfinished JSX-looking comparisons in literal mathematics without retaining the previous document budget', async () => {
  const { createProcessor } = await import('@mdx-js/mdx');
  const { remarkMathAuthoring } =
    await import('../../src/plugins/core/mathSyntax');
  const processor = createProcessor({
    format: 'mdx',
    remarkPlugins: [remarkMathAuthoring],
  });
  expect(() => processor.parse('$' + '<a'.repeat(3000))).toThrow(
    'Mathematical source analysis reached its work limit',
  );
  expect(() => processor.parse('Before $x < y\n\n<Counter />')).not.toThrow();
});
