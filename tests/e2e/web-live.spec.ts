import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog
    .getByRole('textbox', { name: 'Search commands and notes' })
    .fill(name);
  await dialog
    .getByRole('button', { name: new RegExp(`^${name}`) })
    .first()
    .click();
}

async function importNote(page: Page, source: string) {
  await page.getByLabel('Import note files').setInputFiles({
    name: 'live-fixture.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
}

async function exportSource(page: Page): Promise<Buffer> {
  const actions = page
    .locator('#notes-details')
    .getByRole('button', { name: 'Document actions', exact: true });
  const openedPanel = !(await actions.isVisible());
  if (openedPanel) {
    await page.getByRole('button', { name: 'Open right panel' }).click();
  }
  await expect(actions).toBeVisible();
  await actions.click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Document actions', exact: true })
    .getByRole('button', { name: 'Export source', exact: true })
    .click();
  const path = await (await download).path();
  const bytes = readFileSync(path!);
  await page
    .getByRole('button', { name: 'Close Document actions', exact: true })
    .click();
  if (openedPanel) {
    await page.getByRole('button', { name: 'Close note details' }).click();
  }
  return bytes;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
});

test('Preview reveals dollar delimiters at the caret and preserves exact LaTeX undo/reload', async ({
  page,
}) => {
  const original =
    '\uFEFF# Live note\r\n\r\nA **bold** result and $x^2$.\n\r\n$$\r\ny^2\r\n$$\r\nTail 🧠\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  await expect(page.locator('.rendered-editor strong')).toContainText('bold');
  await page.getByRole('button', { name: 'Edit inline equation: x^2' }).click();
  const inline = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(inline).toHaveValue('$x^2$');
  await expect(page.getByRole('dialog', { name: 'Edit equation' })).toHaveCount(
    0,
  );
  await inline.fill('$x^3 + 1$');
  await inline.press('Enter');
  await expect(inline).toHaveCount(0);
  await expect(
    page.getByRole('button', { name: 'Edit inline equation: x^3 + 1' }),
  ).toBeVisible();
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('x^2', 'x^3 + 1')),
  );
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  expect(await exportSource(page)).toEqual(Buffer.from(original));
});

test('invalid or cancelled inline display math retains the original and mobile has no popup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const original = '# Equations\n\n$$\r\n\\frac{a}{b}\r\n$$\n\nEnd';
  await importNote(page, original);
  await command(page, 'Preview document');
  await page
    .getByRole('button', { name: 'Edit display equation: \\frac{a}{b}' })
    .click();
  const latex = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await expect(latex).toHaveValue('$$\n\\frac{a}{b}\n$$');
  await expect(page.getByRole('dialog', { name: 'Edit equation' })).toHaveCount(
    0,
  );
  await latex.fill('$$\n\\unknowncommand\n$$');
  await latex.press('Control+Enter');
  await expect(
    page.locator('.rendered-math-error[role="alert"]'),
  ).toBeVisible();
  await latex.press('Escape');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await page
    .getByRole('button', { name: 'Edit display equation: \\frac{a}{b}' })
    .click();
  const valid = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await valid.fill('$$\n\\frac{a+1}{b}\n$$');
  await valid.press('Control+Enter');
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('\\frac{a}{b}', '\\frac{a+1}{b}')),
  );
});

test('source deletion and undo restore the original mixed line endings', async ({
  page,
}) => {
  const original = '\uFEFF# Mixed\r\n\r\nFirst 🧠\nSecond\rThird\n';
  await importNote(page, original);
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+Home');
  await source.press('Control+Shift+End');
  // One committed replacement has one undo event. Individual physical keys
  // may legitimately form multiple history groups as browser events arrive.
  await page.keyboard.insertText('# replacement');
  expect(await exportSource(page)).toEqual(Buffer.from('# replacement'));
  await source.press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
});

for (const mode of ['Edit source']) {
  test(`${mode} retains composed replacement through rendering and exact export`, async ({
    page,
  }) => {
    await importNote(page, '# Seed\n\nOriginal multi-line buffer.\n');
    await command(page, mode);
    const source = page.getByRole('textbox', { name: 'MDX source' });
    await expect(source).toContainText('Original multi-line buffer.');
    const replacement = '# Composed\n\nValue 🧠 and $x^2$.\n';
    // Firefox's fill uses composition events. The final DOM insertion must
    // survive React updates and Live decoration refresh before CM reads it.
    await source.fill(replacement);
    await expect(source).toContainText('Composed');
    expect(await exportSource(page)).toEqual(Buffer.from(replacement));
    await command(page, 'Preview document');
    await expect(
      page
        .locator('.rendered-editor')
        .getByRole('heading', { name: 'Composed' }),
    ).toBeVisible();
  });
}
