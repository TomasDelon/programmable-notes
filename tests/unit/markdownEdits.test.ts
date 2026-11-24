import { expect, it } from 'vitest';
import {
  editableMarkdown,
  markdownBlocks,
  patchMarkdown,
  visualAnalysisLimited,
} from '../../src/editor/markdownEdits';

it('limits patches to literal root paragraphs and preserves surrounding bytes', () => {
  const source =
    '*Heading*\r\n=======\r\n\r\nA plain paragraph.\r\n\r\n<div>JSX</div>\r\n\r\n*Formatted*\r\n';
  const [range] = editableMarkdown(source);
  expect(editableMarkdown(source)).toHaveLength(1);
  expect(patchMarkdown(source, range!, range!.text)).toBe(source);
  expect(patchMarkdown(source, range!, '<script>')).toBeNull();
  expect(patchMarkdown(source, range!, '1. List')).toBeNull();
  expect(patchMarkdown(source, range!, 'Updated.')).toBe(
    source.replace(range!.text, 'Updated.'),
  );
});

it('preserves ATX markers, spacing and closing markers', () => {
  const source = '##   Original title  ##\r\n\r\n### *Styled*\r\n';
  const [heading] = editableMarkdown(source);
  expect(editableMarkdown(source)).toHaveLength(1);
  expect(heading).toMatchObject({ text: 'Original title', headingDepth: 2 });
  expect(patchMarkdown(source, heading!, 'New title')).toBe(
    '##   New title  ##\r\n\r\n### *Styled*\r\n',
  );
  expect(
    patchMarkdown(
      source.replace('Original title', 'Modified title'),
      heading!,
      'Other',
    ),
  ).toBeNull();
});

it('preserves list markers and refuses complex list blocks', () => {
  const source =
    '3.   First item\r\n4. Second item\r\n\r\n- Outer\r\n  - Nested\r\n';
  const items = editableMarkdown(source);
  expect(items.map((item) => item.text)).toEqual(['First item', 'Second item']);
  expect(items[0]?.list).toMatchObject({ ordered: true, start: 3 });
  expect(patchMarkdown(source, items[0]!, 'Updated item')).toBe(
    source.replace('First item', 'Updated item'),
  );
  expect(patchMarkdown(source, items[0]!, '10. New nesting')).toBeNull();
  expect(patchMarkdown(source, items[0]!, 'First\n  - Nested')).toBeNull();
});

it('patches Setext text without touching the underline or adjacent JSX', () => {
  const source = 'Original title\r\n--------------  \r\n\r\n<Widget />\r\n';
  const [heading] = editableMarkdown(source);
  expect(heading).toMatchObject({ text: 'Original title', headingDepth: 2 });
  expect(patchMarkdown(source, heading!, 'New title')).toBe(
    source.replace('Original title', 'New title'),
  );
});

it('accepts literal punctuation and multiline CRLF text while rejecting syntax changes', () => {
  const source =
    "import X from './X'\r\n\r\nBudget: €20 (approx.); email a@b.test / 50% + tax.\r\nSecond line.\r\n\r\n<X value={{a: 1}} />\r\n";
  const [range] = editableMarkdown(source);
  expect(range?.text).toContain('Second line.');
  const replacement = 'New: £30 (50%); café / test + ok.\nAnother line.';
  expect(patchMarkdown(source, range!, replacement)).toBe(
    source.replace(range!.text, replacement.replace(/\n/g, '\r\n')),
  );
  for (const unsafe of [
    '<X />',
    '{alert(1)}',
    'First\n\nAnother paragraph',
    'First\n- List',
    '**bold**',
    '[link](file:///etc/passwd)',
    'Text\u0000bad',
  ]) {
    expect(patchMarkdown(source, range!, unsafe)).toBeNull();
  }
  expect(
    patchMarkdown(
      source + 'changed',
      { ...range!, from: range!.from + 1 },
      'Other',
    ),
  ).toBeNull();
});

