import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const png = Buffer.from(
  'iVBORw0KGgoAAAANSUhEUgAAAAQAAAADCAIAAAA7ljmRAAAAFElEQVR4nGMUT17DAANMDEgAhQMAKoUBLAfJLFcAAAAASUVORK5CYII=',
  'base64',
);
const pdf = Buffer.from(
  '%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF\n',
);
async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 15_000 },
  );
}
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
async function snapshot(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        source: string;
        selected: string;
        assets: Record<string, { base64: string }>;
      }>((resolve, reject) => {
        const request = indexedDB.open('programmable-notes-web-v1');
        request.onerror = () => reject(request.error);
        request.onsuccess = () => {
          const database = request.result;
          const read = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            database.close();
            const state = read.result.state;
            resolve({
              source: state.workspace.files[state.workspace.selected],
              selected: state.workspace.selected,
              assets: state.assets ?? {},
            });
          };
        };
      }),
  );
}

test('decoded original assets survive reload, Trash and complete checksummed backup restore', async ({
  page,
}) => {
  await page.goto('/');
  await saved(page);
  const original = '\uFEFF# Assets\r\nExact source survives.\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Assets.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect.poll(async () => (await snapshot(page)).source).toBe(original);
  await page.getByLabel('Import attachments', { exact: true }).setInputFiles([
    { name: 'chart.png', mimeType: 'image/png', buffer: png },
    { name: 'paper.pdf', mimeType: 'application/pdf', buffer: pdf },
  ]);
  await page.getByRole('button', { name: 'Open right panel' }).click();
  const gallery = page.getByRole('region', { name: 'Note attachments' });
  await gallery.scrollIntoViewIfNeeded();
  await expect(gallery.getByAltText('chart.png')).toBeVisible();
  await expect
    .poll(() =>
      gallery
        .getByAltText('chart.png')
        .evaluate((element) => (element as HTMLImageElement).naturalWidth),
    )
    .toBe(4);
  await saved(page);
  const withAssets = await snapshot(page);
  expect(Object.keys(withAssets.assets)).toHaveLength(2);
  expect(withAssets.source.startsWith(original)).toBe(true);
  expect(withAssets.source).toContain('attachment:sha256:');
  const download = page.waitForEvent('download');
  await gallery
    .getByRole('button', { name: 'Download paper.pdf', exact: true })
    .click();
  expect(readFileSync((await (await download).path())!)).toEqual(pdf);
  await page.reload();
  await saved(page);
  expect(await snapshot(page)).toEqual(withAssets);
  await page.getByRole('button', { name: 'Open right panel' }).click();
  await page
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Document actions', exact: true })
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Move to Trash', exact: true })
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await saved(page);
  expect((await snapshot(page)).assets).toEqual(withAssets.assets);
  await command(page, 'Open Trash');
  const settings = page.getByRole('dialog', { name: 'Settings', exact: true });
  await settings
    .locator('.web-list-row')
    .filter({ hasText: 'Assets' })
    .getByRole('button', { name: 'Restore', exact: true })
    .click();
  await settings
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click();
  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open Assets', exact: true })
    .click();
  await saved(page);
  expect((await snapshot(page)).source).toBe(withAssets.source);
  const exported = page.waitForEvent('download');
  await command(page, 'Export workspace backup');
  const backup = readFileSync((await (await exported).path())!);
  const envelope = JSON.parse(backup.toString('utf8'));
  expect(envelope.version).toBe(2);
  expect(envelope.checksum).toMatch(/^[a-f0-9]{64}$/);
  expect(envelope.recovery.length).toBeGreaterThan(0);
  expect(
    Object.values(envelope.assets).map(
      (asset) => (asset as { base64: string }).base64,
    ),
  ).toEqual(
    expect.arrayContaining([png.toString('base64'), pdf.toString('base64')]),
  );
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).fill('Later edit');
  await expect
    .poll(async () => (await snapshot(page)).source)
    .toBe('Later edit');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Choose workspace backup').setInputFiles({
    name: 'complete.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect
    .poll(async () => (await snapshot(page)).source)
    .toBe(withAssets.source);
  await page.reload();
  await saved(page);
  expect(await snapshot(page)).toEqual(withAssets);
});

test('malformed attachment batch and tampered backup never partially replace the workspace', async ({
  page,
}) => {
  await page.goto('/');
  await saved(page);
  const before = await snapshot(page);
  await page.getByLabel('Import attachments', { exact: true }).setInputFiles([
    { name: 'good.png', mimeType: 'image/png', buffer: png },
    {
      name: 'bad.svg',
      mimeType: 'image/svg+xml',
      buffer: Buffer.from('<svg onload="alert(1)"/>'),
    },
  ]);
  await expect(page.locator('.web-storage-banner')).toContainText(
    /Unsupported|permitted/i,
  );
  expect(await snapshot(page)).toEqual(before);
  const exported = page.waitForEvent('download');
  await command(page, 'Export workspace backup');
  const envelope = JSON.parse(
    readFileSync((await (await exported).path())!, 'utf8'),
  );
  envelope.state.workspace.files[envelope.state.workspace.selected] =
    'Tampered backup content';
  await page.getByLabel('Choose workspace backup').setInputFiles({
    name: 'tampered.json',
    mimeType: 'application/json',
    buffer: Buffer.from(JSON.stringify(envelope)),
  });
  await expect(page.locator('.web-storage-banner')).toContainText(
    'integrity check',
  );
  expect(await snapshot(page)).toEqual(before);
});
