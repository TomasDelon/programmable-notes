import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const editor = (page: Page) => page.locator('.rendered-editor .ProseMirror');

// Only synthetic test documents are inspected. On failure, expose the owner's
// explicit reason in CI annotations instead of hiding it inside a trace ZIP.
async function typingDiagnostics(page: Page) {
  const view = editor(page);
  const messages = await page
    .getByRole('region', { name: 'Notifications' })
    .allTextContents();
  const recovery = page
    .getByRole('alert')
    .filter({ hasText: 'Your edit was kept for recovery.' });
  let reason = '';
  if (await recovery.count()) {
    await recovery
      .getByRole('button', { name: 'Details', exact: true })
      .click();
    reason = await page
      .getByRole('dialog', { name: 'Notification details' })
      .innerText();
    await page
      .getByRole('button', { name: 'Close details', exact: true })
      .click();
  }
  return JSON.stringify({
    document: (await view.innerText()).slice(-3000),
    messages,
    reason,
  });
}

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  try {
    await expect(palette).toBeVisible({ timeout: 5000 });
  } catch (error) {
    throw new Error(String(error) + '\n' + (await typingDiagnostics(page)), {
      cause: error,
    });
  }
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

for (const marker of ['1.', '-', '*', '+']) {
  test(`typing ${marker} space starts a list in a mixed MDX document`, async ({
    page,
  }) => {
    const original =
      '\uFEFF# Writing\r\n\r\nStart here.\r\n\r\n<span data-opaque="kept">Opaque</span>\r\n';
    await importNote(page, original);
    await editor(page).getByText('Start here.', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await page.keyboard.type(marker + ' first');
    await expect(editor(page).locator('li')).toContainText('first');
    await expect(
      page.getByText('This edit cannot be represented faithfully', {
        exact: false,
      }),
    ).toHaveCount(0);
    expect(await exportedSource(page)).toContain(
      '<span data-opaque="kept">Opaque</span>\r\n',
    );
  });
}

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
  await expect(latex).toHaveText('$x^2$');
  await expect(page.getByRole('dialog', { name: 'Edit equation' })).toHaveCount(
    0,
  );
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
  await expect(latex).toHaveText('$x^7 + 1$');
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

test('an equation opened during a real focus read prevents stale workspace adoption', async ({
  page,
  context,
}) => {
  const original = 'Keep $x^2$.\n\nLocal tail.\n';
  await importNote(page, original);
  await saved(page);
  const other = await context.newPage();
  await other.goto('/');
  await saved(other);
  await command(other, 'Edit source');
  await other
    .getByRole('textbox', { name: 'MDX source' })
    .fill('Keep $x^2$.\n\nRemote tail.\n');
  await saved(other);

  // Hold only delivery of the real database-open result. All data, checksums,
  // transactions and final CAS writes still come from actual IndexedDB.
  await page.evaluate(() => {
    const probe = window as Window & {
      __releaseFocusRead?: () => void;
      __focusReadClosed?: boolean;
    };
    const open = indexedDB.open;
    indexedDB.open = function (name: string, version?: number) {
      const request = open.call(indexedDB, name, version);
      if (name === 'programmable-notes-web-v1') {
        indexedDB.open = open;
        request.addEventListener('success', (event) => {
          event.stopImmediatePropagation();
          const database = request.result;
          const close = database.close.bind(database);
          database.close = () => {
            close();
            probe.__focusReadClosed = true;
          };
          probe.__releaseFocusRead = () => {
            delete probe.__releaseFocusRead;
            request.onsuccess?.call(request, event);
          };
        });
      }
      return request;
    };
    window.dispatchEvent(new Event('focus'));
  });
  await page.waitForFunction(
    () =>
      typeof (window as Window & { __releaseFocusRead?: () => void })
        .__releaseFocusRead === 'function',
  );
  await editor(page)
    .getByRole('button', { name: 'Edit inline equation: x^2' })
    .click();
  const field = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await field.fill('$x^7 + 1$');
  await page.evaluate(() =>
    (window as Window & { __releaseFocusRead?: () => void })
      .__releaseFocusRead!(),
  );
  await page.waitForFunction(
    () =>
      (window as Window & { __focusReadClosed?: boolean }).__focusReadClosed,
  );
  // A late open also closes after the storage watchdog fires. That is not a
  // successful refresh: assert its error was not mistaken for race protection.
  await saved(page);
  await expect(field).toHaveText('$x^7 + 1$');
  await expect(editor(page)).toContainText('Local tail.');
  await field.press('Enter');
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'conflict',
  );
  expect(await exportedSource(page)).toBe('Keep $x^7 + 1$.\n\nLocal tail.\n');
  expect(await exportedSource(other)).toBe('Keep $x^2$.\n\nRemote tail.\n');
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
  await expect(latex).toHaveText('$x^2$');
  await latex.fill('$x^3$');
  await editor(page).getByRole('heading', { name: 'Math in context' }).click();
  await expect(latex).toHaveCount(0);
  await expect(
    editor(page).getByRole('button', { name: 'Edit inline equation: x^3' }),
  ).toBeVisible();
  expect(await exportedSource(page)).toBe(source.replace('x^2', 'x^3'));
});

