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
  const paragraph = page.getByRole('button', {
    name: 'Kept paragraph.',
    exact: true,
  });
  await paragraph.waitFor();
  assert.equal(
    await page.getByLabel('Document status').textContent(),
    'Source unchanged',
  );
  assert.equal(
    await page.getByLabel('Workspace status').textContent(),
    '1 other source has unsaved changes.',
  );
  await paragraph.click();
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
  assert.equal(
    await page.getByLabel('Document status').textContent(),
    'Source download requested.',
  );
  assert.equal(
    await page.getByLabel('Workspace status').textContent(),
    '1 other source has unsaved changes.',
  );
  const mixed =
    '\uFEFF# Mixed\r\n\r\nFirst line\nSecond line\r\nThird line\n\n<div>Opaque</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'mixed.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(mixed),
  });
  await page
    .getByRole('button', { name: /^First line Second line Third line$/ })
    .click();
  await field.fill('Edited line\nSecond line\nThird line');
  await field.press('Enter');
  const mixedDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await mixedDownload).path()),
    Buffer.from(mixed.replace('First', 'Edited')),
  );
  const repeated = 'Same\nSame\r\nSame\n\n<div>Opaque</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'repeated.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(repeated),
  });
  await page.getByRole('button', { name: /^Same Same Same$/ }).click();
  await field.fill('Same\nSame');
  await field.press('Enter');
  await page
    .getByRole('alert')
    .filter({ hasText: 'ambiguous line endings' })
    .waitFor();
  assert.equal(await field.inputValue(), 'Same\nSame');
  assert.equal(
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .isEnabled(),
    false,
  );
  await field.press('Escape');
  const unchanged = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await unchanged).path()),
    Buffer.from(repeated),
  );
  const longParagraph = Array.from(
    { length: 1000 },
    (_, i) => `Line ${i}: source remains exact.`,
  ).join('\n');
  const longSource =
    '# Long paragraph\n\n' + longParagraph + '\n\n<div>Opaque</div>\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'long-note.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(longSource),
  });
  await page
    .getByRole('region', { name: 'Markdown editing' })
    .locator('p button')
    .first()
    .click();
  assert.equal(await field.inputValue(), longParagraph);
  assert.ok(
    await field.evaluate(
      (e) =>
        e.getBoundingClientRect().height <=
          e.ownerDocument.defaultView.innerHeight * 0.75 &&
        e.scrollHeight > e.clientHeight + 1000,
    ),
  );
  await field.press('Control+End');
  assert.ok(await field.evaluate((e) => e.scrollTop > 0));
  await page.keyboard.insertText(' Tail saved.');
  await field.press('Enter');
  const longDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await longDownload).path()),
    Buffer.from(
      longSource.replace(longParagraph, longParagraph + ' Tail saved.'),
    ),
  );
  const quoteSource =
    '\uFEFF# Quote\r\n\r\n  >\tQuoted café 😀.\r\n\r\n<div>Opaque</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'quoted.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(quoteSource),
  });
  await page
    .getByRole('region', { name: 'Markdown editing' })
    .locator('blockquote button')
    .click();
  await field.fill('Changed quote: café 😀.');
  await field.press('Enter');
  const quoteDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await quoteDownload).path()),
    Buffer.from(
      quoteSource.replace('Quoted café 😀.', 'Changed quote: café 😀.'),
    ),
  );
  const multiline =
    '\uFEFF# Multiline quote\r\n\r\n  >  First café 😀.\r\n >\tSecond line.\n> Third line.\r\n\r\n<div>Opaque JSX</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'multiline.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(multiline),
  });
  const quoteButton = page
    .getByRole('region', { name: 'Markdown editing' })
    .locator('blockquote button');
  await quoteButton.click();
  assert.equal(
    await field.inputValue(),
    'First café 😀.\nSecond line.\nThird line.',
  );
  await field.fill('First café 😀.\nChanged continuation.\nThird line.');
  await field.press('Enter');
  const multilineDownload = page.waitForEvent('download');
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  assert.deepEqual(
    await readFile(await (await multilineDownload).path()),
    Buffer.from(multiline.replace('Second line.', 'Changed continuation.')),
  );
  await quoteButton.click();
  await field.fill('One\nTwo');
  await field.press('Enter');
  await page
    .getByRole('region', { name: 'Markdown editing' })
    .getByRole('alert')
    .waitFor();
  assert.equal(await field.inputValue(), 'One\nTwo');
  assert.equal(
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .isEnabled(),
    false,
  );
  await field.press('Escape');
  console.log(
    'REVIEW_BROWSER_PASS extracted_build_react_new_note_trusted_key_save_pending_guard_bom_exact_offline_recompile_selected_status_dirty_sibling_internal_breaks_ambiguous_refusal_bounded_long_input_literal_and_multiline_quotes',
  );
} finally {
  await browser.close();
}
