import assert from 'node:assert/strict';
import { mkdir, readFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { chromium } from '@playwright/test';

const output = '.cache/editor-demo';
const url = process.env.DEMO_URL || 'http://127.0.0.1:4188/';
await mkdir(output, { recursive: true });
const browser = await chromium.launch({
  executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  const source = await readFile(
    'docs/handoff/samples/fixtures/counter.mdx',
    'utf8',
  );
  await page.goto(url);
  await page.getByLabel('Open files').setInputFiles({
    name: 'lesson.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await page
    .getByLabel('Source file')
    .locator('option', { hasText: 'lesson.mdx' })
    .waitFor({ state: 'attached' });
  const counter = page
    .frameLocator('iframe')
    .getByRole('button', { name: /^Count:/ });
  await counter.waitFor();
  await counter.click();
  await counter.click();
  assert.equal(await counter.textContent(), 'Count: 2');
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await page.getByRole('button', { name: 'Edit rendered Markdown' }).click();
  const paragraph = panel.locator('p button').first();
  const original = await paragraph.textContent();
  assert.ok(original && source.includes(original));
  await paragraph.scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, '01-preview.png'),
    fullPage: true,
  });
  await paragraph.click();
  const inline = panel.getByRole('textbox', { name: 'Paragraph text' });
  const replacement = 'Edited directly in the rendered note.';
  await inline.fill(replacement);
  await page.screenshot({
    path: join(output, '02-inline-edit.png'),
    fullPage: true,
  });
  await inline.press('Enter');
  await page
    .frameLocator('iframe')
    .getByText(replacement, { exact: true })
    .waitFor();
  await panel
    .getByRole('button', { name: replacement, exact: true })
    .scrollIntoViewIfNeeded();
  await page.screenshot({
    path: join(output, '03-updated.png'),
    fullPage: true,
  });
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  const download = await pending;
  await download.saveAs(join(output, 'lesson.mdx'));
  assert.equal(
    await readFile(join(output, 'lesson.mdx'), 'utf8'),
    source.replace(original, replacement),
  );
} finally {
  await browser.close();
}
