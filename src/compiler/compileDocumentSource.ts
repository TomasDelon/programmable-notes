import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';

/** Browser features are opt-in so the established native pipeline is unchanged. */
export async function compileDocumentSource(
  source: string,
  path: string,
  webMode = false,
) {
  return compile(
    { value: source, path },
    webMode
      ? {
          development: false,
          // Ordinary Markdown must keep braces and imports as literal text.
          format: /\.md$/i.test(path) ? 'md' : 'mdx',
          remarkPlugins: [remarkGfm, remarkMath],
          rehypePlugins: [
            [
              rehypeKatex,
              { trust: false, maxExpand: 1000, maxSize: 30, strict: 'warn' },
            ],
          ],
        }
      : { development: false },
  );
}