test('Markdown keyboard authoring handles lists, nesting, headings, formatting and exact history without a toolbar', async ({
  page,
}) => {
  const original =
    '\uFEFF# Writing\r\n\r\nStart here.\r\n\r\n<span data-kept="yes">Opaque JSX</span>\r\n';
  await importNote(page, original);
  await expect(
    page.getByRole('toolbar', { name: 'Text formatting' }),
  ).toHaveCount(0);
  const view = editor(page);
  await view.getByText('Start here.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await expect(
    view.locator('ol > li'),
    await typingDiagnostics(page),
  ).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('ordered nested');
  await expect(view.locator('ol ol li')).toHaveText('ordered nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- bullet');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  await expect(view.locator('ul ul li')).toHaveText('nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## New heading');
  await expect(
    view.getByRole('heading', { level: 2, name: 'New heading' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('**bold** and *italic* with `code`.');
  await expect(view.locator('strong')).toHaveText('bold');
  await expect(view.locator('em')).toHaveText('italic');
  await expect(
    view.locator('code').filter({ hasText: 'code' }),
    await view.innerText(),
  ).toHaveText('code');
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByRole('textbox', { name: 'Link URL' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  const after = await exportedSource(page);
  expect(after.startsWith('\uFEFF# Writing\r\n\r\nStart here.\r\n')).toBe(true);
  expect(after.endsWith('<span data-kept="yes">Opaque JSX</span>\r\n')).toBe(
    true,
  );
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+z');
  expect(await exportedSource(page)).not.toBe(after);
  await source.press('Control+Shift+Z');
  expect(await exportedSource(page)).toBe(after);
  await saved(page);
  await page.reload();
  await command(page, 'Preview document');
  await expect(
    editor(page).getByRole('heading', { name: 'New heading', exact: true }),
  ).toBeVisible();
  expect(await exportedSource(page)).toBe(after);
});

for (const width of [1440, 820, 390]) {
  test(`minimal error notifications keep the document stable at ${width}px`, async ({
    page,
    browserName,
  }) => {
    await page.setViewportSize({ width, height: 900 });
    const source =
      "import {useState} from 'react'\n\nexport function Probe(){const [n,setN]=useState(0);return <><button onClick={()=>setN(n+1)}>Counter: {n}</button><button onClick={()=>{throw new Error('Notification demonstration')}}>Trigger error</button></>}\n\n# A quiet document\n\nWrite here.\n\n<Probe />\n";
    await importNote(page, source);
    const view = editor(page);
    const frame = page.frameLocator('iframe[title="Document preview"]');
    await frame.getByRole('button', { name: 'Counter: 0' }).click();
    await expect(
      frame.getByRole('button', { name: 'Counter: 1' }),
    ).toBeVisible();
    const before = await view.boundingBox();
    await frame.getByRole('button', { name: 'Trigger error' }).click();
    const notice = page
      .getByRole('alert')
      .filter({ hasText: 'Preview needs attention' });
    await expect(notice).toHaveCount(1);
    await view.getByText('Write here.', { exact: true }).click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Continue writing.');
    await expect(view).toBeFocused();
    await expect(
      page.getByRole('button', { name: 'Review draft' }),
      await typingDiagnostics(page),
    ).toHaveCount(0);
    await expect(view.locator('[role="alert"]')).toHaveCount(0);
    await expect(
      page.getByRole('toolbar', { name: 'Text formatting' }),
    ).toHaveCount(0);
    expect((await view.boundingBox())!.y).toBe(before!.y);
    expect(await exportedSource(page)).toBe(
      source.replace('Write here.', 'Write here.&#32;Continue&#32;writing.'),
    );
    await expect(
      frame.getByRole('button', { name: 'Counter: 1' }),
    ).toBeVisible();
    const path = test.info().outputPath(`preview-notifications-${width}.png`);
    await page.screenshot({ path, fullPage: true, animations: 'disabled' });
    await test
      .info()
      .attach(`Preview ${width}px`, { path, contentType: 'image/png' });
    await notice.getByRole('button', { name: 'Details' }).click();
    await expect(
      page.getByRole('dialog', { name: 'Notification details' }),
    ).toContainText(
      browserName === 'webkit' ? 'Script error.' : 'Notification demonstration',
    );
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog')).toHaveCount(0);
    if (width === 1440) {
      await command(page, 'Settings');
      await expect(
        page.getByRole('dialog', { name: 'Settings', exact: true }),
      ).toBeVisible();
      await notice.getByRole('button', { name: 'Details' }).click();
      await expect(
        page.getByRole('dialog', { name: 'Notification details' }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
      await expect(
        page.getByRole('dialog', { name: 'Notification details' }),
      ).toHaveCount(0);
      await expect(
        page.getByRole('dialog', { name: 'Settings', exact: true }),
      ).toBeVisible();
      await page.keyboard.press('Escape');
    }
  });
}

test('excessive whitespace opens as exact Source and remains editable without synchronous visual parsing', async ({
  page,
}) => {
  const source = '\uFEFFa' + ' '.repeat(20_000) + 'b\r\n';
  await importNote(page, source);
  await expect(editor(page).locator('.rendered-source-block')).toHaveCount(1);
  await command(page, 'Edit source');
  const raw = page.getByRole('textbox', { name: 'MDX source' });
  await expect(raw).toBeVisible();
  expect(await exportedSource(page)).toBe(source);
  await raw.press('Control+End');
  await page.keyboard.insertText('Tail.');
  expect(await exportedSource(page)).toBe(source + 'Tail.');
});

test('a visual work-budget refusal retains an exact downloadable draft until explicit discard', async ({
  page,
}) => {
  const source =
    '\uFEFFParagraph.\r\n\r\n<span data-kept="yes">Opaque JSX</span>\r\n';
  const inserted = ' '.repeat(8193) + 'next';
  await importNote(page, source);
  const view = editor(page);
  await view.getByText('Paragraph.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(inserted);
  await expect(view).toContainText('Paragraph.');
  await expect(view.locator('[role="alert"]')).toHaveCount(0);
  await page.getByRole('button', { name: 'Review draft' }).click();
  const modal = page.getByRole('dialog', { name: 'Retained edit' });
  await expect(modal).toBeVisible();
  const pending = page.waitForEvent('download');
  await modal.getByRole('button', { name: 'Download retained source' }).click();
  const download = await pending;
  expect(readFileSync((await download.path())!, 'utf8')).toBe(
    source.replace('Paragraph.', 'Paragraph.' + inserted),
  );
  await expect(modal).toBeVisible();
  await modal.getByRole('button', { name: 'Discard retained draft' }).click();
  expect(await exportedSource(page)).toBe(source);
  await view.getByText('Paragraph.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' Safe.');
  expect(await exportedSource(page)).toBe(
    source.replace('Paragraph.', 'Paragraph. Safe.'),
  );
});
