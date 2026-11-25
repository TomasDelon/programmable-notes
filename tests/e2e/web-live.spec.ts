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
  await expect(inline).toHaveText('$x^2$');
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
  await expect(view.locator('.rendered-math-invalid, .katex')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await page.reload();
  await expect(view.getByText('Tail.', { exact: true })).toBeVisible();
  await view.getByRole('button', { name: /^Edit display equation:/ }).click();
  const field = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await field.press('Control+End');
  await page.keyboard.insertText('$');
  await field.press('Control+Enter');
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
  await page.getByRole('button', { name: 'Edit inline equation: x^2' }).click();
  const field = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await field.press('Control+End');
  await field.press('Backspace');
  await field.press('Enter');
  await expect(page.getByRole('alert')).toHaveCount(0);
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view.locator('.rendered-math-invalid, .katex')).toHaveCount(0);
  await view.getByRole('heading', { name: 'Keep this' }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' safe');
  const incomplete = original
    .replace('$x^2$', '$x^2')
    .replace('Keep this', 'Keep this safe');
  expect(await exportSource(page)).toEqual(Buffer.from(incomplete));
  await view.getByRole('button', { name: /^Edit inline equation:/ }).click();
  const draft = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await draft.press('Control+Home');
  await draft.press('ArrowRight');
  await draft.press('ArrowRight');
  await draft.press('ArrowRight');
  await draft.press('ArrowRight');
  await page.keyboard.insertText('$');
  await draft.press('Enter');
  await expect(view.locator('.katex')).toHaveCount(1);
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('Keep this', 'Keep this safe')),
  );
});

