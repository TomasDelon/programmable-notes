/** Host-only execution policy; isolated editable islands own their own compiler. */
export function shouldCompileWholeDocument(
  reactEnabled: boolean,
  mode: 'source' | 'preview',
  fullDocument: boolean,
) {
  return reactEnabled && (mode === 'source' || fullDocument);
}