it('keeps leading YAML-style metadata opaque while preserving body edit spans', () => {
  const source =
    '\uFEFF---\r\ntitle: A note\r\nsummary: "Keep exact spaces"\r\n---\r\n\r\nBody 😀 paragraph.\r\n\r\n```tsx\r\nconst x = <Widget value={{a: 1}} />\r\n```\r\n\r\n<Widget />\r\n';
  const ranges = editableMarkdown(source);
  expect(ranges.map((range) => range.text)).toEqual(['Body 😀 paragraph.']);
  expect(patchMarkdown(source, ranges[0]!, 'Updated 😀 paragraph.')).toBe(
    source.replace('Body 😀 paragraph.', 'Updated 😀 paragraph.'),
  );
});

it('preserves UTF-16 offsets across opaque Unicode metadata and alternative terminators', () => {
  const source =
    '\uFEFF---\ntitle: "😀"\nvalue: {not: MDX}\n...\n\nCafe\u0301 body.\n';
  const [body] = editableMarkdown(source);
  expect(body?.from).toBe(source.indexOf('Cafe'));
  expect(body?.text).toBe('Cafe\u0301 body.');
  expect(markdownBlocks(source)[0]).toEqual({
    from: 0,
    to: source.indexOf('...') + 4,
  });
  expect(patchMarkdown(source, body!, body!.text)).toBe(source);
  expect(patchMarkdown(source, body!, 'Updated 😀 body.')).toBe(
    source.replace('Cafe\u0301 body.', 'Updated 😀 body.'),
  );
});

it('falls back for incomplete mapping headers while allowing a plain leading rule', () => {
  const incomplete = '---\ntitle: unfinished\n\nDo not guess a body span.\n';
  expect(editableMarkdown(incomplete)).toEqual([]);
  expect(markdownBlocks(incomplete)).toEqual([
    { from: 0, to: incomplete.length },
  ]);
  expect(
    editableMarkdown('---\n\nOrdinary paragraph.\n').map((range) => range.text),
  ).toEqual(['Ordinary paragraph.']);
});

it('keeps ordinary paragraphs between leading rules editable', () => {
  const source = '---\n\nOrdinary paragraph.\n\n---\n\nBody.\n';
  expect(editableMarkdown(source).map((range) => range.text)).toEqual([
    'Ordinary paragraph.',
    'Body.',
  ]);
});

it('does not treat Unicode separators inside metadata as physical delimiter lines', () => {
  const source =
    '---\ntitle: "A\u2028---\n# Protected header content\n"\n---\n\nBody.\n';
  expect(editableMarkdown(source).map((range) => range.text)).toEqual([
    'Body.',
  ]);
  expect(markdownBlocks(source)[0]?.to).toBe(source.lastIndexOf('---') + 4);
});

it('keeps repeated mapping results independent across revisions and malformed documents', () => {
  const source = '## Heading\r\n\r\nOriginal body.\r\n\r\n<Widget />\r\n';
  const [heading, body] = editableMarkdown(source);
  const blocks = markdownBlocks(source);
  const firstBlock = { ...blocks[0]! };
  // Callers can mutate their returned presentation data, never the parser tree.
  heading!.headingDepth = 6;
  body!.text = 'Forged';
  blocks[0]!.from = 999;
  expect(markdownBlocks(source)[0]).toEqual(firstBlock);
  const fresh = editableMarkdown(source)[1]!;
  expect(fresh.text).toBe('Original body.');
  const changed = source.replace('Original body.', 'Modified body.');
  expect(changed.length).toBe(source.length);
  expect(patchMarkdown(changed, fresh, 'Replacement.')).toBeNull();
  expect(editableMarkdown('<Unclosed')).toEqual([]);
  expect(markdownBlocks('<Unclosed')).toEqual([]);
  expect(patchMarkdown(source, fresh, 'Replacement.')).toBe(
    source.replace('Original body.', 'Replacement.'),
  );
  // A rejected candidate cannot contaminate the next valid mapping/patch.
  expect(patchMarkdown(source, fresh, '<Widget />')).toBeNull();
  expect(patchMarkdown(source, fresh, 'Safe again.')).toBe(
    source.replace('Original body.', 'Safe again.'),
  );
});

