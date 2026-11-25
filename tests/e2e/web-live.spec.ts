import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import {
  openMath,
  sourceForMath,
  selectDocumentText,
  replaceDocumentText,
} from './helpers/math-text';

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
  const inline = await openMath(page, '$x^2$');
  await expect(inline).toHaveText('$x^2$');
  await expect(page.getByRole('dialog', { name: 'Edit equation' })).toHaveCount(
    0,
  );
  await replaceDocumentText(page, inline, '$x^3 + 1$');
  await page.locator('.rendered-editor h1').click();
  await expect(sourceForMath(page, '$x^3 + 1$')).toBeHidden();
  await expect(
    page.locator('.rendered-editor .rendered-math-render .katex').first(),
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

test('unfinished display dollars remain ordinary text, survive reload, and become mathematics when completed', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const raw = "$$\r\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\r\n$";
  const original = '\uFEFF# Equations\r\n\r\n' + raw + '\r\n\r\nTail.\r\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view).toContainText("f'(x)");
  await expect(view.getByText('Tail.', { exact: true })).toBeVisible();
  await expect(
    view.locator('.rendered-math-host, .rendered-math-invalid, .katex'),
  ).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await page.reload();
  const paragraph = view.locator('p').filter({ hasText: "f'(x)" });
  const length = (await paragraph.textContent())!.length;
  await selectDocumentText(paragraph, length, length);
  await page.keyboard.insertText('$');
  await view.getByText('Tail.', { exact: true }).click();
  await expect(view.locator('.katex')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  const completed = original.replace(raw, () => raw + '$');
  expect(await exportSource(page)).toEqual(Buffer.from(completed));
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .press('Control+Shift+z');
  expect(await exportSource(page)).toEqual(Buffer.from(completed));
});

test('removing a dollar commits literal text without blocking other editing or correction', async ({
  page,
}) => {
  const original =
    '\uFEFF# Keep this\r\n\r\nBefore $x^2$ after.\r\n\r\nTail 🧠\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const field = await openMath(page, '$x^2$');
  await selectDocumentText(field, 5, 5);
  await page.keyboard.press('Backspace');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(
    view.locator('.rendered-math-host, .rendered-math-invalid, .katex'),
  ).toHaveCount(0);
  await view.getByRole('heading', { name: 'Keep this' }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' safe');
  const incomplete = original
    .replace('$x^2$', '$x^2')
    .replace('Keep this', 'Keep this safe');
  expect(await exportSource(page)).toEqual(Buffer.from(incomplete));
  const paragraph = view.locator('p').filter({ hasText: 'Before' });
  const offset =
    (await paragraph.textContent())!.indexOf('$x^2') + '$x^2'.length;
  await selectDocumentText(paragraph, offset, offset);
  await page.keyboard.insertText('$');
  await view.getByRole('heading', { name: 'Keep this safe' }).click();
  await expect(view.locator('.katex')).toHaveCount(1);
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('Keep this', 'Keep this safe')),
  );
});

