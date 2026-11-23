import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const editor = (page: Page) => page.locator('.rendered-editor .ProseMirror');

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

async function importNote(page: Page, source: string, name = 'Editing.mdx') {
  await page.getByLabel('Import note files').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await command(page, 'Preview document');
  await expect(editor(page)).toBeVisible();
}

async function exportedSource(page: Page) {
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await download).path())!, 'utf8');
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
});

test('Preview renders a real editable document with bullets, tasks and centered math', async ({
  page,
}) => {
  const original =
    '# Scientific note\n\nA **bold** paragraph.\n\n- first\n- second\n\n1. one\n2. two\n\n- [ ] pending\n- [x] done\n\n$$\nx^2\n$$\n';
  await importNote(page, original);
  const view = editor(page);
  await expect(view).toHaveAttribute('aria-label', 'Editable document');
  await expect(
    view.getByRole('heading', { name: 'Scientific note' }),
  ).toBeVisible();
  await expect(view.locator('strong')).toHaveText('bold');
  await expect(view.locator('ul').first().locator('li')).toHaveCount(2);
  await expect(view.locator('ol > li')).toHaveCount(2);
  await expect(view.getByRole('checkbox')).toHaveCount(2);
  await expect(view.getByRole('checkbox').first()).not.toBeChecked();
  await expect(view.getByRole('checkbox').last()).toBeChecked();
  await expect(view.locator('.katex-display')).toBeVisible();
  const mathBounds = await view
    .locator('.katex-display .katex-base')
    .first()
    .boundingBox();
  const editorBounds = await view.boundingBox();
  expect(
    Math.abs(
      mathBounds!.x +
        mathBounds!.width / 2 -
        (editorBounds!.x + editorBounds!.width / 2),
    ),
  ).toBeLessThan(4);
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  const paragraph = view.locator('p').filter({ hasText: 'A bold paragraph.' });
  await paragraph.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' More text.');
  await expect(paragraph).toHaveText('A bold paragraph. More text.');
  expect(await exportedSource(page)).toBe(
    original.replace('paragraph.', 'paragraph. More text.'),
  );
  await saved(page);
  await page.reload();
  await expect(editor(page)).toContainText('A bold paragraph. More text.');
});

test('checkbox edits and cross-mode Undo preserve BOM and mixed line endings exactly', async ({
  page,
}) => {
  const original =
    '\uFEFF# Exact 🧠\r\n\r\n- [ ] pending\r\n- [x] complete\n\r\nUntouched tail.\r';
  await importNote(page, original);
  await editor(page).getByRole('checkbox').first().check();
  expect(await exportedSource(page)).toBe(
    original.replace('- [ ] pending', '- [x] pending'),
  );
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).press('Control+z');
  expect(await exportedSource(page)).toBe(original);
  await command(page, 'Preview document');
  await expect(editor(page).getByRole('checkbox').first()).not.toBeChecked();
  await editor(page).press('Control+Shift+z');
  await expect(editor(page).getByRole('checkbox').first()).toBeChecked();
  expect(await exportedSource(page)).toBe(
    original.replace('- [ ] pending', '- [x] pending'),
  );
});

test('formatted editing supports bold text, list continuation and Markdown heading input', async ({
  page,
}) => {
  await importNote(page, 'Make this bold.\n');
  const view = editor(page);
  await view.click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+b');
  await expect(view.locator('strong')).toHaveText('Make this bold.');
  expect(await exportedSource(page)).toContain('**Make this bold.**');

  await importNote(page, '- first\n- second\n', 'Lists.md');
  await editor(page).locator('li').last().click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.insertText('third');
  await expect(editor(page).locator('li')).toHaveCount(3);
  expect(await exportedSource(page)).toMatch(/^- third$/m);

  await importNote(page, '', 'Heading.md');
  await editor(page).click();
  await page.keyboard.type('## ');
  await page.keyboard.insertText('New heading');
  await expect(
    editor(page).getByRole('heading', { level: 2, name: 'New heading' }),
  ).toBeVisible();
  expect(await exportedSource(page)).toContain('## New heading');
});

test('table cells and equations can be edited in the rendered document', async ({
  page,
}) => {
  const original =
    '| Quantity | Value |\n| --- | --- |\n| Energy | Old value |\n\nA result $x^2$.\n';
  await importNote(page, original);
  const cell = editor(page).getByRole('cell').nth(1);
  await expect(cell).toHaveText('Old value');
  await cell.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' updated');
  await expect(cell).toHaveText('Old value updated');
  const afterCell = await exportedSource(page);
  expect(afterCell).toContain('Old value updated');
  expect(afterCell).toContain('A result $x^2$.');

  await editor(page)
    .getByRole('button', { name: 'Edit inline equation: x^2' })
    .click();
  const latex = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(latex).toHaveValue('$x^2$');
  await expect(
    page.getByRole('dialog', { name: 'Edit equation' }),
  ).toHaveCount(0);
  await latex.fill('$x^3 + 1$');
  await latex.press('Enter');
  expect(await exportedSource(page)).toBe(
    afterCell.replace('$x^2$', '$x^3 + 1$'),
  );
});

