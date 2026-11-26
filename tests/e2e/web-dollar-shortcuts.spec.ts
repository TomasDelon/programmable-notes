import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { documentEditor, selectDocumentText } from './helpers/math-text';

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(name);
  await palette
    .getByRole('button', { name: new RegExp('^' + name) })
    .first()
    .click();
}

async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await download).path())!);
}

for (const mode of ['prose', 'unpaired dollar', 'paired dollars'] as const) {
  test(`${mode} preserves neighboring bold shortcuts and exact undo/redo source`, async ({
    page,
  }) => {
    const prefix = '\uFEFF# Shortcuts\r\n\r\n';
    const suffix =
      '\r\n\r\nUntouched &amp; sample.  \r\n\r\n* First\n* Second\n';
    const original = prefix + 'Lead **bold** tail.' + suffix;
    await page.goto('/');
    await page.getByLabel('Import note files').setInputFiles({
      name: 'Dollar shortcuts.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(original),
    });
    await command(page, 'Preview document');
    const editor = documentEditor(page);
    const paragraph = editor.locator('p').filter({ hasText: 'tail.' });
    await expect(paragraph.locator('strong')).toHaveText('bold');

    let insertion = '';
    if (mode !== 'prose') {
      await paragraph.click();
      await page.keyboard.press('Home');
      await page.keyboard.type('$x');
      await expect(editor).toBeFocused();
      await expect(paragraph.locator('strong')).toHaveText('bold');
      await expect(editor.locator('.rendered-math-host')).toHaveCount(0);
      await page.keyboard.type(mode === 'paired dollars' ? '$ ' : ' ');
      insertion = mode === 'paired dollars' ? '$x$ ' : '\\$x ';
    }
    await expect(paragraph.locator('strong')).toHaveText('bold');
    await expect(editor.locator('.rendered-math-host')).toHaveCount(
      mode === 'paired dollars' ? 1 : 0,
    );
    await expect(editor.locator('input, textarea, .cm-editor')).toHaveCount(0);
    const formatted = prefix + insertion + 'Lead **bold** tail.' + suffix;
    expect(await exported(page)).toEqual(Buffer.from(formatted));
    if (mode === 'paired dollars')
      await expect(
        editor.locator('.rendered-math-render .katex'),
      ).toBeVisible();

    await selectDocumentText(paragraph.locator('strong'));
    await page.keyboard.press('Control+b');
    await expect(paragraph.locator('strong')).toHaveCount(0);
    const plain = prefix + insertion + 'Lead bold tail.' + suffix;
    expect(await exported(page)).toEqual(Buffer.from(plain));

    await editor.press('Control+z');
    await expect(paragraph.locator('strong')).toHaveText('bold');
    expect(await exported(page)).toEqual(Buffer.from(formatted));
    await editor.press('Control+Shift+z');
    await expect(paragraph.locator('strong')).toHaveCount(0);
    expect(await exported(page)).toEqual(Buffer.from(plain));
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}

test('a dollar deliberately escaped in Source stays literal when another dollar is typed beside it', async ({
  page,
}) => {
  const original = '\uFEFF# Literal dollars\r\n\r\nLead **bold** tail.\r\n';
  await page.goto('/');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Literal dollars.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Edit source');
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('\uFEFF# Literal dollars\r\n\r\nLead \\$literal **bold** tail.\r\n');
  await command(page, 'Preview document');
  const editor = documentEditor(page);
  const paragraph = editor.locator('p').filter({ hasText: 'tail.' });
  await expect(paragraph.locator('strong')).toHaveText('bold');
  await selectDocumentText(
    paragraph,
    'Lead $literal'.length,
    'Lead $literal'.length,
  );
  await page.keyboard.type('$');
  await expect(editor).toBeFocused();
  await expect(paragraph).toContainText('Lead $literal$ bold tail.');
  await expect(paragraph.locator('strong')).toHaveText('bold');
  await expect(editor.locator('.rendered-math-host')).toHaveCount(0);
  expect(await exported(page)).toEqual(
    Buffer.from(
      '\uFEFF# Literal dollars\r\n\r\nLead \\$literal\\$ **bold** tail.\r\n',
    ),
  );
});
