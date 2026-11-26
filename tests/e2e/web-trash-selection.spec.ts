import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { documentEditor } from './helpers/math-text';

const measurement = '\uFEFF# Measurement notebook\r\n\r\nCafé, 12 μm.\r\n';
const moduleSource = 'export const unused = 12;\r\n';

function title(page: Page) {
  return page.getByRole('heading', { name: 'Document title', exact: true });
}

async function command(page: Page, label: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(label);
  await palette.getByRole('button', { name: new RegExp('^' + label) }).click();
}

async function exportSource(page: Page) {
  const downloading = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await downloading).path())!);
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

async function openFromSidebar(page: Page, name: string) {
  const open = page.getByRole('button', {
    name: 'Open navigation',
    exact: true,
  });
  if (await open.isVisible()) await open.click();
  await page
    .locator('.left-folder-list')
    .getByRole('button', { name: 'Open ' + name, exact: true })
    .click();
  await expect(title(page)).toHaveText(name);
}

async function openInspector(page: Page) {
  const open = page.getByRole('button', {
    name: 'Open right panel',
    exact: true,
  });
  if (await open.isVisible()) await open.click();
}

async function trashCurrent(page: Page) {
  await openInspector(page);
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
  await expect(title(page)).toHaveText('Welcome');
  await saved(page);
}

for (const otherTab of [false, true]) {
  const where = otherTab ? 'in another tab' : 'in this tab';
  test(`trashing the selected module ${where} executes and exports the visible fallback note`, async ({
    page,
    context,
  }) => {
    test.setTimeout(60_000);
    await page.goto('/');
    await expect(title(page)).toHaveText('Welcome');
    const welcome = await exportSource(page);
    expect(welcome.toString('utf8')).toContain('## Start here');
    await page.getByLabel('Import note files').setInputFiles([
      {
        name: 'Measurement.mdx',
        mimeType: 'text/plain',
        buffer: Buffer.from(measurement),
      },
      {
        name: 'unused.ts',
        mimeType: 'text/plain',
        buffer: Buffer.from(moduleSource),
      },
    ]);
    await expect(title(page)).toHaveText('Measurement');
    expect(await exportSource(page)).toEqual(Buffer.from(measurement));
    await openFromSidebar(page, 'unused');
    expect(await exportSource(page)).toEqual(Buffer.from(moduleSource));
    await saved(page);

    if (otherTab) {
      const writer = await context.newPage();
      await writer.goto('/');
      await expect(title(writer)).toHaveText('unused');
      // The reader's last note is Measurement; the writer's last note is Welcome.
      await openFromSidebar(writer, 'Welcome');
      await openFromSidebar(writer, 'unused');
      await trashCurrent(writer);
      await page.bringToFront();
      // Headless activation can omit window focus. Exercise the normal refresh handler.
      await page.evaluate(() => window.dispatchEvent(new Event('focus')));
    } else {
      await trashCurrent(page);
    }

    await expect(title(page)).toHaveText('Welcome');
    await command(page, 'Preview document');
    await expect(
      documentEditor(page).getByRole('heading', {
        name: 'Start here',
        exact: true,
      }),
    ).toBeVisible();
    expect(await exportSource(page)).toEqual(welcome);
    await openInspector(page);
    await page
      .getByRole('region', { name: 'Preview controls' })
      .getByRole('button', { name: 'Run full document', exact: true })
      .click();
    const frame = page.frameLocator(
      '.web-preview-panel iframe[title="Document preview"]',
    );
    await expect(
      frame.getByRole('heading', { name: 'Start here', exact: true }),
    ).toBeVisible({ timeout: 20_000 });
    await expect(
      frame.getByRole('heading', { name: 'Measurement notebook' }),
    ).toHaveCount(0);
    await saved(page);
    await page.reload();
    await expect(title(page)).toHaveText('Welcome');
    expect(await exportSource(page)).toEqual(welcome);
  });
}