test('an unsaved equation draft survives another tab moving its note to Trash', async ({
  page,
  context,
}) => {
  const original = 'Preserve my draft: $x^2$.\n';
  await importNote(page, original);
  await saved(page);
  const other = await context.newPage();
  await other.goto('/');
  await saved(other);
  await editor(page)
    .getByRole('button', { name: 'Edit inline equation: x^2' })
    .click();
  const latex = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await latex.fill('$x^7 + 1$');

  await other.getByRole('button', { name: 'Open right panel' }).click();
  await other
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  await other
    .getByRole('dialog', { name: 'Document actions', exact: true })
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await other
    .getByRole('dialog', { name: 'Move to Trash', exact: true })
    .getByRole('button', { name: 'Move to Trash', exact: true })
    .click();
  await saved(other);

  // Observe real storage calls without replacing their results. A pending
  // widget draft must prevent a focus refresh from even starting its read.
  const refreshReads = await page.evaluate(() => {
    const open = indexedDB.open;
    let calls = 0;
    indexedDB.open = function (name: string, version?: number) {
      calls++;
      return open.call(indexedDB, name, version);
    };
    try {
      window.dispatchEvent(new Event('focus'));
      return calls;
    } finally {
      indexedDB.open = open;
    }
  });
  expect(refreshReads).toBe(0);
  await expect(latex).toHaveValue('$x^7 + 1$');
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Editing');

  // Applying the local draft preserves it and reports the genuine concurrent
  // content conflict, instead of silently overwriting the remote Trash change.
  await latex.press('Enter');
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'conflict',
  );
  expect(await exportedSource(page)).toBe(
    original.replace('$x^2$', '$x^7 + 1$'),
  );
  await other.close();
});

test('editable Markdown coexists with interactive React without granting source authority', async ({
  page,
}) => {
  const original = `import {useState} from 'react'

export function Counter(){const [count,setCount]=useState(0);return <button onClick={()=>{parent.postMessage({type:'save',source:'FORGED'},'*');parent.postMessage({type:'edit',source:'FORGED'},'*');setCount(count+1)}}>Count: {count}</button>}

# Mixed document

Editable paragraph.

<Counter />
`;
  await importNote(page, original);
  const runtime = page.frameLocator(
    '.rendered-runtime iframe[title="Document preview"]',
  );
  const iframe = page.locator(
    '.rendered-runtime iframe[title="Document preview"]',
  );
  await expect(runtime.getByRole('button', { name: 'Count: 0' })).toBeVisible({
    timeout: 20_000,
  });
  await expect(iframe).toHaveAttribute('sandbox', 'allow-scripts');
  await runtime.getByRole('button', { name: 'Count: 0' }).click();
  await expect(runtime.getByRole('button', { name: 'Count: 1' })).toBeVisible();
  expect(await exportedSource(page)).toBe(original);
  await editor(page)
    .locator('p')
    .filter({ hasText: 'Editable paragraph.' })
    .click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Changed.');
  expect(await exportedSource(page)).toBe(
    original.replace('Editable paragraph.', 'Editable paragraph. Changed.'),
  );
  await expect(runtime.getByRole('button', { name: 'Count: 1' })).toBeVisible({
    timeout: 20_000,
  });
});

test('rendered editing remains usable on a narrow viewport', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await importNote(page, '# Mobile\n\nA narrow note.\n\n- [ ] Task\n');
  await editor(page).locator('p').filter({ hasText: 'A narrow note.' }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Updated.');
  await editor(page).getByRole('checkbox').check();
  const source = await exportedSource(page);
  expect(source).toContain('A narrow note. Updated.');
  expect(source).toContain('- [x] Task');
  expect(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth + 1,
    ),
  ).toBe(true);
});