test('typing a first dollar in ordinary prose stays document text and enables math only when paired', async ({
  page,
}) => {
  const original = '# Typing\n\nA value ';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByText('A value', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('$');
  await expect(view).toBeFocused();
  await expect(
    view.locator('.cm-editor, input, textarea, .rendered-math-host'),
  ).toHaveCount(0);
  await page.keyboard.type('x');
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(0);
  await page.keyboard.type('$');
  await view.getByRole('heading', { name: 'Typing' }).click();
  await expect(view.locator('.katex')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.trimEnd() + '$x$ '),
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

test('caret math is same-document source with keyboard exit and canonical history, without form controls', async ({
  page,
}) => {
  const original =
    '\uFEFF# Caret math\r\n\r\nBefore $x^2$ after.\r\n\r\n$$\r\ny^2\r\n$$\r\n\r\nTail.\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  const inline = await openMath(page, '$x^2$');
  await expect(view).toBeFocused();
  await expect(
    view.locator('input, textarea, .cm-editor, .rendered-math-controls'),
  ).toHaveCount(0);
  await expect(inline).toHaveText('$x^2$');
  await selectDocumentText(inline, 3, 4);
  await page.keyboard.insertText('3');
  await expect(sourceForMath(page, '$x^3$')).toBeVisible();
  await page.keyboard.press('Control+z');
  await expect(sourceForMath(page, '$x^2$')).toBeVisible();
  await page.keyboard.press('Control+Shift+Z');
  const edited = sourceForMath(page, '$x^3$');
  await expect(edited).toBeVisible();
  await selectDocumentText(edited, 5, 5);
  await page.keyboard.press('ArrowRight');
  await expect(edited).toBeHidden();
  await expect(view).toBeFocused();
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('x^2', 'x^3')),
  );
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
});

test('display math reveals raw lines, supports ordinary Enter and renders after moving into prose', async ({
  page,
}) => {
  const original = '# Display\r\n\r\n$$\r\nx^2\r\n$$\r\n\r\nTail.\r\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  const rendered = view.locator('.rendered-math-render');
  await rendered.hover();
  const math = sourceForMath(page, '$$\nx^2\n$$');
  await expect(math).toBeHidden();
  await rendered.click();
  await expect(math).toHaveText('$$\nx^2\n$$', { useInnerText: true });
  await expect(
    view.locator('input, textarea, .cm-editor, .rendered-math-controls'),
  ).toHaveCount(0);
  await selectDocumentText(math, '$$\nx^2'.length, '$$\nx^2'.length);
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('+ y^2');
  const edited = sourceForMath(page, '$$\nx^2\n+ y^2\n$$');
  await expect(edited).toBeVisible();
  await view.getByText('Tail.', { exact: true }).click();
  await expect(edited).toBeHidden();
  await expect(view).toBeFocused();
  await expect(view.locator('.katex-display')).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const expected = original.replace('x^2\r\n', 'x^2\r\n+ y^2\r\n');
  expect(await exportSource(page)).toEqual(Buffer.from(expected));
  await page.reload();
  await expect(page.locator('.rendered-editor .katex-display')).toBeVisible();
  expect(await exportSource(page)).toEqual(Buffer.from(expected));
});

test('moving between equations changes only the edited exact span and reopening without editing preserves bytes', async ({
  page,
}) => {
  const original =
    '\uFEFF# Two\r\n\r\nFirst $x$ and second $x$.\r\n\r\n<span title="unchanged">Opaque</span>\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const equations = sourceForMath(page, '$x$');
  await equations.nth(1).locator('..').locator('.rendered-math-render').click();
  await replaceDocumentText(page, equations.nth(1), '$y$');
  await equations
    .first()
    .locator('..')
    .locator('.rendered-math-render')
    .click();
  await expect(equations.first()).toBeVisible();
  await page.locator('.rendered-editor h1').click();
  await expect(equations.first()).toBeHidden();
  const expected = original.replace('second $x$', 'second $y$');
  expect(await exportSource(page)).toEqual(Buffer.from(expected));
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await source.press('Control+Shift+Z');
  expect(await exportSource(page)).toEqual(Buffer.from(expected));
});

for (const width of [1440, 390]) {
  test(`mathematical source stays in normal document flow at ${width}px`, async ({
    page,
  }, testInfo) => {
    await page.setViewportSize({ width, height: 900 });
    await importNote(
      page,
      '# Flow\n\nBefore $x^2$ after.\n\n$$\ny^2\n$$\n\nTail.\n',
    );
    await command(page, 'Preview document');
    const paragraph = page
      .locator('.rendered-editor p')
      .filter({ hasText: 'Before' });
    const before = (await paragraph.boundingBox())!.height;
    const inline = await openMath(page, '$x^2$');
    await expect(page.locator('.rendered-editor .ProseMirror')).toBeFocused();
    const mathHeight = await inline.evaluate(
      (node) => node.getBoundingClientRect().height,
    );
    expect(mathHeight).toBeLessThan(48);
    await testInfo.attach(`inline-math-source-${width}px`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect((await paragraph.boundingBox())!.height).toBeLessThan(before + 32);
    const display = await openMath(page, '$$\ny^2\n$$');
    await expect(page.locator('.rendered-editor .ProseMirror')).toBeFocused();
    expect(
      await display.evaluate((node) => node.getBoundingClientRect().height),
    ).toBeLessThan(120);
  });
}

test('invalid LaTeX stays red and editable without blocking other text or later corrections', async ({
  page,
}) => {
  const original =
    '\uFEFF# Forgiving math\r\n\r\nFirst $x \\in \\mathbb{R}$ and second $y$.\r\n\r\nContinue here.\r\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  const math = await openMath(page, '$x \\in \\mathbb{R}$');
  await replaceDocumentText(page, math, '$x \\in \\mathbb{R$');
  await view.getByText('Continue here.', { exact: true }).click();
  const invalid = view.locator('.rendered-math-invalid');
  await expect(invalid.locator('.rendered-math-source')).toHaveText(
    '$x \\in \\mathbb{R$',
  );
  await expect(invalid.locator('.rendered-math-render')).toBeHidden();
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Still writing.');
  await expect(view).toContainText('Continue here. Still writing.');
  const second = await openMath(page, '$y$');
  await replaceDocumentText(page, second, '$\\frac{a}{b$');
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(2);
  const badSource = await exportSource(page);
  expect(badSource.toString()).toContain('$x \\in \\mathbb{R$');
  expect(badSource.toString()).toContain('$\\frac{a}{b$');
  await page.reload();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(2);
  const firstBad = await openMath(page, '$x \\in \\mathbb{R$');
  await selectDocumentText(
    firstBad,
    '$x \\in \\mathbb{R'.length,
    '$x \\in \\mathbb{R'.length,
  );
  await page.keyboard.insertText('}');
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(1);
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(sourceForMath(page, '$x \\in \\mathbb{R}$')).toBeHidden();
  const secondBad = await openMath(page, '$\\frac{a}{b$');
  await replaceDocumentText(page, secondBad, '$\\frac{a}{b}$');
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(0);
  await expect(view.locator('.rendered-math-render .katex')).toHaveCount(2);
  const after = await exportSource(page);
  expect(after.toString()).toContain(
    '$x \\in \\mathbb{R}$ and second $\\frac{a}{b}$',
  );
  expect(after.toString()).toContain('Still');
  await page.reload();
  await expect(view.locator('.rendered-math-render .katex')).toHaveCount(2);
});

test('literal mathematics work budget reports its refusal, retains exact source and recovers through source editing and undo', async ({
  page,
}) => {
  const original = '\uFEFF' + '$$draft\r\n'.repeat(1000);
  const recovered = '# Recovered\n\n$x^2$';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.getByRole('textbox', { name: 'Editable document' });
  await expect(view.locator('pre code')).toContainText('$$draft');
  try {
    const notice = page.getByRole('alert');
    await expect(notice).toHaveCount(1, { timeout: 20000 });
    await expect(notice).toHaveAttribute(
      'data-notification-id',
      'document-preview',
    );
    await expect(notice).toContainText('Preview needs attention');
    await notice.getByRole('button', { name: 'Details', exact: true }).click();
    const detail = page.getByRole('dialog', {
      name: 'Notification details',
    });
    await expect(detail.locator('pre')).toContainText(
      'Mathematical source analysis reached its work limit. Source remains available.',
    );
    await detail.getByRole('button', { name: 'Close details' }).click();
  } catch (failure) {
    const alerts = await page.getByRole('alert').evaluateAll((nodes) =>
      nodes.map((node) => ({
        id: node.getAttribute('data-notification-id'),
        text: node.textContent,
      })),
    );
    const details = page
      .getByRole('alert')
      .getByRole('button', { name: 'Details', exact: true });
    const dialog = page.getByRole('dialog', { name: 'Notification details' });
    let detail = '';
    if (await dialog.isVisible()) {
      detail = await dialog.innerText();
    } else if (await details.count()) {
      await details.first().click();
      detail = await dialog.innerText();
    }
    const diagnostic = JSON.stringify({ alerts, detail }, null, 2);
    await test.info().attach('literal-math-budget-alerts', {
      body: diagnostic,
      contentType: 'application/json',
    });
    throw new Error(`Unexpected literal-math budget alert: ${diagnostic}`, {
      cause: failure,
    });
  }
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+a');
  await page.keyboard.insertText(recovered);
  await source.press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await source.press('Control+Shift+z');
  await command(page, 'Preview document');
  await expect(view.getByRole('heading', { name: 'Recovered' })).toBeVisible();
  await expect(view.locator('.katex')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportSource(page)).toEqual(
    Buffer.from(recovered.replaceAll('\n', '\r\n')),
  );
});
