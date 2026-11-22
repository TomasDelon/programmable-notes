import { expect, test, type Page } from '@playwright/test';

test.describe.configure({ timeout: 90_000 });

async function start(page: Page) {
  await page.goto('/');
  await expect(
    page.getByRole('textbox', { name: 'Document title', exact: true }),
  ).toHaveValue('Welcome');
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page.getByRole('group', { name: 'Documents section' }),
  ).toBeVisible();
}
async function save(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 20000 },
  );
}
async function addFolder(page: Page, name: string) {
  const section = page.getByRole('group', { name: 'Documents section' });
  await section.hover();
  await section.getByRole('button', { name: 'New folder' }).click();
  const input = page.getByRole('textbox', { name: 'New folder name' });
  await input.fill(name);
  await input.press('Enter');
  await expect(
    page.locator('.left-folder-title[title="' + name + '"]'),
  ).toBeVisible();
}
async function addNote(page: Page, folder: string) {
  const row = page.locator('.folder-tree-row').filter({
    has: page.locator('.left-folder-title[title="' + folder + '"]'),
  });
  await row.hover();
  await row.getByRole('button', { name: 'New document in ' + folder }).click();
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Untitled');
}

test('reorders documents and folders as mixed siblings and persists after reload', async ({
  page,
}) => {
  await start(page);
  const root = page.getByLabel('Document folders');
  const welcome = root.locator('.nav-file[title="Welcome"]');
  const folder = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="Examples"]') });
  const box = await folder.boundingBox();
  await welcome.dragTo(folder, {
    targetPosition: { x: box!.width / 2, y: box!.height * 0.95 },
  });
  await expect
    .poll(async () =>
      root.evaluate((el) =>
        [...el.children]
          .filter(
            (n) =>
              n.classList.contains('nav-file') ||
              n.classList.contains('folder-tree-group'),
          )
          .map((n) =>
            n.classList.contains('nav-file')
              ? n.getAttribute('title')
              : n.querySelector('.left-folder-title')?.getAttribute('title'),
          )
          .join(','),
      ),
    )
    .toBe('Examples,Welcome');
  await save(page);
  await page.reload();
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect
    .poll(async () =>
      root.evaluate((el) =>
        [...el.children]
          .filter(
            (n) =>
              n.classList.contains('nav-file') ||
              n.classList.contains('folder-tree-group'),
          )
          .map((n) =>
            n.classList.contains('nav-file')
              ? n.getAttribute('title')
              : n.querySelector('.left-folder-title')?.getAttribute('title'),
          )
          .join(','),
      ),
    )
    .toBe('Examples,Welcome');
});

test('drops a document into a folder and restores it to the root', async ({
  page,
}) => {
  await start(page);
  const rootNote = page
    .getByLabel('Document folders')
    .locator('.nav-file[title="Welcome"]');
  const folder = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="Examples"]') });
  const box = await folder.boundingBox();
  await rootNote.dragTo(folder, {
    targetPosition: { x: box!.width / 2, y: box!.height / 2 },
  });
  const moved = page.locator(
    '.folder-tree-children .nav-file[title="Welcome"]',
  );
  await expect(moved).toBeVisible();
  await moved.dragTo(page.locator('.pn-documents-rule .pn-section-tail'));
  await expect(
    page
      .getByLabel('Document folders')
      .locator(':scope > .nav-file[title="Welcome"]'),
  ).toBeVisible();
  await save(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(
    page
      .getByLabel('Document folders')
      .locator(':scope > .nav-file[title="Welcome"]'),
  ).toBeVisible();
});

test('moves folders with their documents and preserves data and nested hierarchy', async ({
  page,
}) => {
  await start(page);
  await addFolder(page, 'A');
  await addFolder(page, 'B');
  await addNote(page, 'A');
  const sourceBox = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="A"]') });
  const targetBox = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="B"]') });
  const box = await targetBox.boundingBox();
  await sourceBox.dragTo(targetBox, {
    targetPosition: { x: box!.width / 2, y: box!.height / 2 },
  });
  await expect(page.locator('.left-folder-title[title="B/A"]')).toBeVisible();
  await expect(
    page.locator('.folder-tree-children .nav-file[title="Untitled"]'),
  ).toBeVisible();
  await save(page);
  await page.reload();
  await page.getByRole('button', { name: 'Open navigation' }).click();
  await expect(page.locator('.left-folder-title[title="B/A"]')).toBeVisible();
  const row = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="B/A"]') });
  await expect(row).toBeVisible();
  const invalid = page
    .locator('.folder-tree-row')
    .filter({ has: page.locator('.left-folder-title[title="B"]') });
  const rect = await row.boundingBox();
  await invalid.dragTo(row, {
    targetPosition: { x: rect!.width / 2, y: rect!.height / 2 },
  });
  await expect(page.locator('.left-folder-title[title="B/A"]')).toBeVisible();
  await expect(page.locator('.left-folder-title[title="A/B"]')).toHaveCount(0);
});
