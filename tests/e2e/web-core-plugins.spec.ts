import { expect, test, type Page } from '@playwright/test';
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
async function settings(page: Page) {
  await command(page, 'Settings');
  return page.getByRole('dialog', { name: 'Settings', exact: true });
}
async function closeSettings(page: Page) {
  await page
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
}
const original =
  '\uFEFFimport {useState} from "react"\r\n\r\nexport const label = "Private setup text"\r\n\r\nexport function Counter(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Count {n}</button>}\r\n\r\n# Components\r\n\r\nA result $x^2$.\r\n\r\n{/* Hidden comment */}\r\n\r\n<Counter />\r\n';

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Plugins.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect(
    page.getByRole('heading', { name: 'Document title' }),
  ).toHaveText('Plugins');
  await command(page, 'Preview document');
});

test('setup is invisible, source is optional ordinary code and JSX stays interactive', async ({
  page,
}) => {
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view.getByText('Component setup', { exact: true })).toHaveCount(
    0,
  );
  await expect(
    view.getByRole('button', { name: /Edit (component source|source block)/ }),
  ).toHaveCount(0);
  await expect(view.locator('pre:visible')).toHaveCount(0);
  const frame = page.frameLocator('iframe[title="Document preview"]');
  await frame.getByRole('button', { name: 'Count 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count 1', exact: true }),
  ).toBeVisible();
  const dialog = await settings(page);
  await dialog
    .getByRole('checkbox', { name: 'Show component source in Preview' })
    .check();
  await closeSettings(page);
  await expect(
    view.locator('pre').filter({ hasText: 'export function Counter' }),
  ).toBeVisible();
  await expect(
    view.locator('pre').filter({ hasText: '<Counter />' }),
  ).toBeVisible();
  await expect(
    frame.getByRole('button', { name: 'Count 1', exact: true }),
  ).toBeVisible();
  const downloaded = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await downloaded).path())!)).toEqual(
    Buffer.from(original),
  );
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  await expect(
    view.locator('pre').filter({ hasText: 'export function Counter' }),
  ).toBeVisible();
});

test('core plugins can be disabled independently, persist and do not rewrite source', async ({
  page,
}) => {
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view.locator('.katex')).toBeVisible();
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(1);
  let dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'React components' }).uncheck();
  await closeSettings(page);
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  await expect(view.locator('.katex')).toBeVisible();
  dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).uncheck();
  await closeSettings(page);
  await expect(view.locator('.katex')).toHaveCount(0);
  await expect(view).toContainText('$x^2$');
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  await page.reload();
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  await expect(view.locator('.katex')).toHaveCount(0);
  dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'React components' }).check();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).check();
  await closeSettings(page);
  await expect(
    page
      .frameLocator('iframe[title="Document preview"]')
      .getByRole('button', { name: 'Count 0', exact: true }),
  ).toBeVisible();
  await expect(view.locator('.katex')).toBeVisible();
});

test('disabled mathematics stays literal in the full React runtime and disabled React terminates it', async ({
  page,
}) => {
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Literal runtime.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original.replace('$x^2$', '$\\mathbb{R}$')),
  });
  await expect(
    page.getByRole('heading', { name: 'Document title' }),
  ).toHaveText('Literal runtime');
  await command(page, 'Preview document');
  let dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).uncheck();
  await closeSettings(page);
  await page.getByRole('button', { name: 'Open right panel' }).click();
  await page
    .getByRole('button', { name: 'Run full document', exact: true })
    .click();
  await expect(page.locator('.rendered-runtime iframe')).toHaveCount(0);
  const frame = page.frameLocator(
    '.web-preview-panel iframe[title="Document preview"]',
  );
  await expect(frame.locator('body')).toContainText('$\\mathbb{R}$');
  await frame.getByRole('button', { name: 'Count 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count 1', exact: true }),
  ).toBeVisible();
  dialog = await settings(page);
  await dialog
    .getByRole('checkbox', { name: 'Show component source in Preview' })
    .check();
  await closeSettings(page);
  await expect(
    frame.locator('pre').filter({ hasText: 'export function Counter' }),
  ).toBeVisible();
  dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'React components' }).uncheck();
  await closeSettings(page);
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  await expect(page.locator('.rendered-editor .ProseMirror')).toBeVisible();
});