test('typing a first dollar in ordinary prose opens literal source and enables math only when paired', async ({
  page,
}) => {
  const original = '# Typing\n\nA value ';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByText('A value', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type('$');
  const field = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(field).toBeFocused();
  await page.keyboard.type('x');
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(0);
  await page.keyboard.type('$');
  await field.press('Enter');
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

test('caret math is ordinary in-place source with keyboard exit and local history, without form controls', async ({
  page,
}) => {
  const original =
    '\uFEFF# Caret math\r\n\r\nBefore $x^2$ after.\r\n\r\n$$\r\ny^2\r\n$$\r\n\r\nTail.\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.locator('p').filter({ hasText: 'Before' }).click();
  await page.keyboard.press('Home');
  for (let index = 0; index < 'Before '.length; index++)
    await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  const inline = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(inline).toBeFocused();
  expect(await inline.evaluate(() => window.getSelection()!.anchorOffset)).toBe(
    0,
  );
  expect(await inline.evaluate((node) => node.tagName)).not.toMatch(
    /^(INPUT|TEXTAREA)$/,
  );
  await expect(view.locator('.rendered-math-controls')).toHaveCount(0);
  await expect(inline).toHaveText('$x^2$');
  await inline.press('End');
  await inline.press('ArrowLeft');
  await inline.press('Backspace');
  await page.keyboard.insertText('3');
  await expect(inline).toHaveText('$x^3$');
  await inline.press('Control+z');
  await expect(inline).not.toHaveText('$x^3$');
  await inline.press('Control+Shift+Z');
  await expect(inline).toHaveText('$x^3$');
  await inline.press('End');
  await inline.press('ArrowRight');
  await expect(inline).toHaveCount(0);
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
  const rendered = view.getByRole('button', {
    name: 'Edit display equation: x^2',
  });
  await rendered.hover();
  await expect(
    page.getByRole('textbox', { name: 'Display LaTeX source' }),
  ).toHaveCount(0);
  await rendered.click();
  const math = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await expect(math).toHaveText('$$\nx^2\n$$', { useInnerText: true });
  await expect(
    view.locator('input, textarea, .rendered-math-controls'),
  ).toHaveCount(0);
  await math.press('Control+Home');
  await math.press('ArrowDown');
  await math.press('End');
  await math.press('Enter');
  await page.keyboard.insertText('+ y^2');
  await expect(math).toHaveText('$$\nx^2\n+ y^2\n$$', { useInnerText: true });
  await math.press('Control+End');
  await math.press('ArrowDown');
  const error = page
    .getByRole('alert')
    .filter({ hasText: 'Check the equation' });
  if (await error.count()) {
    await error.getByRole('button', { name: 'Details', exact: true }).click();
    throw new Error(
      await page
        .getByRole('dialog', { name: 'Notification details' })
        .innerText(),
    );
  }
  await expect(math).toHaveCount(0);
  await expect(view).toBeFocused();
  await expect(view.locator('.katex-display')).toBeVisible();
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('x^2\r\n', 'x^2\r\n+ y^2\r\n')),
  );
  await page.reload();
  await expect(page.locator('.rendered-editor .katex-display')).toBeVisible();
  expect(await exportSource(page)).toEqual(
    Buffer.from(original.replace('x^2\r\n', 'x^2\r\n+ y^2\r\n')),
  );
});

test('moving between equations commits only the edited exact span and reopening without editing preserves bytes', async ({
  page,
}) => {
  const original =
    '\uFEFF# Two\r\n\r\nFirst $x$ and second $x$.\r\n\r\n<span title="unchanged">Opaque</span>\n';
  await importNote(page, original);
  await command(page, 'Preview document');
  const equations = page.getByRole('button', {
    name: 'Edit inline equation: x',
    exact: true,
  });
  await equations.nth(1).click();
  const math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.fill('$y$');
  await equations.first().click();
  await expect(math).toHaveText('$x$');
  await page.locator('.rendered-editor h1').click();
  await expect(math).toHaveCount(0);
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
    await page
      .getByRole('button', { name: 'Edit inline equation: x^2' })
      .click();
    const inline = page.getByRole('textbox', { name: 'Inline LaTeX source' });
    await expect(inline).toBeFocused();
    const mathHeight = await inline.evaluate(
      (node) => node.closest('.cm-editor')!.getBoundingClientRect().height,
    );
    expect(mathHeight).toBeLessThan(48);
    await testInfo.attach(`inline-math-source-${width}px`, {
      body: await page.screenshot(),
      contentType: 'image/png',
    });
    expect((await paragraph.boundingBox())!.height).toBeLessThan(before + 32);
    await inline.press('End');
    await inline.press('ArrowRight');
    await page
      .getByRole('button', { name: 'Edit display equation: y^2' })
      .click();
    const display = page.getByRole('textbox', { name: 'Display LaTeX source' });
    await expect(display).toBeFocused();
    expect(
      await display.evaluate(
        (node) => node.closest('.cm-editor')!.getBoundingClientRect().height,
      ),
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
  await view
    .getByRole('button', { name: 'Edit inline equation: x \\in \\mathbb{R}' })
    .click();
  let math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.fill('$x \\in \\mathbb{R$');
  await view.getByText('Continue here.', { exact: true }).click();
  await expect(math).toHaveCount(0);
  const invalid = view.locator('.rendered-math-invalid');
  await expect(invalid).toHaveText('$x \\in \\mathbb{R$');
  await expect(invalid.locator('.katex')).toHaveCount(0);
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Still writing.');
  await expect(view).toContainText('Continue here. Still writing.');
  await view
    .getByRole('button', { name: 'Edit inline equation: y', exact: true })
    .click();
  math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.fill('$\\frac{a}{b$');
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(2);
  const badSource = await exportSource(page);
  expect(badSource.toString()).toContain('$x \\in \\mathbb{R$');
  expect(badSource.toString()).toContain('$\\frac{a}{b$');
  await page.reload();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(2);
  await view
    .getByRole('button', {
      name: 'Edit inline equation: x \\in \\mathbb{R',
      exact: true,
    })
    .click();
  math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.press('End');
  await math.press('ArrowLeft');
  await page.keyboard.insertText('}');
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(1);
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(math).toHaveCount(0);
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(1);
  await view.locator('.rendered-math-invalid').getByRole('button').click();
  math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.fill('$\\frac{a}{b}$');
  await view.getByRole('heading', { name: 'Forgiving math' }).click();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(0);
  await expect(view.locator('.katex')).toHaveCount(2);
  const after = await exportSource(page);
  expect(after.toString()).toContain(
    '$x \\in \\mathbb{R}$ and second $\\frac{a}{b}$',
  );
  expect(after.toString()).toContain('Still');
  await page.reload();
  await expect(view.locator('.katex')).toHaveCount(2);
});

test('literal mathematics work budget retains exact source and recovers through source editing and undo', async ({
  page,
}) => {
  const original = '\uFEFF' + '$$draft\r\n'.repeat(1000);
  await importNote(page, original);
  await command(page, 'Preview document');
  const view = page.getByRole('textbox', { name: 'Editable document' });
  await expect(view.locator('pre code')).toContainText('$$draft');
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+a');
  await page.keyboard.insertText('# Recovered\n\n$x^2$');
  await source.press('Control+z');
  expect(await exportSource(page)).toEqual(Buffer.from(original));
  await source.press('Control+Shift+z');
  await command(page, 'Preview document');
  await expect(view.getByRole('heading', { name: 'Recovered' })).toBeVisible();
  await expect(view.locator('.katex')).toHaveCount(1);
});
