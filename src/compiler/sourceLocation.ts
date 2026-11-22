/** Original-source physical lines, independent of the editor's line separator. */
export function sourceLineOffset(
  source: string,
  line: number,
  javascript = false,
): number | null {
  if (!Number.isSafeInteger(line) || line < 1) return null;
  if (line === 1) return 0;
  let current = 1;
  for (const match of source.matchAll(
    javascript ? /\r\n|[\r\n\u2028\u2029]/g : /\r\n|\r|\n/g,
  ))
    if (++current === line) return match.index + match[0].length;
  return null;
}
