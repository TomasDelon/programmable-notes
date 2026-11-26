import { remarkComponentSource } from '../plugins/core/react';
import { compile } from '@mdx-js/mdx';
import remarkGfm from 'remark-gfm';
import {
  mathRemarkPlugin,
  mathRehypePlugin,
  mathSafety,
  remarkRawMathematics,
  remarkInvalidMathematics,
} from '../plugins/core/math';

/** Product Markdown/math transforms are opt-in; /engine keeps its legacy fixture. */
export async function compileDocumentSource(
  source: string,
  path: string,
  webMode = false,
  mathematics = true,
  showComponentSource = false,
) {
  return compile(
    { value: source, path },
    webMode
      ? {
          development: false,
          // Ordinary Markdown must keep braces and imports as literal text.
          format: /\.md$/i.test(path) ? 'md' : 'mdx',
          remarkPlugins: [
            remarkGfm,
            mathRemarkPlugin,
            ...(mathematics
              ? [remarkInvalidMathematics]
              : [remarkRawMathematics]),
            ...(showComponentSource ? [remarkComponentSource] : []),
          ],
          rehypePlugins: mathematics
            ? [[mathRehypePlugin, { ...mathSafety, strict: 'warn' }]]
            : [],
        }
      : { development: false },
  );
}
