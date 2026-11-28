/** Input is Vite's normalized absolute project root, never a request URL. */
export function privateDevCacheDeny(root: string): string[] {
  const literalRoot = Array.from(root.replace(/\/$/, ''), (character) =>
    '*?[]{}()!+@\\'.includes(character) ? `\\${character}` : character,
  ).join('');
  const cache = `${literalRoot}/.cache`;
  return [
    // Vite checks the clean path AND query-bearing raw-import ID. Its matcher is
    // case-insensitive: reserve these two root asset basenames in every case.
    `${cache}/!(runtime.js|web-fonts.txt|runtime.js\\?*|web-fonts.txt\\?*)`,
    `${cache}/*/**`,
    // A nested project cache never inherits the two root compiler exceptions.
    `${literalRoot}/*/**/.cache/**`,
  ];
}
