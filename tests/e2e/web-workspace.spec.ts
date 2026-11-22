import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function ready(page: Page) {
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible({ timeout: 15_000 });
  await saved(page);
}

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

async function edit(page: Page, source: string) {
  if (!(await page.getByRole('textbox', { name: 'MDX source' }).isVisible()))
    await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).fill(source);
}

async function selectedSavedSource(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('programmable-notes-web-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const read = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          read.onsuccess = () => {
            database.close();
            const state = read.result.state;
            resolve(state.workspace.files[state.workspace.selected]);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
  );
}

test('autosaves successive edits after idle and reopens exact Unicode source', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const first = '# Morning\n\nA first idea, café and λ.';
  const second = first + '\n\nA later edit after saving, ∇f.';
  await edit(page, first);
  await expect.poll(() => selectedSavedSource(page)).toBe(first);
  await saved(page);
  // This explicitly exercises the old no-op-save promise race.
  await page.keyboard.press('Control+s');
  await saved(page);
  await edit(page, second);
  await expect.poll(() => selectedSavedSource(page)).toBe(second);
  await saved(page);
  await page.reload();
  await ready(page);
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveText(
    second,
    { useInnerText: true },
  );
  expect(await selectedSavedSource(page)).toBe(second);
});

test('exports exact imported source and round-trips a complete workspace backup', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  const exact =
    '\uFEFF# Exact source\r\n\r\nUnicode λ and preserved bytes.\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Exact.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(exact),
  });
  await expect.poll(() => selectedSavedSource(page)).toBe(exact);
  const sourceDownload = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await sourceDownload).path())!, 'utf8')).toBe(
    exact,
  );
  const backupDownload = page.waitForEvent('download');
  await command(page, 'Export workspace backup');
  const backup = readFileSync((await (await backupDownload).path())!);
  const payload = JSON.parse(backup.toString('utf8'));
  expect(payload.format).toBe('programmable-notes-workspace');
  expect(Object.values(payload.state.workspace.files)).toContain(exact);
  await edit(page, '# Later replacement');
  await expect
    .poll(() => selectedSavedSource(page))
    .toBe('# Later replacement');
  page.once('dialog', (dialog) => dialog.accept());
  await page.getByLabel('Choose workspace backup').setInputFiles({
    name: 'workspace.json',
    mimeType: 'application/json',
    buffer: backup,
  });
  await expect.poll(() => selectedSavedSource(page)).toBe(exact);
  await page.reload();
  await ready(page);
  await expect.poll(() => selectedSavedSource(page)).toBe(exact);
});

test('rejects invalid backup and oversize paste without changing saved source', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await edit(page, 'Keep this exact note.');
  await expect
    .poll(() => selectedSavedSource(page))
    .toBe('Keep this exact note.');
  await page.getByLabel('Choose workspace backup').setInputFiles({
    name: 'broken.json',
    mimeType: 'application/json',
    buffer: Buffer.from('{"format":"other","state":{}}'),
  });
  await expect(page.locator('.web-storage-banner')).toContainText(
    /backup|format/i,
  );
  expect(await selectedSavedSource(page)).toBe('Keep this exact note.');
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('x'.repeat(500001));
  await expect(page.locator('.web-storage-banner')).toContainText(
    /not inserted|500 KB/i,
  );
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveText(
    'Keep this exact note.',
  );
  expect(await selectedSavedSource(page)).toBe('Keep this exact note.');
});

test('a stale tab retains its draft and cannot overwrite the other tab', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await ready(page);
  await edit(page, 'Shared baseline');
  await expect.poll(() => selectedSavedSource(page)).toBe('Shared baseline');
  const other = await context.newPage();
  await other.goto('/');
  await ready(other);
  await edit(page, 'Saved from first tab');
  await expect
    .poll(() => selectedSavedSource(page))
    .toBe('Saved from first tab');
  await edit(other, 'Retained draft from second tab');
  await expect(other.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'conflict',
  );
  await expect(other.locator('.web-storage-banner')).toBeVisible();
  await expect(other.getByRole('textbox', { name: 'MDX source' })).toHaveText(
    'Retained draft from second tab',
  );
  expect(await selectedSavedSource(page)).toBe('Saved from first tab');
  const backupDownload = other.waitForEvent('download');
  await other
    .locator('.web-storage-banner')
    .getByRole('button', { name: 'Export current backup' })
    .click();
  const payload = JSON.parse(
    readFileSync((await (await backupDownload).path())!, 'utf8'),
  );
  expect(Object.values(payload.state.workspace.files)).toContain(
    'Retained draft from second tab',
  );
  other.once('dialog', (dialog) => dialog.accept());
  await other
    .getByRole('button', { name: 'Load latest saved workspace' })
    .click();
  await ready(other);
  await expect(other.getByRole('textbox', { name: 'MDX source' })).toHaveText(
    'Saved from first tab',
  );
});

test('opens, compiles mathematics and saves edits while offline', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await ready(page);
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 20000 },
  );
  await page
    .frameLocator('iframe')
    .locator('.katex')
    .first()
    .waitFor({ timeout: 20000 });
  await context.setOffline(true);
  try {
    await page.reload();
    await ready(page);
    await expect(
      page.frameLocator('iframe').locator('.katex').first(),
    ).toBeVisible({ timeout: 20000 });
    await edit(page, '# Offline note\n\nStill writing without a network.');
    await expect
      .poll(() => selectedSavedSource(page))
      .toBe('# Offline note\n\nStill writing without a network.');
    await saved(page);
    await page.reload();
    await ready(page);
    await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveText(
      '# Offline note\n\nStill writing without a network.',
      { useInnerText: true },
    );
    expect(await selectedSavedSource(page)).toBe(
      '# Offline note\n\nStill writing without a network.',
    );
  } finally {
    await context.setOffline(false);
  }
});

test('detects damaged storage and restores a previous verified checkpoint', async ({
  page,
}) => {
  await page.goto('/');
  await ready(page);
  await edit(page, 'An edit creates a recovery checkpoint.');
  await expect
    .poll(() => selectedSavedSource(page))
    .toBe('An edit creates a recovery checkpoint.');
  await page.evaluate(
    () =>
      new Promise<void>((resolve, reject) => {
        const open = indexedDB.open('programmable-notes-web-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const transaction = database.transaction('workspace', 'readwrite');
          const store = transaction.objectStore('workspace');
          const read = store.get('current');
          read.onsuccess = () =>
            store.put({ ...read.result, checksum: 'damaged' }, 'current');
          transaction.oncomplete = () => {
            database.close();
            resolve();
          };
          transaction.onerror = () => {
            database.close();
            reject(transaction.error);
          };
        };
      }),
  );
  await page.reload();
  await expect(page.getByRole('alert')).toContainText('integrity');
  await page
    .getByRole('button', { name: 'Check recovery history', exact: true })
    .click();
  const restore = page.getByRole('button', { name: /^Restore/ }).last();
  await expect(restore).toBeEnabled();
  await restore.click();
  await ready(page);
  await expect(page.locator('.web-shell')).toBeVisible();
  expect(await selectedSavedSource(page)).toContain(
    'Your notes, with room to think.',
  );
});
