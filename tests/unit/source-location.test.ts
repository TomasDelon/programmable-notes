import { expect, it } from 'vitest';
import { sourceLineOffset } from '../../src/compiler/sourceLocation';

it('maps physical source lines to UTF-16 offsets without rewriting mixed bytes', () => {
  const source = '\uFEFF😀 first\r\nSecond\nThird\rFourth';
  expect(sourceLineOffset(source, 1)).toBe(0);
  for (const [line, text] of [
    [2, 'Second'],
    [3, 'Third'],
    [4, 'Fourth'],
  ] as const)
    expect(sourceLineOffset(source, line)).toBe(source.indexOf(text));
  for (const line of [0, -1, 1.5, NaN, Infinity, 5])
    expect(sourceLineOffset(source, line)).toBeNull();
  expect(sourceLineOffset('', 1)).toBe(0);
  expect(sourceLineOffset('End\r\n', 2)).toBe(5);
});

it('uses JavaScript Unicode line terminators only for original JS/TS locations', () => {
  const source = 'const first=1;\u2028const second=2;\u2029const bad=;';
  expect(sourceLineOffset(source, 2)).toBeNull();
  expect(sourceLineOffset(source, 2, true)).toBe(
    source.indexOf('const second'),
  );
  expect(sourceLineOffset(source, 3, true)).toBe(source.indexOf('const bad'));
});
