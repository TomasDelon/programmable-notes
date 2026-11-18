import assert from 'node:assert/strict';
import { mkdir, readFile, cp, writeFile } from 'node:fs/promises';
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
    recordVideo: { dir: output, size: { width: 1440, height: 1000 } },
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
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
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
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await page
    .frameLocator('iframe')
    .getByText(replacement, { exact: true })
    .waitFor();
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
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
  await cp('docs/ux-evidence/before', join(output, 'before'), {
    recursive: true,
  });
  for (const [device, width, height] of [
    ['desktop', 1440, 1000],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ]) {
    await page.setViewportSize({ width, height });
    for (const mode of ['Source', 'Split', 'Visual']) {
      await page.getByRole('button', { name: mode, exact: true }).click();
      if (mode === 'Split') {
        await counter.waitFor({ state: 'visible' });
        await page.locator('iframe').scrollIntoViewIfNeeded();
      }
      await page.screenshot({
        path: join(output, `${device}-${mode.toLowerCase()}.png`),
        fullPage: true,
      });
    }
  }
  const video = page.video();
  await page.close();
  await video.saveAs(join(output, 'walkthrough.webm'));
  await video.delete();
  await writeFile(
    join(output, 'walkthrough.html'),
    `<!doctype html><meta charset="utf-8"><title>Programmable Notes walkthrough</title><style>body{font:16px system-ui;max-width:72rem;margin:2rem auto;padding:1rem}video,img{max-width:100%}figure{margin:1rem 0}</style><h1>Unified document workspace</h1><p>Source edits exact MDX, Split runs isolated React, Visual edits supported Markdown. The recording exercises the counter, changes a paragraph, saves exact MDX and switches modes at three sizes.</p><video src="walkthrough.webm" controls aria-label="Editor interaction walkthrough"></video>${['desktop', 'tablet', 'mobile'].map((device) => `<h2>${device}</h2><figure><figcaption>Before</figcaption><img alt="Previous three-surface ${device} layout" src="before/${device}.png"></figure>${['source', 'split', 'visual'].map((mode) => `<figure><figcaption>${mode}</figcaption><img alt="${device} ${mode} mode" src="${device}-${mode}.png"></figure>`).join('')}`).join('')}`,
  );
} finally {
  await browser.close();
}
