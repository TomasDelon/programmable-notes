import katex from 'katex';
import { remarkMathAuthoring } from './mathSyntax';
import rehypeKatex from 'rehype-katex';

export const mathematicsPlugin = {
  id: 'mathematics',
  name: 'Mathematics',
  description:
    'Render LaTeX mathematics and reveal editable source at the caret.',
} as const;
export const mathRemarkPlugin = remarkMathAuthoring;
export const mathRehypePlugin = rehypeKatex;
export const mathSafety = {
  trust: false,
  maxExpand: 1000,
  maxSize: 30,
  strict: 'ignore',
} as const;

export function validLatex(value: string, display: boolean): boolean {
  try {
    katex.renderToString(value, {
      ...mathSafety,
      displayMode: display,
      throwOnError: true,
    });
    return true;
  } catch {
    return false;
  }
}

/** TeX validity is presentation feedback, never source-write authorization. */
export function renderMathematics(
  target: HTMLElement,
  value: string,
  raw: string,
  display: boolean,
  enabled = true,
): boolean {
  target.classList.remove('rendered-math-raw');
  if (enabled) {
    try {
      katex.render(value, target, {
        ...mathSafety,
        displayMode: display,
        throwOnError: true,
      });
      return true;
    } catch {
      // Invalid mathematics remains ordinary escaped source, not KaTeX's error HTML.
    }
  }
  target.textContent = raw;
  target.classList.add('rendered-math-raw');
  return !enabled;
}

/** Keep MDX's parser aware of math spans even when mathematical rendering is off. */
export function remarkRawMathematics() {
  return transformMathematics(false);
}

/** Match editable Preview feedback in the isolated full-document compiler. */
export function remarkInvalidMathematics() {
  return transformMathematics(true);
}

function transformMathematics(invalidOnly: boolean) {
  type Node = {
    type: string;
    value?: string;
    data?: { pnMathDraft?: boolean; hProperties?: { style: string } };
    children?: Node[];
    position?: { start: { offset?: number }; end: { offset?: number } };
  };
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    // The Markdown/MDX parser removes the initial BOM before assigning offsets;
    // VFile still contains the original source. This is presentation only.
    const prefix = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    const visit = (parent: Node) => {
      parent.children = parent.children?.map((node) => {
        if (node.type === 'inlineMath' || node.type === 'math') {
          if (node.data?.pnMathDraft) return node;
          const display = node.type === 'math';
          if (invalidOnly && validLatex(node.value ?? '', display)) return node;
          const delimiter = display ? '$$' : '$';
          const from = node.position?.start.offset;
          const to = node.position?.end.offset;
          const raw =
            from !== undefined && to !== undefined
              ? source.slice(from + prefix, to + prefix)
              : `${delimiter}${node.value ?? ''}${delimiter}`;
          if (invalidOnly) {
            return {
              type: display ? 'code' : 'inlineCode',
              value: raw,
              data: { hProperties: { style: 'color:#c33b45' } },
            };
          }
          const text = { type: 'text', value: raw };
          return display ? { type: 'paragraph', children: [text] } : text;
        }
        if (node.children) visit(node);
        return node;
      });
    };
    visit(tree);
  };
}
