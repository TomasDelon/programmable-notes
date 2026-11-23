import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByLabel('Search commands and notes').fill(name);
  await dialog
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

async function exportSource(page: Page): Promise<Buffer> {
  const inspector = page.getByRole('complementary', { name: 'Note details' });
  if (!(await inspector.isVisible()))
    await page.getByRole('button', { name: 'Open right panel' }).click();
  const download = page.waitForEvent('download');
  await inspector
    .getByRole('button', { name: 'Export source', exact: true })
    .click();
  return readFileSync((await (await download).path())!);
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
});

test('Preview renders list markers and tasks and preserves exact source through undo', async ({
  page,
}) => {
  const original =
    '\uFEFF# Tomas delon gag\r\n\r\n- tomas d\n- tomasd\r\n- qsdf\r\n\r\n1. tomas\n7. delon gag\r\n\r\n- [ ] tomasd 🧠\n- [ ] qsdfomqsdf\r\n\r\n$$\r\n\\forall x \\in \\mathbb{R}\r\n$$\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Marilinda.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view.locator('ul').first().locator('li')).toHaveCount(3);
  await expect(view.locator('ol').first().locator('li')).toHaveCount(2);
  const pending = page.getByRole('checkbox', { name: 'Task: tomasd 🧠' });
  await expect(pending).toBeVisible();
  await expect(pending).not.toBeChecked();
  await expect(
    page.getByRole('checkbox', { name: 'Task: qsdfomqsdf' }),
  ).toBeVisible();
  const math = page.getByRole('button', {
    name: 'Edit display equation: \\forall x \\in \\mathbb{R}',
  });
  await expect(math).toBeVisible();
  const contentBox = await view.boundingBox();
  const mathBox = await math.boundingBox();
  const expressionBox = await math
    .locator('.katex-html .katex-base')
    .evaluateAll((parts) => {
      const boxes = parts.map((part) => part.getBoundingClientRect());
      const left = Math.min(...boxes.map((box) => box.left));
      const right = Math.max(...boxes.map((box) => box.right));
      return { x: left, width: right - left };
    });
  expect(contentBox).not.toBeNull();
  expect(mathBox).not.toBeNull();
  expect(expressionBox).not.toBeNull();
  expect(Math.abs(mathBox!.width - contentBox!.width)).toBeLessThanOrEqual(2);
  expect(
    Math.abs(
      expressionBox!.x +
        expressionBox!.width / 2 -
        (contentBox!.x + contentBox!.width / 2),
    ),
  ).toBeLessThanOrEqual(2);

  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await pending.check();
  const edited = original.replace('- [ ] tomasd', '- [x] tomasd');
  expect(await exportSource(page)).toEqual(Buffer.from(edited));
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await command(page, 'Preview document');
  await expect(pending).not.toBeChecked();
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  expect(await exportSource(page)).toEqual(Buffer.from(original));
});

test('Live fenced code is literal rendered text and reveals editable source on keyboard activation', async ({
  page,
}) => {
  const source =
    '# Blocks\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n---\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Blocks.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await command(page, 'Preview document');
  const code = page.locator('.rendered-editor pre').first();
  await expect(code).toBeVisible();
  await expect(code).toContainText('<img src=x onerror=alert(1)>');
  await expect(code.locator('img')).toHaveCount(0);
  await expect(page.locator('.rendered-editor hr')).toBeVisible();
  await command(page, 'Edit source');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    '```html',
  );
  expect(await exportSource(page)).toEqual(Buffer.from(source));
});
