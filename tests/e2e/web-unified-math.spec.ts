import { expect, test, type Locator, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

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
async function open(page: Page, source: string) {
  await page.goto('/');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Unified mathematics.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await command(page, 'Preview document');
  return page.getByRole('textbox', { name: 'Editable document' });
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await download).path())!);
}
async function replaceText(page: Page, text: Locator, value: string) {
  await text.evaluate((element) => {
    (element.closest('.ProseMirror') as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText(value);
}
async function metrics(text: Locator) {
  return text.evaluate((element) => {
    const box = element.getBoundingClientRect();
    const style = getComputedStyle(element);
    return {
      x: box.x,
      y: box.y,
      width: box.width,
      height: box.height,
      font: style.font,
      lineHeight: style.lineHeight,
      margin: style.margin,
      padding: style.padding,
    };
  });
}

test('unfinished dollars are ordinary document text with unchanged focus geometry', async ({
  page,
}, info) => {
  const raw = "$$\r\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\r\n$";
  const original =
    '\uFEFF# Ordinary text\r\n\r\n' + raw + '\r\n\r\nKeep writing here.\r\n';
  const editor = await open(page, original);
  const paragraph = editor.locator('p').filter({ hasText: "f'(x)" });
  await expect(paragraph).toContainText('$$');
  await expect(
    editor.locator(
      '.rendered-math-host, .cm-editor, input, textarea, [tabindex], [role="button"]',
    ),
  ).toHaveCount(0);
  await editor.getByRole('heading', { name: 'Ordinary text' }).click();
  await page.evaluate(() => document.fonts.ready.then(() => undefined));
  const before = await metrics(paragraph);
  await paragraph.click();
  expect(await metrics(paragraph)).toEqual(before);
  await expect(editor).toBeFocused();
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exported(page)).toEqual(Buffer.from(original));
  await info.attach('ordinary-unfinished-mathematics', {
    body: await editor.screenshot(),
    contentType: 'image/png',
  });
});

test('mathematics uses the document caret and canonical undo with exact source preservation', async ({
  page,
}, info) => {
  const original =
    '\uFEFF# Unified editor\r\n\r\nBefore $x^2$ after.\r\n\r\n<span title="kept">Opaque JSX</span>\r\n';
  const editor = await open(page, original);
  const host = editor.locator('.rendered-math-host');
  await host.locator('.rendered-math-render .katex-html').click();
  const raw = host.locator('.rendered-math-source');
  await expect(raw).toBeVisible();
  await expect(raw).toHaveText('$x^2$');
  await expect(editor).toBeFocused();
  await expect(
    editor.locator('.cm-editor, input, textarea, [tabindex], [role="button"]'),
  ).toHaveCount(0);
  await replaceText(page, raw, '$x^3$');
  await editor.getByRole('heading', { name: 'Unified editor' }).click();
  await expect(host.locator('.katex')).toBeVisible();
  const changed = original.replace('x^2', 'x^3');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await editor.getByRole('heading', { name: 'Unified editor' }).click();
  await page.keyboard.press('Control+z');
  expect(await exported(page)).toEqual(Buffer.from(original));
  await editor.getByRole('heading', { name: 'Unified editor' }).click();
  await page.keyboard.press('Control+Shift+z');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await info.attach('unified-mathematics-rendered', {
    body: await editor.screenshot(),
    contentType: 'image/png',
  });
});

test('invalid closed mathematics remains red document text and corrects independently', async ({
  page,
}) => {
  const original =
    '# Corrections\n\nFirst $x \\in \\mathbb{R$ and second $y$.\n\nContinue here.\n';
  const editor = await open(page, original);
  const invalid = editor.locator('.rendered-math-invalid');
  await expect(invalid).toHaveCount(1);
  await expect(invalid.locator('.rendered-math-source')).toHaveText(
    '$x \\in \\mathbb{R$',
  );
  await expect(invalid.locator('.rendered-math-source')).toBeVisible();
  await replaceText(
    page,
    editor.getByText('Continue here.', { exact: true }),
    'Continue here. More text.',
  );
  await expect(invalid).toHaveCount(1);
  await replaceText(
    page,
    invalid.locator('.rendered-math-source'),
    '$x \\in \\mathbb{R}$',
  );
  await editor.getByRole('heading', { name: 'Corrections' }).click();
  await expect(editor.locator('.rendered-math-invalid')).toHaveCount(0);
  await expect(editor.locator('.katex')).toHaveCount(2);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exported(page)).toEqual(
    Buffer.from(
      original
        .replace('R$', 'R}$')
        .replace('Continue here.', 'Continue here. More text.'),
    ),
  );
});

test('document selection crosses mathematical source without a separate focus boundary', async ({
  page,
}) => {
  const original = '# Selection\n\nBefore $x^2$ after.\n';
  const editor = await open(page, original);
  const paragraph = editor.locator('p');
  await editor.locator('.rendered-math-render .katex-html').click();
  await paragraph.evaluate((element) => {
    (element.closest('.ProseMirror') as HTMLElement).focus();
    const range = document.createRange();
    range.selectNodeContents(element);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText('Replacement paragraph.');
  await expect(paragraph).toHaveText('Replacement paragraph.');
  expect(await exported(page)).toEqual(
    Buffer.from('# Selection\n\nReplacement paragraph.\n'),
  );
  await editor.getByRole('heading', { name: 'Selection' }).click();
  await page.keyboard.press('Control+z');
  expect(await exported(page)).toEqual(Buffer.from(original));
});

test('removing a math delimiter does not expose internally encoded spaces as characters', async ({
  page,
}) => {
  const original =
    '# Space encoding\n\nBefore $x$ tail\n\nKeep this paragraph.\n';
  const editor = await open(page, original);
  const paragraph = editor.locator('p').filter({ hasText: 'Before' });
  await paragraph.evaluate((element) => {
    (element.closest('.ProseMirror') as HTMLElement).focus();
    const text = element.lastChild!;
    const range = document.createRange();
    range.setStart(text, text.textContent!.length);
    range.collapse(true);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.insertText(' ');
  const source = editor.locator('.rendered-math-source');
  await editor.locator('.rendered-math-render .katex-html').click();
  await source.evaluate((element) => {
    (element.closest('.ProseMirror') as HTMLElement).focus();
    const range = document.createRange();
    range.setStart(element.firstChild!, 2);
    range.setEnd(element.firstChild!, 3);
    const selection = window.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
  });
  await page.keyboard.press('Backspace');
  await editor.getByRole('heading', { name: 'Space encoding' }).click();
  await expect(paragraph).toContainText('Before $x tail');
  await expect(editor).not.toContainText('&#32;');
  await expect(editor.locator('.rendered-math-host')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const saved = await exported(page);
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  await expect(editor).not.toContainText('&#32;');
  expect(await exported(page)).toEqual(saved);
});

test('arrow keys and extended selection traverse mathematical text in the document', async ({
  page,
}) => {
  const original = '# Keyboard navigation\n\nA $x$ B.\n';
  const editor = await open(page, original);
  const paragraph = editor.locator('p');
  const raw = editor.locator('.rendered-math-source');
  const boundary = async (side: 'before' | 'after') => {
    await paragraph.evaluate((element, side) => {
      (element.closest('.ProseMirror') as HTMLElement).focus();
      const text = side === 'before' ? element.firstChild! : element.lastChild!;
      const range = document.createRange();
      range.setStart(text, side === 'before' ? text.textContent!.length : 0);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, side);
  };
  const nativeCaret = () =>
    raw.evaluate((element) => {
      const selection = window.getSelection()!;
      return {
        within: element.contains(selection.anchorNode),
        offset: selection.anchorOffset,
        text: selection.anchorNode?.textContent,
      };
    });

  await boundary('before');
  await page.keyboard.press('ArrowRight');
  await expect(raw).toBeVisible();
  await expect(editor).toBeFocused();
  expect(await nativeCaret()).toEqual({ within: true, offset: 1, text: '$x$' });
  // Each raw character belongs to the same document selection, including dollars.
  for (let step = 2; step <= 3; step++) {
    await page.keyboard.press('ArrowRight');
    expect(await nativeCaret()).toEqual({
      within: true,
      offset: step,
      text: '$x$',
    });
  }
  await page.keyboard.press('ArrowRight');
  await expect(editor.locator('.rendered-math-render')).toBeVisible();

  await boundary('after');
  await page.keyboard.press('ArrowLeft');
  await expect(raw).toBeVisible();
  expect(await nativeCaret()).toEqual({ within: true, offset: 2, text: '$x$' });
  await expect(editor).toBeFocused();

  await boundary('before');
  await page.keyboard.down('Shift');
  for (let step = 0; step < 6; step++) await page.keyboard.press('ArrowRight');
  await page.keyboard.up('Shift');
  await expect
    .poll(() => page.evaluate(() => window.getSelection()?.toString()))
    .toContain('$x$');
  await expect(editor).toBeFocused();
  expect(await exported(page)).toEqual(Buffer.from(original));
});

test('arrow navigation enters and leaves displayed mathematics from neighboring paragraphs', async ({
  page,
}) => {
  const original =
    '# Vertical navigation\n\nBefore paragraph.\n\n$$\nx^2 + y^2\n$$\n\nAfter paragraph.\n';
  const editor = await open(page, original);
  const raw = editor.locator('.rendered-math-source');
  const position = async (text: Locator, atEnd: boolean) => {
    await text.evaluate((element, atEnd) => {
      (element.closest('.ProseMirror') as HTMLElement).focus();
      const text = element.firstChild!;
      const range = document.createRange();
      range.setStart(text, atEnd ? text.textContent!.length : 0);
      range.collapse(true);
      const selection = window.getSelection()!;
      selection.removeAllRanges();
      selection.addRange(range);
    }, atEnd);
  };
  const containsCaret = (text: Locator) =>
    text.evaluate((element) =>
      element.contains(window.getSelection()!.anchorNode),
    );
  const before = editor.getByText('Before paragraph.', { exact: true });
  const after = editor.getByText('After paragraph.', { exact: true });
  await position(before, true);
  await page.keyboard.press('ArrowDown');
  await expect(raw).toBeVisible();
  expect(await containsCaret(raw)).toBe(true);
  await expect(editor).toBeFocused();
  await expect(
    editor.locator('input, textarea, .cm-editor, [role="button"], [tabindex]'),
  ).toHaveCount(0);
  await position(raw, true);
  await page.keyboard.press('ArrowDown');
  await expect(raw).toBeHidden();
  expect(await containsCaret(after)).toBe(true);

  await position(after, false);
  await page.keyboard.press('ArrowUp');
  await expect(raw).toBeVisible();
  expect(await containsCaret(raw)).toBe(true);
  await expect(editor).toBeFocused();
  await position(raw, false);
  await page.keyboard.press('ArrowUp');
  await expect(raw).toBeHidden();
  expect(await containsCaret(before)).toBe(true);
  await expect(editor).toBeFocused();

  await position(before, true);
  await page.keyboard.press('ArrowRight');
  await expect(raw).toBeVisible();
  expect(await containsCaret(raw)).toBe(true);
  await position(after, false);
  await page.keyboard.press('ArrowLeft');
  await expect(raw).toBeVisible();
  expect(await containsCaret(raw)).toBe(true);
  await expect(editor).toBeFocused();
  expect(await exported(page)).toEqual(Buffer.from(original));
});
