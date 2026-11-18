import { expect, it } from 'vitest';
import { paragraphs, patchParagraph } from '../../src/editor/paragraphs';

it('limits patches to literal root paragraphs and preserves surrounding bytes', () => {
  const source =
    '# Heading\r\n\r\nA plain paragraph.\r\n\r\n<div>JSX</div>\r\n\r\n*Formatted*\r\n';
  const [range] = paragraphs(source);
  expect(paragraphs(source)).toHaveLength(1);
  expect(patchParagraph(source, range!, range!.text)).toBe(source);
  expect(patchParagraph(source, range!, '<script>')).toBeNull();
  expect(patchParagraph(source, range!, '1. List')).toBeNull();
  expect(patchParagraph(source, range!, 'Updated.')).toBe(
    source.replace(range!.text, 'Updated.'),
  );
});