it.each([
  {
    kind: 'paragraph',
    source: '\uFEFFFirst paragraph.\r\n\r\n<Keep />\r\n',
    texts: ['First paragraph.'],
    patched: '\uFEFFUpdated text\r\n\r\n<Keep />\r\n',
  },
  {
    kind: 'ATX heading',
    source: '\uFEFF##   Heading  ##\r\n\r\n<Keep />\r\n',
    texts: ['Heading'],
    patched: '\uFEFF##   Updated text  ##\r\n\r\n<Keep />\r\n',
  },
  {
    kind: 'Setext heading',
    source: '\uFEFFTitle\r\n=====  \r\n\r\n<Keep />\r\n',
    texts: ['Title'],
    patched: '\uFEFFUpdated text\r\n=====  \r\n\r\n<Keep />\r\n',
  },
  {
    kind: 'list',
    source: '\uFEFF3.   One\r\n4. Two\r\n\r\n<Outer><Nested /></Outer>\r\n',
    texts: ['One', 'Two'],
    patched:
      '\uFEFF3.   Updated text\r\n4. Two\r\n\r\n<Outer><Nested /></Outer>\r\n',
  },
  {
    kind: 'import first',
    source:
      '\uFEFFimport React from "react"\r\n\r\nLiteral paragraph.\r\n\r\n{/* Preserve comment */}\r\n\r\n<React.Fragment><span>Opaque</span></React.Fragment>\r\n',
    texts: ['Literal paragraph.'],
    patched:
      '\uFEFFimport React from "react"\r\n\r\nUpdated text\r\n\r\n{/* Preserve comment */}\r\n\r\n<React.Fragment><span>Opaque</span></React.Fragment>\r\n',
  },
  {
    kind: 'JSX first',
    source: '\uFEFF<Outer><Nested /></Outer>\n\nLiteral paragraph.\n',
    texts: ['Literal paragraph.'],
    patched: '\uFEFF<Outer><Nested /></Outer>\n\nUpdated text\n',
  },
])(
  'maps leading-BOM $kind using original offsets without changing opaque source',
  ({ source, texts, patched }) => {
    const ranges = editableMarkdown(source);
    expect(ranges.map((r) => r.text)).toEqual(texts);
    expect(markdownBlocks(source)[0]?.from).toBe(1);
    expect(patchMarkdown(source, ranges[0]!, 'Updated text')).toBe(patched);
    expect(
      patchMarkdown(
        source,
        { ...ranges[0]!, from: ranges[0]!.from - 1 },
        'Bad offset',
      ),
    ).toBeNull();
  },
);

it.each([
  'First line\nSecond line\r\nThird line',
  'First line\nSecond line\nThird line',
])(
  'keeps each internal physical break when a visual word changes: %j',
  (paragraph) => {
    const source =
      '\uFEFF# Heading\r\n\r\n' + paragraph + '\n\n<div>Opaque 😀</div>\r\n';
    const range = editableMarkdown(source).find((node) =>
      node.text.startsWith('First line'),
    )!;
    const canonical = paragraph.replace(/\r\n/g, '\n');
    expect(
      patchMarkdown(source, range, canonical.replace('First', 'Edited')),
    ).toBe(source.replace('First', 'Edited'));
    expect(patchMarkdown(source, range, canonical)).toBe(source);
  },
);

it('preserves unchanged mixed breaks around unambiguous insertions and removals', () => {
  const paragraph = 'First line\nSecond line\r\nThird line';
  const source = '# Heading\r\n\r\n' + paragraph + '\n\n<Keep />\r\n';
  const range = editableMarkdown(source).find((node) =>
    node.text.startsWith('First line'),
  )!;
  const canonical = paragraph.replace(/\r\n/g, '\n');
  expect(
    patchMarkdown(source, range, canonical.replace('First', 'First\nInserted')),
  ).toBe(source.replace('First', 'First\nInserted'));
  expect(
    patchMarkdown(
      source,
      range,
      canonical.replace('Second', 'Second\nInserted'),
    ),
  ).toBe(source.replace('Second', 'Second\r\nInserted'));
  expect(
    patchMarkdown(
      source,
      range,
      canonical.replace('line\nSecond', 'line Second'),
    ),
  ).toBe(source.replace('line\nSecond', 'line Second'));
});