test('preview messages cannot change core settings or expose underlying source', async ({
  page,
}) => {
  const frame = page.frameLocator('iframe[title="Document preview"]');
  await expect(
    frame.getByRole('button', { name: 'Count 0', exact: true }),
  ).toBeVisible();
  await frame.locator('body').evaluate(() => {
    parent.postMessage(
      {
        type: 'settings',
        corePlugins: { react: false },
        previewPreferences: { showComponentSource: true },
      },
      '*',
    );
    parent.postMessage(
      { type: 'set-plugin', id: 'react', enabled: false },
      '*',
    );
  });
  await frame.getByRole('button', { name: 'Count 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count 1', exact: true }),
  ).toBeVisible();
  await expect(page.locator('.rendered-editor pre:visible')).toHaveCount(0);
  const dialog = await settings(page);
  await expect(
    dialog.getByRole('checkbox', { name: 'Show component source in Preview' }),
  ).not.toBeChecked();
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await expect(
    dialog.getByRole('checkbox', { name: 'React components' }),
  ).toBeChecked();
});

test('hidden setup survives boundary Backspace and selecting/replacing the visible document', async ({
  page,
}) => {
  // Failure diagnostics use only synthetic fixture metadata, never user data.
  await page.evaluate(() => {
    const events: unknown[] = [];
    (
      window as unknown as { __pnSelectionEvents: unknown[] }
    ).__pnSelectionEvents = events;
    for (const type of [
      'keydown',
      'beforeinput',
      'input',
      'compositionstart',
      'compositionend',
      'pn-source-change',
    ]) {
      document.addEventListener(
        type,
        (event) => {
          if (event instanceof KeyboardEvent && event.key.toLowerCase() !== 'z')
            return;
          const target = event.target instanceof Element ? event.target : null;
          queueMicrotask(() => {
            events.push({
              type,
              key: event instanceof KeyboardEvent ? event.key : null,
              ctrl: event instanceof KeyboardEvent ? event.ctrlKey : null,
              meta: event instanceof KeyboardEvent ? event.metaKey : null,
              keyCode: event instanceof KeyboardEvent ? event.keyCode : null,
              active: document.activeElement?.getAttribute('aria-label'),
              composing:
                event instanceof InputEvent || event instanceof KeyboardEvent
                  ? event.isComposing
                  : null,
              inputType: event instanceof InputEvent ? event.inputType : null,
              prevented: event.defaultPrevented,
              target: target?.getAttribute('aria-label'),
              sourceHasReplacement: document
                .querySelector('[aria-label="MDX source"]')
                ?.textContent?.includes('Replacement body.'),
            });
            if (events.length > 40) events.shift();
          });
        },
        true,
      );
    }
  });
  // Keep the source-only declarations as a prefix; selection must refer to the
  // visible body, not to invisible imports/exports preceding it.
  const exact = original.replace('{/* Hidden comment */}\r\n\r\n', '');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Boundary.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(exact),
  });
  await expect(
    page.getByRole('heading', { name: 'Document title' }),
  ).toHaveText('Boundary');
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByRole('heading', { name: 'Components', exact: true }).click();
  await page.keyboard.press('Home');
  await expect
    .poll(() =>
      view
        .getByRole('heading', { name: 'Components', exact: true })
        .evaluate((element) => {
          const selection = window.getSelection();
          if (
            !selection?.isCollapsed ||
            !selection.anchorNode ||
            !element.contains(selection.anchorNode)
          )
            return false;
          const prefix = document.createRange();
          prefix.selectNodeContents(element);
          prefix.setEnd(selection.anchorNode, selection.anchorOffset);
          return prefix.toString().length === 0;
        }),
    )
    .toBe(true);
  await page.keyboard.press('Backspace');
  let download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(exact),
  );
  await view.getByRole('heading', { name: 'Components', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Replacement body.');
  await expect(view).toContainText('Replacement body.');
  download = page.waitForEvent('download');
  await command(page, 'Export current source');
  const next = readFileSync((await (await download).path())!).toString();
  expect(next.startsWith(exact.slice(0, exact.indexOf('# Components')))).toBe(
    true,
  );
  expect(next).toContain('Replacement body.');
  expect(next).not.toContain('<Counter />');
  await view.getByText('Replacement body.', { exact: true }).click();
  await page.keyboard.press('Control+z');
  try {
    await expect(
      view.getByRole('heading', { name: 'Components', exact: true }),
    ).toBeVisible();
  } catch {
    const events = await page.evaluate(() =>
      (
        window as unknown as { __pnSelectionEvents: unknown[] }
      ).__pnSelectionEvents.slice(-20),
    );
    download = page.waitForEvent('download');
    await command(page, 'Export current source');
    const canonical = readFileSync((await (await download).path())!).toString();
    throw new Error(
      'Undo heading was not restored; canonical=' +
        JSON.stringify(canonical) +
        '; events=' +
        JSON.stringify(events),
    );
  }
  download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(exact),
  );
  await view.getByRole('heading', { name: 'Components', exact: true }).click();
  await page.keyboard.press('Control+Shift+z');
  await expect(
    view.getByText('Replacement body.', { exact: true }),
  ).toBeVisible();
  download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!).toString()).toBe(next);
  await view.getByText('Replacement body.', { exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.press('PageDown');
  await page.keyboard.insertText(' Page navigation.');
  await expect(view).toContainText('Replacement body.');
  await expect(view).toContainText('Page navigation.');
  // An accepted source-history refresh must also cancel the old selection intent.
  await page.keyboard.press('Control+a');
  await page.keyboard.press('Control+z');
  await expect(view).not.toContainText('Page navigation.');
  await page.keyboard.insertText('After undo. ');
  await expect(view).toContainText('Replacement body.');
  await expect(view).toContainText('After undo.');
  await expect(page.getByRole('alert')).toHaveCount(0);
});

