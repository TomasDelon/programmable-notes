/** Classify extensions only. Paths and import identities must retain exact case. */
export function isMdxSource(path: string): boolean {
  return /\.mdx?$/i.test(path);
}
export function isSupportedSource(path: string): boolean {
  return /\.(?:mdx?|tsx?|jsx?)$/i.test(path);
}
export function javascriptLoader(path: string): 'tsx' | 'ts' | 'jsx' {
  const extension = path.slice(path.lastIndexOf('.') + 1).toLowerCase();
  return extension === 'tsx' ? 'tsx' : extension === 'ts' ? 'ts' : 'jsx';
}
