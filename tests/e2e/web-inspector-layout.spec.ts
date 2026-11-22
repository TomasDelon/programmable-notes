import { expect, test } from '@playwright/test';

test('editor chrome stays clean and note tools live in the right panel', async ({
  page,
}) => {
  await page.goto('/');
  const workspace = page.getByRole('main', { name: 'Document workspace' });
  await expect(workspace).toBeVisible();
  await expect(workspace.locator('.web-document-menu')).toHaveCount(0);
  await expect(
    workspace.getByRole('region', { name: 'Note attachments' }),
  ).toHaveCount(0);
  await expect(
    workspace.getByText('Move the cursor to reveal source.', {
      exact: false,
    }),
  ).toHaveCount(0);

  await page.getByRole('button', { name: 'Open right panel' }).click();
  const inspector = page.getByRole('complementary', { name: 'Note details' });
  await expect(inspector).toBeVisible();
  await expect(inspector.getByText('Note details')).toBeVisible();
  await expect(inspector.getByRole('button', { name: 'Rename' })).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Move to folder' }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Export source' }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Move to Trash' }),
  ).toBeVisible();
  const gallery = inspector.getByRole('region', { name: 'Note attachments' });
  await expect(
    gallery.getByRole('button', { name: 'Add image or PDF' }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('region', { name: 'Connections' }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('region', { name: 'Preview controls' }),
  ).toBeVisible();

  await inspector
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Document actions' });
  await expect(dialog).toBeVisible();
  await dialog.getByRole('button', { name: 'Close Document actions' }).click();

  await inspector.getByRole('button', { name: 'Close note details' }).click();
  await expect(inspector).toBeHidden();
  await expect(workspace.locator('.web-document-menu')).toHaveCount(0);
});

test('right inspector keeps attachments accessible on narrow viewports', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await page.getByRole('button', { name: 'Open right panel' }).click();
  const inspector = page.getByRole('complementary', { name: 'Note details' });
  await expect(
    inspector
      .getByRole('region', { name: 'Note attachments' })
      .getByRole('button', { name: 'Add image or PDF' }),
  ).toBeVisible();
  await expect(
    inspector.getByRole('button', { name: 'Document actions' }),
  ).toBeVisible();
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth <= window.innerWidth + 1,
      ),
    )
    .toBe(true);
});
