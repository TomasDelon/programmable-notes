import { expect, it } from 'vitest';
import { compileDocumentSource } from '../../src/compiler/compileDocumentSource';
import { previewDocument } from '../../src/preview/document';

it('compiles product mathematics and ordinary Markdown without changing native preview authority', async () => {
  const code = String(
    await compileDocumentSource(
      "A derivative $f'(x)$.\n\n$$\n\\frac{f(x+h)-f(x)}{h}\n$$\n\n- [x] Checked\n",
      'note.mdx',
      true,
    ),
  );
  expect(code).toContain('katex-mathml');
  expect(code).toContain('http://www.w3.org/1998/Math/MathML');
  const html = await previewDocument(code);
  expect(html).toContain('.katex-html{display:none}');
  for (const policy of [
    "font-src 'none'",
    "connect-src 'none'",
    "frame-src 'none'",
    "worker-src 'none'",
  ])
    expect(html).toContain(policy);
  expect(html).not.toContain('font-src data:');
  expect(html).not.toContain('<iframe');
});
