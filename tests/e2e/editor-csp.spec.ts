import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('authorized editor styles preserve exact space input under a nonced CSP', async ({
  page,
}) => {
  // Tauri adds a nonce for the inline boot style. Its presence makes browsers
  // ignore unsafe-inline; dynamically mounted editor CSS needs that authority.
  const nonce = 'dGVzdC1lZGl0b3Itc3R5bGU=';
  await page.route('**/engine', async (route) => {
    const response = await route.fetch();
    const headers = response.headers();
    delete headers['content-length'];
    await route.fulfill({
      response,
      headers: {
        ...headers,
        'content-security-policy': `style-src 'self' 'nonce-${nonce}' 'unsafe-inline'`,
      },
      body: (await response.text()).replace(
        '</head>',
        `<style nonce="${nonce}">:root{--editor-csp-test:1}</style></head>`,
      ),
    });
  });
  await page.goto('/engine');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await expect(editor).toBeVisible();
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  const whitespace = () =>
    editor.evaluate((element) => getComputedStyle(element).whiteSpace);
  await expect.poll(whitespace).toMatch(/^(pre-wrap|break-spaces)$/);
  // The correction must not obtain its result by permitting all inline styles.
  await page.evaluate(() => {
    const denied = document.createElement('style');
    denied.textContent = '.cm-content{white-space:normal!important}';
    document.head.append(denied);
  });
  await expect.poll(whitespace).toMatch(/^(pre-wrap|break-spaces)$/);

  const original =
    '\uFEFF# Authorized styles\r\n\r\nLiteral\u00a0NBSP stays.\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'nonce-source.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect(editor).toContainText('Literal');
  await editor.press('Control+End');
  await editor.press('Space');
  async function exported() {
    const download = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    return readFileSync((await (await download).path())!);
  }
  expect(await exported()).toEqual(Buffer.from(original + ' '));
  await editor.press('Control+z');
  expect(await exported()).toEqual(Buffer.from(original));
  await editor.press('Control+Shift+z');
  expect(await exported()).toEqual(Buffer.from(original + ' '));
  await page.getByLabel('Open files').setInputFiles({
    name: 'reopened.mdx',
    mimeType: 'text/plain',
    buffer: await exported(),
  });
  expect(await exported()).toEqual(Buffer.from(original + ' '));
});
