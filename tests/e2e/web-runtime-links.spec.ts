import { expect, test, type Page } from '@playwright/test';
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';

test.describe.configure({ timeout: 60_000 });

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByLabel('Search commands and notes').fill(name);
  await dialog
    .getByRole('button', { name: new RegExp('^' + name) })
    .first()
    .click();
}

async function connections(page: Page) {
  const open = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  const panel = page.getByRole('complementary', {
    name: 'Workspace navigation',
  });
  await panel.getByRole('button', { name: 'Connections', exact: true }).click();
  return panel.locator('.web-connections');
}

test('real wikilinks navigate, derive backlinks, and survive an atomic note rename', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
  await page.getByLabel('Import note files').setInputFiles([
    {
      name: 'Alpha.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        '# Alpha\n\n[[Beta|Open beta]] [[Missing]]\n\n`[[Code]]` $[[Math]]$',
      ),
    },
    {
      name: 'Beta.md',
      mimeType: 'text/plain',
      buffer: Buffer.from('# Beta\n\nDestination note.'),
    },
  ]);
  const panel = await connections(page);
  const outgoing = panel.getByRole('region', { name: 'Outgoing links' });
  await expect(outgoing.getByRole('button')).toHaveCount(2);
  await expect(
    outgoing.getByRole('button', { name: /Missing/ }),
  ).toBeDisabled();
  await outgoing
    .getByRole('button', { name: 'Open beta', exact: true })
    .click();
  await expect(
    page.getByRole('textbox', { name: 'Document title', exact: true }),
  ).toHaveValue('Beta');
  const backlinks = panel.getByRole('region', { name: 'Backlinks' });
  await expect(backlinks.getByRole('button', { name: /^Alpha/ })).toBeVisible();
  await command(page, 'Edit source');
  const title = page.getByRole('textbox', {
    name: 'Document title',
    exact: true,
  });
  await title.fill('Gamma');
  await title.press('Enter');
  await expect(title).toHaveValue('Gamma');
  await backlinks.getByRole('button', { name: /^Alpha/ }).click();
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    '[[Gamma|Open beta]]',
  );
  await expect(
    outgoing.getByRole('button', { name: 'Open beta', exact: true }),
  ).toHaveAttribute('title', 'Open Gamma');
  await outgoing
    .getByRole('button', { name: 'Open beta', exact: true })
    .click();
  await expect(title).toHaveValue('Gamma');
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  await expect(
    page.getByRole('textbox', { name: 'Document title', exact: true }),
  ).toHaveValue('Gamma');
  const reopened = await connections(page);
  await expect(
    reopened
      .getByRole('region', { name: 'Backlinks' })
      .getByRole('button', { name: /^Alpha/ }),
  ).toBeVisible();
});

test('validated original image bytes render in editable Preview and remain scoped to one note', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Picture.md',
    mimeType: 'text/plain',
    buffer: Buffer.from('# Picture\n\nAn attached image follows.'),
  });
  const base64 = await page.evaluate(() => {
    const canvas = document.createElement('canvas');
    canvas.width = 3;
    canvas.height = 2;
    const context = canvas.getContext('2d')!;
    context.fillStyle = 'rgb(40,160,80)';
    context.fillRect(0, 0, 3, 2);
    return canvas.toDataURL('image/png').split(',')[1]!;
  });
  const bytes = Buffer.from(base64, 'base64');
  const id = 'sha256:' + createHash('sha256').update(bytes).digest('hex');
  await page
    .getByLabel('Import attachments')
    .setInputFiles({ name: 'pixel.png', mimeType: 'image/png', buffer: bytes });
  await page.getByRole('button', { name: 'Open right panel' }).click();
  const gallery = page.getByRole('region', { name: 'Note attachments' });
  await expect(gallery.getByRole('img', { name: 'pixel.png' })).toBeVisible();
  await command(page, 'Preview document');
  const rendered = page.locator('.rendered-editor .ProseMirror');
  const image = rendered.getByRole('img', { name: 'pixel.png' });
  await expect(image).toBeVisible({ timeout: 20_000 });
  await expect
    .poll(() =>
      image.evaluate((element) => {
        const target = document.createElement('canvas');
        target.width = 3;
        target.height = 2;
        const context = target.getContext('2d')!;
        context.drawImage(element as HTMLImageElement, 0, 0);
        return [...context.getImageData(0, 0, 1, 1).data];
      }),
    )
    .toEqual([40, 160, 80, 255]);
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  const exported = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await exported).path())!, 'utf8')).toContain(
    `attachment:${id}`,
  );
  const download = page.waitForEvent('download');
  await gallery
    .getByRole('button', { name: 'Download pixel.png', exact: true })
    .click();
  expect(readFileSync((await (await download).path())!)).toEqual(bytes);
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  await expect(rendered.getByRole('img', { name: 'pixel.png' })).toBeVisible({
    timeout: 20_000,
  });
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Unrelated.md',
    mimeType: 'text/plain',
    buffer: Buffer.from('# Unrelated\n\nNo attachments in this note.'),
  });
  await expect(
    rendered.getByRole('heading', { name: 'Unrelated', exact: true }),
  ).toBeVisible({ timeout: 20_000 });
  await expect(rendered.getByRole('img')).toHaveCount(0);
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
});