test('hidden setup survives interleaved selection refusal and React-disabled deletion', async ({
  page,
}) => {
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByRole('heading', { name: 'Components', exact: true }).click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Attempt across a hidden comment.');
  await expect(page.getByRole('alert')).toContainText(
    'Your edit was kept for recovery',
  );
  // Inspect canonical Source only after explicit cancellation of the retained draft.
  await page.getByRole('button', { name: 'Review draft' }).click();
  await page.getByRole('button', { name: 'Discard retained draft' }).click();
  let download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(original),
  );
  const dialog = await settings(page);
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog
    .getByRole('checkbox', { name: 'React components', exact: false })
    .uncheck();
  await closeSettings(page);
  await expect(page.locator('iframe')).toHaveCount(0);
  // Hidden JSX at the end is just as protected as setup at the beginning.
  await view.locator('p').filter({ hasText: 'A result' }).click();
  await page.keyboard.press('End');
  await page.keyboard.press('Delete');
  download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(original),
  );
});

test('invalid LaTeX stays red raw source in full-document execution without disabling React', async ({
  page,
}) => {
  const broken = original.replace('$x^2$', '$x \\in \\mathbb{R$');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Invalid runtime.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(broken),
  });
  await expect(
    page.getByRole('heading', { name: 'Document title' }),
  ).toHaveText('Invalid runtime');
  await command(page, 'Preview document');
  await page.getByRole('button', { name: 'Open right panel' }).click();
  await page
    .getByRole('button', { name: 'Run full document', exact: true })
    .click();
  await expect(page.locator('.rendered-runtime iframe')).toHaveCount(0);
  const frame = page.frameLocator('.web-preview-panel iframe');
  const raw = frame.locator('code').filter({ hasText: '$x \\in \\mathbb{R$' });
  await expect(raw).toBeVisible();
  await expect(raw).toHaveCSS('color', 'rgb(195, 59, 69)');
  await frame.getByRole('button', { name: 'Count 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count 1', exact: true }),
  ).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
  const downloaded = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await downloaded).path())!)).toEqual(
    Buffer.from(broken),
  );
});

test('core plugin settings remain usable on narrow screens', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  const dialog = await settings(page);
  const tabs = dialog.getByRole('navigation', { name: 'Settings sections' });
  for (const name of [
    'Workspace',
    'Core plugins',
    'Recovery',
    'Trash',
    'Guide',
  ]) {
    const button = tabs.getByRole('button', { name, exact: true });
    const bounds = await button.boundingBox();
    expect(bounds).not.toBeNull();
    expect(bounds!.x).toBeGreaterThanOrEqual(0);
    expect(bounds!.x + bounds!.width).toBeLessThanOrEqual(390);
  }
  await tabs.getByRole('button', { name: 'Core plugins', exact: true }).click();
  await expect(
    dialog.getByRole('checkbox', { name: 'Mathematics' }),
  ).toBeVisible();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).focus();
  await page.keyboard.press('Space');
  await expect(
    dialog.getByRole('checkbox', { name: 'Mathematics' }),
  ).not.toBeChecked();
  await testInfo.attach('mobile-core-plugin-settings', {
    body: await page.screenshot(),
    contentType: 'image/png',
  });
});