it('rejects ambiguous mixed-break rewrites while keeping source and mappings intact', () => {
  const source = 'First line\nSecond line\r\nThird line\n\n<Keep />\r\n';
  const range = editableMarkdown(source)[0]!;
  expect(
    patchMarkdown(source, range, 'Different first\nDifferent last'),
  ).toBeNull();
  expect(patchMarkdown(source, range, range.text.replace(/\r\n/g, '\n'))).toBe(
    source,
  );
  expect(
    patchMarkdown(source, range, range.text.replace('Second', 'Safe second')),
  ).toBe(source.replace('Second', 'Safe second'));
});

it('refuses mixed-break deletions and insertions whose repeated text has different valid alignments', () => {
  const source = 'Same\nSame\r\nSame\n\n<Keep />\r\n';
  const range = editableMarkdown(source)[0]!;
  expect(patchMarkdown(source, range, 'Same\nSame')).toBeNull();
  expect(patchMarkdown(source, range, 'Same\nSame\nSame\nSame')).toBeNull();
  expect(patchMarkdown(source, range, 'Same\nSame\nSame')).toBe(source);
});

it('patches only literal single-line blockquote text while preserving markers and surrounding MDX', () => {
  for (const marker of ['> ', '  >  ', '>\t', '>']) {
    const source =
      '\uFEFFimport React from "react"\r\n\r\n' +
      marker +
      'Quoted café 😀.\r\n\r\n{/* keep exact */}\r\n\r\n<div><em>Opaque</em></div>\r\n';
    const ranges = editableMarkdown(source);
    expect(ranges).toHaveLength(1);
    const range = ranges[0]!;
    expect(range.text).toBe('Quoted café 😀.');
    expect(range.from).toBe(source.indexOf('Quoted'));
    expect(patchMarkdown(source, range, range.text)).toBe(source);
    expect(patchMarkdown(source, range, 'Changed: £50 + tax.')).toBe(
      source.replace('Quoted café 😀.', 'Changed: £50 + tax.'),
    );
    expect(
      patchMarkdown(
        source,
        { ...range, quoteFrom: undefined },
        'Forged context',
      ),
    ).toBeNull();
    expect(
      patchMarkdown(source.replace('Quoted', 'Altered'), range, 'Stale'),
    ).toBeNull();
    for (const unsafe of [
      '# Heading',
      '- List',
      '> Nested',
      '<Widget />',
      '{run()}',
      '*Formatting*',
      'First\nLazy continuation',
      'First\n> Explicit continuation',
    ]) {
      expect(patchMarkdown(source, range, unsafe)).toBeNull();
    }
  }
});

it('keeps lazy, separated, nested, formatted and JSX blockquotes opaque', () => {
  for (const quote of [
    '> First.\n> Second.\nLazy continuation.',
    '> First.\nLazy continuation.',
    '> First.\rLazy continuation.',
    '> First.\r> Second.',
    '> First\n>\n> Second',
    '> > Nested',
    '> # Heading',
    '> - List',
    '> *Formatted*',
    '> <Widget />',
    '> {run()}',
    '> Escaped \\*text\\*',
    '> &#65; literal',
  ]) {
    const source = quote + '\n\nSeparate paragraph.\n';
    expect(editableMarkdown(source).map((range) => range.text)).toEqual([
      'Separate paragraph.',
    ]);
  }
});

