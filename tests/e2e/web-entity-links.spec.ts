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
    const target = '# Other\n\nA separate note.\n';
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
        buffer: Buffer.from(target),
      },
    ]);

    const title = page.getByRole('heading', {
      name: 'Document title',
      exact: true,
    });
    await expect(title).toHaveText('Alpha');
    await command(page, 'Preview document');
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
    await expect(wikilink).toBeVisible();
    await expectExport(page, edited);
  });
}
