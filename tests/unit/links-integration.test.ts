import { describe, expect, it } from 'vitest';
import {
  indexWorkspaceLinks,
  parseSourceWikilinks,
  parseWikilinks,
  proposeRenameReferences,
  type LinkDocument,
} from '../../src/links';

const note = (
  id: string,
  title: string,
  source = '',
  folder = '',
  trashed = false,
): LinkDocument => ({ id, title, source, folder, trashed });

describe('real Markdown/MDX link indexing', () => {
  it('preserves exact BOM, Unicode and mixed line-ending offsets through the parser', () => {
    const source = '\uFEFF😀\r\n[[Équation]]\n\r\n[[Folder/Ωmega|β]]\r';
    const spans = parseSourceWikilinks(source, 'note.md');
    expect(spans.map((span) => [span.target, span.alias])).toEqual([
      ['Équation', undefined],
      ['Folder/Ωmega', 'β'],
    ]);
    for (const span of spans)
      expect(source.slice(span.from, span.to)).toBe(span.raw);
    expect(spans[0]!.from).toBe(source.indexOf('[[Équation]]'));
  });

  it('recognizes actual heading, quote, list, emphasis and table text', () => {
    const source =
      '# [[Heading]]\n\n> [[Quote]]\n\n- **[[List]]**\n\n| Link |\n| --- |\n| [[Cell]] |\n';
    expect(parseSourceWikilinks(source).map((span) => span.target)).toEqual([
      'Heading',
      'Quote',
      'List',
      'Cell',
    ]);
  });

  it('excludes real code, math, JSX, JS expressions, imports and Markdown URLs', () => {
    const source = `import x from './[[Import]].js'

[[Visible]]

\`[[InlineCode]]\` $[[InlineMath]]$

~~~md
[[Fence]]
~~~

$$
[[DisplayMath]]
$$

<div>[[Jsx]]</div>

{'[[Expression]]'}

[label](https://example.com/[[Url]])

[[Last]]`;
    expect(parseSourceWikilinks(source).map((span) => span.target)).toEqual([
      'Visible',
      'Last',
    ]);
  });

  it('uses ordinary Markdown semantics for .md and literal currency beside links', () => {
    const source =
      'Cost $5. [[Budget]] and braces {like this}.\n\nimport x from "./file.js"';
    expect(
      parseSourceWikilinks(source, 'ordinary.MD').map((span) => span.target),
    ).toEqual(['Budget']);
  });

  it('ignores mapping metadata and escaped or malformed link syntax', () => {
    const source =
      '\uFEFF---\r\ntitle: "[[Metadata]]"\r\n---\r\n\\[[Escaped]] [[Good]] [[bad/../path]] [[A|]] [[A[[B]]]]';
    expect(
      parseSourceWikilinks(source, 'ordinary.md').map((span) => span.target),
    ).toEqual(['Good']);
  });

  it('reports malformed MDX without inventing backlinks, then recovers on a valid revision', () => {
    const docs = [
      note('bad.mdx', 'Bad', '<Unclosed\n[[Target]]'),
      note('target.md', 'Target'),
    ];
    const invalid = indexWorkspaceLinks(docs);
    expect(invalid.outgoing['bad.mdx']).toEqual([]);
    expect(invalid.issues['bad.mdx']).toContain('valid Markdown/MDX');
    const fixed = indexWorkspaceLinks([
      { ...docs[0]!, source: '[[Target]]' },
      docs[1]!,
    ]);
    expect(fixed.backlinks['target.md']).toHaveLength(1);
    expect(fixed.issues['bad.mdx']).toBeUndefined();
  });

  it('resolves stable IDs and qualified paths, leaves ambiguity explicit, and handles Trash', () => {
    const docs = [
      note(
        'origin.md',
        'Origin',
        '[[Note]] [[A/Note|Alias]] [[Gone]] [[Missing]]',
      ),
      note('one.md', 'Note', '', 'A'),
      note('two.md', 'Note', '', 'B'),
      note('gone.md', 'Gone', '', '', true),
    ];
    const index = indexWorkspaceLinks(docs);
    expect(
      index.outgoing['origin.md']!.map((link) => [link.status, link.targetId]),
    ).toEqual([
      ['ambiguous', undefined],
      ['resolved', 'one.md'],
      ['trashed', undefined],
      ['missing', undefined],
    ]);
    expect(index.backlinks['one.md']![0]).toMatchObject({
      sourceDocumentId: 'origin.md',
      displayText: 'Alias',
    });
    const restored = indexWorkspaceLinks(
      docs.map((doc) =>
        doc.id === 'gone.md' ? { ...doc, trashed: false } : doc,
      ),
    );
    expect(restored.backlinks['gone.md']).toHaveLength(1);
    const trashedSource = indexWorkspaceLinks(
      docs.map((doc) =>
        doc.id === 'origin.md' ? { ...doc, trashed: true } : doc,
      ),
    );
    expect(Object.keys(trashedSource.backlinks)).toEqual([]);
  });

  it('reindexes current source and metadata without changing the original strings', () => {
    const original = '\uFEFF[[Target]]\r\n';
    const docs = [
      note('origin.md', 'Origin', original),
      note('target.md', 'Target'),
    ];
    expect(indexWorkspaceLinks(docs).backlinks['target.md']).toHaveLength(1);
    const renamed = indexWorkspaceLinks([
      docs[0]!,
      { ...docs[1]!, title: 'New' },
    ]);
    expect(renamed.outgoing['origin.md']![0]!.status).toBe('missing');
    const edited = indexWorkspaceLinks([
      { ...docs[0]!, source: '[[New]]' },
      { ...docs[1]!, title: 'New' },
    ]);
    expect(edited.backlinks['target.md']).toHaveLength(1);
    expect(docs[0]!.source).toBe(original);
  });

  it('does not parse helper modules or make a duplicate note ID navigable', () => {
    const index = indexWorkspaceLinks([
      note('helper.tsx', 'Helper', 'const s = "[[Target]]"'),
      note('origin.md', 'Origin', '[[Target]]'),
      note('target.md', 'Target'),
      note('target.md', 'Target'),
    ]);
    expect(index.outgoing['helper.tsx']).toEqual([]);
    expect(index.outgoing['origin.md']![0]!.status).toBe('missing');
  });

  it('bounds dense source and fails closed for forged AST overlaps', () => {
    const index = indexWorkspaceLinks([
      note('dense.md', 'Dense', '[['.repeat(2_100)),
    ]);
    expect(index.issues['dense.md']).toContain('limited');
    const position = (from: number, to: number) => ({
      start: { offset: from },
      end: { offset: to },
    });
    expect(
      parseWikilinks('[[A]]', {
        type: 'root',
        position: position(0, 5),
        children: [
          { type: 'text', position: position(0, 5) },
          { type: 'text', position: position(1, 5) },
        ],
      }),
    ).toEqual([]);
  });

  it('never proposes a rename that creates ambiguous references', () => {
    const docs = [
      note('origin.md', 'Origin', '[[A|kept]]'),
      note('a.md', 'A'),
      note('b.md', 'B'),
    ];
    const index = indexWorkspaceLinks(docs);
    expect(
      proposeRenameReferences(docs, index.sources, 'a.md', 'B', ''),
    ).toEqual([]);
    expect(
      proposeRenameReferences(docs, index.sources, 'a.md', 'B', 'Folder'),
    ).toEqual([
      {
        sourceDocumentId: 'origin.md',
        expectedSource: '[[A|kept]]',
        patches: [{ from: 2, to: 3, expected: 'A', replacement: 'Folder/B' }],
      },
    ]);
  });
});
