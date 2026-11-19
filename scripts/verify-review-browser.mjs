/** Exercise the extracted production build through a plain loopback HTTP server. */
import assert from 'node:assert/strict';
import { chromium } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import process from 'node:process';

const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const context = await browser.newContext();
  const page = await context.newPage();
  await page.goto(process.env.REVIEW_DEMO_URL || 'http://127.0.0.1:4190/');
  const frame = page.frameLocator('iframe');
  const counter = frame.getByRole('button', { name: 'Count: 0', exact: true });
  await counter.waitFor({ timeout: 20000 });
  await counter.click();
  await frame.getByRole('button', { name: 'Count: 1', exact: true }).waitFor();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  assert.equal(
    await editor.evaluate(
      (element) => element === element.ownerDocument.activeElement,
    ),
    true,
  );
  const source =
    '# Portable demo\n\nCreated from the extracted review archive.';
  await page.keyboard.insertText(source);
  const pending = page.waitForEvent('download');
  await editor.press('Control+s');
  assert.equal(await readFile(await (await pending).path(), 'utf8'), source);
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await frame
    .getByRole('heading', { name: 'Portable demo', exact: true })
    .waitFor({ timeout: 20000 });
  await context.setOffline(true);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await editor.fill(
    '# Offline portable\n\nNo build workspace or network dependency.',
  );
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await frame
    .getByRole('heading', { name: 'Offline portable', exact: true })
    .waitFor({ timeout: 20000 });
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'No build workspace or network dependency.',
      exact: true,
    })
    .click();
  const field = page.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Pending offline text.');
  assert.equal(
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(await page.getByLabel('Source file').isEnabled(), false);
  await field.press('Escape');
  const bom =
    '\uFEFF# Portable BOM\r\n\r\nKept paragraph.\r\n\r\n<div>Opaque</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'bom.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(bom),
  });
  await page
    .getByRole('button', { name: 'Kept paragraph.', exact: true })
    .click();
  await field.fill('Edited portable paragraph.');
  await field.press('Enter');
  const saved = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await saved).path()),
    Buffer.from(bom.replace('Kept paragraph.', 'Edited portable paragraph.')),
  );
  console.log(
    'REVIEW_BROWSER_PASS extracted_build_react_new_note_trusted_key_save_pending_guard_bom_exact_offline_recompile',
  );
} finally {
  await browser.close();
}