it('edits explicit multiline quotes without changing prefixes, mixed endings or surrounding MDX', () => {
  for (const endings of [
    ['\n', '\n'],
    ['\r\n', '\r\n'],
    ['\r\n', '\n'],
  ]) {
    const logical = `First café 😀.${endings[0]}Second line.${endings[1]}Third line.`;
    const source =
      '\uFEFFimport React from "react"\r\n\r\n  >  First café 😀.' +
      endings[0] +
      ' >\tSecond line.' +
      endings[1] +
      '> Third line.\r\n\r\n{/* keep exact */}\r\n\r\n<div><span>Opaque JSX</span></div>\r\n';
    const ranges = editableMarkdown(source);
    expect(ranges).toHaveLength(1);
    const range = ranges[0]!;
    expect(range.text).toBe(logical);
    expect(range).toHaveProperty('quotePrefixes', [' >\t', '> ']);
    expect(patchMarkdown(source, range, logical.replace(/\r\n/g, '\n'))).toBe(
      source,
    );
    expect(
      patchMarkdown(
        source,
        range,
        logical
          .replace(/\r\n/g, '\n')
          .replace('Second line.', 'Changed: £50 + tax.'),
      ),
    ).toBe(source.replace('Second line.', 'Changed: £50 + tax.'));
    const forged = { ...range, quotePrefixes: ['> ', '> '] };
    expect(
      patchMarkdown(source, forged, logical.replace('Second', 'Changed')),
    ).toBeNull();
    expect(
      patchMarkdown(
        source.replace('Second', 'Stale'),
        range,
        logical.replace('Second', 'Changed'),
      ),
    ).toBeNull();
    for (const unsafe of [
      'One line.',
      'One\nTwo',
      'One\nTwo\nThree\nFour',
      'First\n<Widget />\nThird',
      'First\n{run()}\nThird',
      'First\n*Formatting*\nThird',
      '# Heading\nSecond\nThird',
      'First\n> Nested\nThird',
      'First\n\nThird',
    ]) {
      expect(patchMarkdown(source, range, unsafe)).toBeNull();
    }
  }
});

it('keeps over-budget visual syntax opaque without discarding original source or accepting patches', () => {
  const source =
    '\uFEFF# Retain title\r\n\r\n' +
    '['.repeat(2049) +
    'x' +
    ']'.repeat(2049) +
    '\r\n';
  expect(editableMarkdown(source)).toEqual([]);
  expect(markdownBlocks(source)).toEqual([{ from: 0, to: source.length }]);
  expect(
    patchMarkdown(
      source,
      {
        from: source.indexOf('Retain title'),
        to: source.indexOf('Retain title') + 'Retain title'.length,
        text: 'Retain title',
        headingDepth: 1,
      },
      'Replacement',
    ),
  ).toBeNull();
});

it('retains supported literal mapping at the visual syntax budget and refuses candidate growth beyond it', () => {
  const source = '['.repeat(2048) + 'x' + ']'.repeat(2048);
  const ranges = editableMarkdown(source);
  expect(ranges).toHaveLength(1);
  expect(ranges[0]?.text).toBe(source);
  expect(patchMarkdown(source, ranges[0]!, source)).toBe(source);
  expect(patchMarkdown(source, ranges[0]!, source + ']')).toBeNull();
});

it('keeps quote-only density and over-size documents as exact whole-source fallbacks', () => {
  for (const source of [
    '# Keep heading\r\n\r\n' + '>'.repeat(4097) + ' quote.\r\n',
    '# Keep heading\r\n\r\n' + 'x'.repeat(500_000),
  ]) {
    expect(editableMarkdown(source)).toEqual([]);
    expect(markdownBlocks(source)).toEqual([{ from: 0, to: source.length }]);
  }
});

it('keeps excessive horizontal whitespace on the Source-only path before synchronous parsing', () => {
  expect(visualAnalysisLimited('a' + ' '.repeat(8192) + 'b')).toBe(false);
  expect(visualAnalysisLimited('a' + ' '.repeat(8193) + 'b')).toBe(true);
  const source = 'a' + ' '.repeat(20_000) + 'b';
  expect(editableMarkdown(source)).toEqual([]);
  expect(markdownBlocks(source)).toEqual([{ from: 0, to: source.length }]);
});
