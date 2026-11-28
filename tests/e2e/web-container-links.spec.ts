import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { documentEditor, selectDocumentText } from './helpers/math-text';

async function command(page: Page, label: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(label);
  await palette.getByRole('button', { name: new RegExp('^' + label) }).click();
}

async function expectExport(page: Page, source: string) {
  const pending = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await pending).path())!)).toEqual(
    Buffer.from(source),
  );
}

for (const [name, firstPrefix, continuation, selector] of [
  ['blockquote', '> ', '> ', 'blockquote p'],
  ['list item', '- ', '  ', 'li p'],
  ['list item inside a blockquote', '> - ', '>   ', 'blockquote li p'],
] as const) {
  test(`editing the continuation of a ${name} preserves its wikilink and source prefixes`, async ({
    page,
  }) => {
    const original =
      '\uFEFF# Alpha\r\n\r\n' +
      firstPrefix +
      'Notes &amp; measurements\r\n' +
      continuation +
      'Read Café results beside [[Other]].\n\n' +
      'The spare sample costs $5.\r\n\r\n' +
      '{/* Keep this spacing.  */}\n\n' +
      '<section data-keep="original"><span>Unrelated JSX</span></section>\r\n';
    const edited = original.replace('Café results', 'Café! results');
    await page.goto('/');
    await page.getByLabel('Import note files').setInputFiles([
      {
        name: 'Alpha.mdx',
        mimeType: 'text/plain',
        buffer: Buffer.from(original),
      },
      {
        name: 'Other.mdx',
        mimeType: 'text/plain',
        buffer: Buffer.from('# Other\n\nThe target note.\n'),
      },
    ]);
    const title = page.getByRole('heading', {
      name: 'Document title',
      exact: true,
    });
    await expect(title).toHaveText('Alpha');
    await command(page, 'Preview document');
    const paragraph = documentEditor(page)
      .locator(selector)
      .filter({ hasText: 'Notes & measurements' });
    await expect(paragraph).toContainText('Read Café results');
    const visible = (await paragraph.textContent())!;
    const caret = visible.indexOf('Read Café') + 'Read Café'.length;
    await selectDocumentText(paragraph, caret, caret);
    await page.keyboard.type('!');
    await expect(paragraph).toContainText('Read Café! results');
    await expectExport(page, edited);

    const open = page.getByRole('button', {
      name: 'Open navigation',
      exact: true,
    });
    if (await open.isVisible()) await open.click();
    const sidebar = page.getByRole('complementary', {
      name: 'Workspace navigation',
    });
    await sidebar
      .getByRole('button', { name: 'Connections', exact: true })
      .click();
    const outgoing = sidebar.getByRole('region', { name: 'Outgoing links' });
    await expect(
      outgoing.getByRole('button', { name: 'Other', exact: true }),
    ).toBeEnabled();
    const link = paragraph.getByRole('button', { name: 'Other', exact: true });
    await link.click();
    await expect(title).toHaveText('Other');
    const backlinks = sidebar.getByRole('region', { name: 'Backlinks' });
    await backlinks.getByRole('button', { name: /^Alpha/ }).click();
    await expect(title).toHaveText('Alpha');

    await command(page, 'Edit source');
    const source = page.getByRole('textbox', { name: 'MDX source' });
    await source.press('Control+z');
    await expectExport(page, original);
    await source.press('Control+Shift+Z');
    await expectExport(page, edited);
    await command(page, 'Preview document');
    await expect(page.locator('.web-shell')).toHaveAttribute(
      'data-save-status',
      'saved',
    );
    await page.reload();
    await expect(title).toHaveText('Alpha');
    await expect(link).toBeVisible();
    await expectExport(page, edited);
  });
}
