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
  await command(page, 'Edit source');
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill(original.replace('$x^2$', '$\\mathbb{R}$'));
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
  // Keep the source-only declarations as a prefix; selection must refer to the
  // visible body, not to invisible imports/exports preceding it.
  const exact = original.replace('{/* Hidden comment */}\r\n\r\n', '');
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).fill(exact);
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByRole('heading', { name: 'Components', exact: true }).click();
  await page.keyboard.press('Home');
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
  await expect(
    view.getByRole('heading', { name: 'Components', exact: true }),
  ).toBeVisible();
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
  await command(page, 'Edit source');
  await page.getByRole('textbox', { name: 'MDX source' }).fill(broken);
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
