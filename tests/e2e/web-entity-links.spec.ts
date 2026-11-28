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

async function expectExport(page: Page, expected: string) {
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(expected),
  );
}

async function connections(page: Page) {
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
  return sidebar.locator('.web-connections');
}

function documentTitle(page: Page) {
  return page.getByRole('heading', { name: 'Document title', exact: true });
}

async function openAlpha(page: Page, original: string) {
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
      buffer: Buffer.from('# Other\n\nA separate note.\n'),
    },
  ]);
  await expect(documentTitle(page)).toHaveText('Alpha');
  await command(page, 'Preview document');
}

async function checkHistoryAndReload(
  page: Page,
  original: string,
  edited: string,
) {
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
  await expect(documentTitle(page)).toHaveText('Alpha');
}

for (const [kind, conjunction] of [
  ['entity', '&amp;'],
  ['plain text', 'and'],
] as const) {
  test(`typing beside ${kind} preserves the wikilink, exact source and backlinks`, async ({
    page,
  }) => {
    const original =
      '\uFEFF# Alpha\r\n\r\n' +
      `Café ${conjunction} tea. See [[Other]].\r\n\r\n` +
      'The price is $5 today.\n\n' +
      '{/* Keep this spacing.  */}\r\n\r\n' +
      '<section data-keep="original"><span>Opaque JSX</span></section>\r\n';
    const edited = original.replace('Café', 'Café!');
    await openAlpha(page, original);
    const title = documentTitle(page);
    const panel = await connections(page);
    const outgoing = panel
      .getByRole('region', { name: 'Outgoing links' })
      .getByRole('button', { name: 'Other', exact: true });
    await expect(outgoing).toBeEnabled();
    const view = documentEditor(page);
    const paragraph = view.locator('p').filter({ hasText: /^Café/ });
    await selectDocumentText(paragraph, 'Café'.length, 'Café'.length);
    await page.keyboard.type('!');
    await expect(paragraph).toContainText(
      kind === 'entity' ? 'Café! & tea. See' : 'Café! and tea. See',
    );
    await expectExport(page, edited);
    const wikilink = paragraph.getByRole('button', {
      name: 'Other',
      exact: true,
    });
    await expect(wikilink).toBeVisible();
    await expect(outgoing).toBeEnabled();
    await wikilink.click();
    await expect(title).toHaveText('Other');
    const backlink = panel
      .getByRole('region', { name: 'Backlinks' })
      .getByRole('button', { name: /^Alpha/ });
    await expect(backlink).toBeEnabled();
    await backlink.click();
    await expect(title).toHaveText('Alpha');

    await checkHistoryAndReload(page, original, edited);
    await expect(wikilink).toBeVisible();
    await expectExport(page, edited);
  });
}

for (const [position, beforeCaret, survivingEntity] of [
  ['first', 'Café a', '&amp;'],
  ['second', 'Café a&', '&#38;'],
] as const) {
  test(`deleting the ${position} identical ampersand preserves the other entity's source spelling`, async ({
    page,
  }) => {
    const original =
      '\uFEFF# Alpha\r\n\r\nCafé a&#38;&amp; [[Other]].\r\n\r\n{/* Keep  spacing. */}\n';
    const edited = original.replace('&#38;&amp;', survivingEntity);
    await openAlpha(page, original);
    const paragraph = documentEditor(page)
      .locator('p')
      .filter({ hasText: /^Café/ });
    await expect(paragraph).toHaveText('Café a&& Other.');
    await selectDocumentText(paragraph, beforeCaret.length, beforeCaret.length);
    await page.keyboard.press('Delete');
    await expect(paragraph).toHaveText('Café a& Other.');
    await expectExport(page, edited);

    await checkHistoryAndReload(page, original, edited);
    await expectExport(page, edited);
    const link = paragraph.getByRole('button', { name: 'Other', exact: true });
    await link.click();
    await expect(documentTitle(page)).toHaveText('Other');
    const panel = await connections(page);
    await expect(
      panel
        .getByRole('region', { name: 'Backlinks' })
        .getByRole('button', { name: /^Alpha/ }),
    ).toBeEnabled();
  });
}
