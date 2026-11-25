import { describe, expect, it } from 'vitest';
import { compileDocumentSource } from '../../src/compiler/compileDocumentSource';

describe('web document compilation', () => {
  it('keeps braces, imports and HTML literal in ordinary Markdown', async () => {
    const output = String(
      await compileDocumentSource(
        'A set {x: x > 0}.\n\nimport Widget from "./Widget.tsx"\n\n<script>alert(1)</script>',
        'notes/plain.MD',
        true,
      ),
    );
    expect(output).toContain('A set {x: x > 0}.');
    expect(output).toContain('import Widget from');
    expect(output).not.toContain('import Widget from "./Widget.tsx";');
    expect(output).not.toContain('alert(1)');
  });

  it('retains executable expressions in explicitly MDX sources', async () => {
    const output = String(
      await compileDocumentSource(
        'The result is {1 + 1}.',
        'notes/program.mdx',
        true,
      ),
    );
    expect(output).toContain('1 + 1');
    expect(output).not.toContain('The result is {1 + 1}.');
  });

  it('renders math and GFM without enabling network-capable KaTeX commands', async () => {
    const output = String(
      await compileDocumentSource(
        'Inline $\\frac{a}{b}$.\n\n$$\n\\int_0^1 x^2\\,dx = \\frac13\n$$\n\n| A | B |\n| - | - |\n| x | y |\n\n- [x] Done\n\n$\\includegraphics{https://example.com/private}$',
        'notes/math.mdx',
        true,
      ),
    );
    expect(output).toContain('katex');
    expect(output).toContain('katex-display');
    expect(output).toContain('table');
    expect(output).toContain('task-list-item');
    expect(output).not.toContain('src: "https://example.com/private"');
    expect(output).not.toContain('img:');
  });

  it('leaves native math opt-in and ordinary Markdown semantics unchanged', async () => {
    const output = String(
      await compileDocumentSource('A set {x: x > 0}. $x^2$', 'native.md'),
    );
    expect(output).toContain('A set {x: x > 0}. $x^2$');
    expect(output).not.toContain('katex');
  });
});

describe('disabled core mathematics compilation', () => {
  it('keeps dollar-delimited math as literal text without interpreting TeX braces as MDX expressions', async () => {
    const output = String(
      await compileDocumentSource(
        'Literal $x^2$ and $\\mathbb{R}$.',
        'note.mdx',
        true,
        false,
      ),
    );
    expect(output).not.toContain('katex');
    expect(output).toContain('$x^2$');
    expect(output).toContain('mathbb{R}');
  });
});

it.each(['note.md', 'note.mdx'])(
  'preserves math delimiters when disabled in a BOM-prefixed %s document',
  async (path) => {
    const output = String(
      await compileDocumentSource(
        '\uFEFF# Header\r\n\r\nText $\\mathbb{R}$.\r\n',
        path,
        true,
        false,
      ),
    );
    expect(output).toContain('mathbb{R}$');
    expect(output).not.toContain('katex');
  },
);

it('shows optional component source as ordinary code while keeping executable JSX and exports', async () => {
  const source = 'export const label = "example"\n\n<button>Live</button>\n';
  const output = String(
    await compileDocumentSource(source, 'note.mdx', true, true, true),
  );
  expect(output).toContain('pre: "pre"');
  expect(output).toContain('language-js');
  expect(output).toContain('export const label');
  expect(output).toContain('button');
});

it('keeps malformed TeX as literal dollar-delimited red source in full-document compilation', async () => {
  const output = String(
    await compileDocumentSource(
      '\uFEFFAn error $x \\in \\mathbb{R$.\r\n\r\n$$\r\n\\frac{a}{\r\n$$\r\n\r\nValid $y^2$.',
      'note.mdx',
      true,
    ),
  );
  expect(output).toContain('mathbb{R$');
  expect(output).toContain('color:');
  expect(output).toContain('katex');
  expect(output).not.toContain('ParseError');
});
