import { expect, it } from 'vitest';
import {
  editableMarkdown,
  patchMarkdown,
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