test('Markdown HTML and pasted markup cannot execute code or load remote assets in the host', async ({
  page,
}) => {
  const requests: string[] = [];
  page.on('request', (request) => {
    if (request.url().includes('probe.invalid')) requests.push(request.url());
  });
  const original =
    '# Safe note\n\n<script>window.__hostInjected = true</script>\n\n<img src="https://probe.invalid/remote.png" onerror="window.__hostInjected = true">\n\n[Unsafe link](javascript:alert(1))\n';
  await importNote(page, original, 'Safe.md');
  const view = editor(page);
  await expect(view.locator('script')).toHaveCount(0);
  await expect(view.locator('img[src^="https:"]')).toHaveCount(0);
  await expect(view.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(await exportedSource(page)).toBe(original);

  await view.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Enter');
  await view.evaluate((element) => {
    const data = new DataTransfer();
    data.setData('text/plain', 'Pasted safe text');
    data.setData(
      'text/html',
      '<p>Pasted <strong>safe</strong> text<img src="https://probe.invalid/paste.png" onerror="window.__hostInjected=true"><script>window.__hostInjected=true</script><a href="javascript:alert(1)">link</a></p>',
    );
    const event = new ClipboardEvent('paste', {
      bubbles: true,
      cancelable: true,
      clipboardData: data,
    });
    // Firefox substitutes an empty transfer for the constructor argument on
    // synthetic events. Supply the identical fixture bytes in every engine.
    Object.defineProperty(event, 'clipboardData', { value: data });
    if (event.clipboardData?.getData('text/plain') !== 'Pasted safe text')
      throw new Error('The clipboard fixture did not retain its payload.');
    element.dispatchEvent(event);
  });
  await expect(view).toContainText('Pasted safe text');
  await expect(view.locator('script')).toHaveCount(0);
  await expect(view.locator('img[src^="https:"]')).toHaveCount(0);
  await expect(view.locator('a[href^="javascript:"]')).toHaveCount(0);
  expect(requests).toEqual([]);
  expect(
    await page.evaluate(() =>
      Object.prototype.hasOwnProperty.call(window, '__hostInjected'),
    ),
  ).toBe(false);
});

test('full document execution keeps shared React module state and returns to editable Preview', async ({
  page,
}) => {
  const source = `import {useSyncExternalStore} from 'react'

export let count = 0
export const listeners = new Set()
export function Increase(){return <button onClick={()=>{count++;listeners.forEach(update=>update())}}>Increase shared value</button>}
export function ReadValue(){const value=useSyncExternalStore(update=>{listeners.add(update);return()=>listeners.delete(update)},()=>count);return <p>Shared value: {value}</p>}

# Shared runtime

<Increase />

<ReadValue />
`;
  await importNote(page, source);
  await page.getByRole('button', { name: 'Open right panel' }).click();
  const controls = page.getByRole('region', { name: 'Preview controls' });
  await controls.getByRole('button', { name: 'Run full document' }).click();
  const runtime = page.frameLocator(
    '.web-preview-panel iframe[title="Document preview"]',
  );
  await expect(
    runtime.getByRole('heading', { name: 'Shared runtime' }),
  ).toBeVisible({
    timeout: 20_000,
  });
  await expect(
    runtime.getByText('Shared value: 0', { exact: true }),
  ).toBeVisible();
  await runtime.getByRole('button', { name: 'Increase shared value' }).click();
  await expect(
    runtime.getByText('Shared value: 1', { exact: true }),
  ).toBeVisible();
  await expect(editor(page)).toBeHidden();
  await controls
    .getByRole('button', { name: 'Edit rendered document' })
    .click();
  await expect(editor(page)).toBeVisible();
  await expect(
    editor(page).getByRole('heading', { name: 'Shared runtime' }),
  ).toBeVisible();
  expect(await exportedSource(page)).toBe(source);
});

test('composed rendered text and browser history input survive export and reload', async ({
  page,
}) => {
  const original = 'Original paragraph.';
  const replacement = 'Composed café, e\u0301 and 🧠 in editable Preview.';
  await importNote(page, original);
  const view = editor(page);
  // Firefox's contenteditable fill uses composition events. The DOM insertion
  // must survive the source bridge and React updates before it is observed.
  await view.fill(replacement);
  await expect(view).toHaveText(replacement);
  expect(await exportedSource(page)).toBe(replacement);
  const undoHandled = await view.evaluate((element) =>
    element.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'historyUndo',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(undoHandled).toBe(false);
  await expect(view).toHaveText(original);
  expect(await exportedSource(page)).toBe(original);
  const redoHandled = await view.evaluate((element) =>
    element.dispatchEvent(
      new InputEvent('beforeinput', {
        inputType: 'historyRedo',
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(redoHandled).toBe(false);
  await expect(view).toHaveText(replacement);
  await saved(page);
  await page.reload();
  await expect(editor(page)).toHaveText(replacement);
  expect(await exportedSource(page)).toBe(replacement);
});

test('Shift+Enter inserts a real Markdown hard break within the paragraph', async ({
  page,
}) => {
  await importNote(page, 'First line.');
  await editor(page).click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.insertText('Second line.');
  await expect(editor(page).locator('p')).toHaveCount(1);
  await expect(editor(page).locator('p > br')).toHaveCount(1);
  const source = await exportedSource(page);
  expect(source).toMatch(/First line\.(?:\\| {2})\r?\nSecond line\./);
  await saved(page);
  await page.reload();
  await expect(editor(page).locator('p > br')).toHaveCount(1);
  await expect(editor(page)).toContainText('Second line.');
});

test('clicking outside a focused inline equation commits its dollar-delimited source without a popup', async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const source = '# Math in context\n\nTry $x^2$ here.\n';
  await importNote(page, source);
  await editor(page)
    .getByRole('button', { name: 'Edit inline equation: x^2' })
    .click();
  const latex = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(latex).toHaveValue('$x^2$');
  await latex.fill('$x^3$');
  await editor(page).getByRole('heading', { name: 'Math in context' }).click();
  await expect(latex).toHaveCount(0);
  await expect(
    editor(page).getByRole('button', { name: 'Edit inline equation: x^3' }),
  ).toBeVisible();
  expect(await exportedSource(page)).toBe(source.replace('x^2', 'x^3'));
});
