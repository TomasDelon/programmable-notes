import { expect, type Locator, type Page } from '@playwright/test';

export const documentEditor = (page: Page) =>
  page.locator('.rendered-editor .ProseMirror');

export function sourceForMath(page: Page, raw: string) {
  return documentEditor(page)
    .locator('.rendered-math-source')
    .filter({ hasText: raw });
}

export async function openMath(page: Page, raw: string) {
  const source = sourceForMath(page, raw);
  const host = source.locator('..');
  const rendered = host.locator('.rendered-math-render');
  if (await rendered.isVisible()) await rendered.locator('.katex-html').click();
  else await source.click();
  await expect(source).toBeVisible();
  await expect(documentEditor(page)).toBeFocused();
  return source;
}

// Only browser-native selection is used; no editor internals authorize edits.
export async function selectDocumentText(text: Locator, from = 0, to?: number) {
  await text.evaluate(
    (element, positions) => {
      (element.closest('.ProseMirror') as HTMLElement).focus();
      const walker = document.createTreeWalker(element, NodeFilter.SHOW_TEXT);
      const nodes: Text[] = [];
      while (walker.nextNode()) nodes.push(walker.currentNode as Text);
      const length = nodes.reduce((sum, node) => sum + node.data.length, 0);
      const locate = (position: number): [Node, number] => {
        let offset = Math.max(0, Math.min(position, length));
        for (const node of nodes) {
          if (offset <= node.data.length) return [node, offset];
          offset -= node.data.length;
        }
        return [element, element.childNodes.length];
      };
      const range = document.createRange();
      range.setStart(...locate(positions.from));
      range.setEnd(...locate(positions.to ?? length));
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    },
    { from, to },
  );
}

export async function replaceDocumentText(
  page: Page,
  text: Locator,
  value: string,
) {
  await selectDocumentText(text);
  await page.keyboard.insertText(value);
}
