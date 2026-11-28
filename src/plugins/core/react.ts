import { parseLiveSource } from '../../editor/math/mathSource';

export const reactPlugin = {
  id: 'react',
  name: 'React components',
  description: 'Run MDX components in an unprivileged, isolated preview.',
} as const;

export function executablePreviewKind(kind: string, raw?: string): boolean {
  if (!kind.startsWith('mdx') || kind === 'mdxjsEsm') return false;
  if (!kind.endsWith('Expression') || raw === undefined) return true;
  const value = raw.trim();
  if (!value.startsWith('{') || !value.endsWith('}')) return true;
  const body = value.slice(1, -1);
  let cursor = 0;
  while (cursor < body.length) {
    if (/\s/u.test(body.charAt(cursor))) {
      cursor++;
      continue;
    }
    if (body.startsWith('/*', cursor)) {
      const end = body.indexOf('*/', cursor + 2);
      if (end < 0) return true;
      cursor = end + 2;
    } else if (body.startsWith('//', cursor)) {
      const end = /[\r\n]/.exec(body.slice(cursor + 2));
      cursor = end ? cursor + 2 + end.index + 1 : body.length;
    } else return true;
  }
  return false;
}

/** Select source from the host AST; document output never supplies transforms. */
export function runtimeIslandSource(source: string, path: string, raw: string) {
  const tree = parseLiveSource(source, path);
  const setup = (tree?.children ?? [])
    .filter((node) => node.type === 'mdxjsEsm')
    .map((node) =>
      source.slice(node.position!.start.offset, node.position!.end.offset),
    );
  return [...setup, raw].join('\n\n');
}

/** Full-document execution also supports the host's optional source presentation. */
export function remarkComponentSource() {
  type Node = {
    type: string;
    value?: string;
    lang?: string;
    children?: Node[];
    position?: { start: { offset?: number }; end: { offset?: number } };
  };
  return (tree: Node, file: { value: unknown }) => {
    const source = String(file.value);
    const prefix = source.charCodeAt(0) === 0xfeff ? 1 : 0;
    const visit = (parent: Node) => {
      const children: Node[] = [];
      for (const node of parent.children ?? []) {
        if (node.type === 'mdxjsEsm' || executablePreviewKind(node.type)) {
          const from = node.position?.start.offset;
          const to = node.position?.end.offset;
          if (from !== undefined && to !== undefined) {
            const inline =
              node.type === 'mdxJsxTextElement' ||
              node.type === 'mdxTextExpression';
            children.push({
              type: inline ? 'inlineCode' : 'code',
              lang: node.type === 'mdxjsEsm' ? 'js' : 'jsx',
              value: source.slice(from + prefix, to + prefix),
            });
          }
        } else if (node.children) visit(node);
        children.push(node);
      }
      parent.children = children;
    };
    visit(tree);
  };
}

export function previewSourcePolicy(
  kind: string,
  raw: string,
  reactEnabled: boolean,
  showComponentSource: boolean,
) {
  const source = !kind.startsWith('mdx') || showComponentSource;
  const render = executablePreviewKind(kind, raw) && reactEnabled;
  return { source, render, hidden: !source && !render };
}
