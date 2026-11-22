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
  await page
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Export source', exact: true })
    .click();
  const path = await (await download).path();
  const bytes = readFileSync(path!);
  await page
    .getByRole('button', { name: 'Close Document actions', exact: true })
    .click();
  return bytes;
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
});

test('Live editing renders math and commits original LaTeX with exact bytes, undo and reload', async ({
  page,
}) => {
  const original =
    '\uFEFF# Live note\r\n\r\nA **bold** result and $x^2$.\n\r\n$$\r\ny^2\r\n$$\r\nTail 🧠\n';
  await importNote(page, original);
  await command(page, 'Live editing');
  await expect(page.locator('.source-editor .cm-live-strong')).toContainText(
    'bold',
  );
  await page.getByRole('button', { name: 'Edit inline equation: x^2' }).click();
  const equation = page.getByRole('dialog', { name: 'Edit equation' });
  await equation.getByRole('textbox', { name: 'LaTeX source' }).fill('x^3 + 1');
  await expect(
    equation.getByLabel('Equation preview').locator('.katex'),
  ).toBeVisible();
  await equation
    .getByRole('textbox', { name: 'LaTeX source' })
    .press('Control+Enter');
  await expect(equation).toHaveCount(0);
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('x^2', 'x^3 + 1')),
  );
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  expect(await exportSource(page)).toEqual(Buffer.from(original));
});

test('invalid LaTeX and cancelled math edits preserve the source; display equations are editable', async ({
  page,
}) => {
  const original = '# Equations\n\n$$\r\n\\frac{a}{b}\r\n$$\n\nEnd';
  await importNote(page, original);
  await command(page, 'Live editing');
  await page
    .getByRole('button', { name: 'Edit display equation: \\frac{a}{b}' })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Edit equation' });
  const latex = dialog.getByRole('textbox', { name: 'LaTeX source' });
  await latex.fill('\\unknowncommand');
  await expect(dialog.getByRole('alert')).toBeVisible();
  await expect(
    dialog.getByRole('button', { name: 'Apply equation' }),
  ).toBeDisabled();
  await latex.press('Escape');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await page
    .getByRole('button', { name: 'Edit display equation: \\frac{a}{b}' })
    .click();
  await dialog
    .getByRole('textbox', { name: 'LaTeX source' })
    .fill('\n\\frac{a+1}{b}\n');
  await dialog.getByRole('button', { name: 'Apply equation' }).click();
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

for (const mode of ['Edit source', 'Live editing']) {
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
      page.frameLocator('iframe').getByRole('heading', { name: 'Composed' }),
    ).toBeVisible();
  });
}
