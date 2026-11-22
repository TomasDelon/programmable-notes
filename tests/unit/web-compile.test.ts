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
