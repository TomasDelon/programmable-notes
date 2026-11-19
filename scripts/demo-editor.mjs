import assert from 'node:assert/strict';
import { mkdir, readFile, cp, writeFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { createHash } from 'node:crypto';
import { chromium } from '@playwright/test';

const output = '.cache/editor-demo';
const url = process.env.DEMO_URL || 'http://127.0.0.1:4188/';
await mkdir(output, { recursive: true });
await writeFile(
  join(output, 'capture.json'),
  JSON.stringify({ verified: false }),
);
const sha = (value) => createHash('sha256').update(value).digest('hex');
async function buildManifest(prefix = '') {
  const files = {};
  for (const entry of (
    await readdir(join('dist', prefix), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    const name = prefix ? `${prefix}/${entry.name}` : entry.name;
    assert.ok(
      !entry.isSymbolicLink() &&
        !/[<>:"\\|?*]/.test(entry.name) &&
        ![...entry.name].some((character) => character.charCodeAt(0) < 32) &&
        !/[. ]$/.test(entry.name) &&
        !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(entry.name),
      'Build paths must be portable regular files',
    );
    if (entry.isDirectory()) Object.assign(files, await buildManifest(name));
    else {
      assert.ok(entry.isFile(), 'Unsupported build entry');
      files[name] = sha(await readFile(join('dist', name)));
    }
  }
  return files;
}
const buildFiles = await buildManifest();
const buildIndex = await readFile('dist/index.html');
const captureScript = await readFile(new URL(import.meta.url));
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
  const response = await page.goto(url);
  assert.equal(
    await response.text(),
    buildIndex.toString('utf8'),
    'Demo must serve the current production build',
  );
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
  assert.equal(
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .isEnabled(),
    false,
  );
  assert.equal(await page.getByLabel('Source file').isEnabled(), false);
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
  await page.setViewportSize({ width: 1440, height: 1000 });
  const lessonKey = await page.getByLabel('Source file').inputValue();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  assert.equal(
    await editor.evaluate((e) => e === e.ownerDocument.activeElement),
    true,
  );
  const newSource = '# New note\n\nCreated without replacing the lesson.\n';
  await page.keyboard.insertText(newSource);
  await page.screenshot({
    path: join(output, '04-new-note.png'),
    fullPage: true,
  });
  const newDownload = page.waitForEvent('download');
  await editor.press('Control+s');
  await (await newDownload).saveAs(join(output, 'new-note.mdx'));
  assert.equal(await readFile(join(output, 'new-note.mdx'), 'utf8'), newSource);
  await page.getByLabel('Source file').selectOption(lessonKey);
  const retainedDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (await retainedDownload).saveAs(join(output, 'lesson.mdx'));
  assert.equal(
    await readFile(join(output, 'lesson.mdx'), 'utf8'),
    source.replace(original, replacement),
  );
  const video = page.video();
  await page.close();
  await video.saveAs(join(output, 'walkthrough.webm'));
  await video.delete();
  await writeFile(
    join(output, 'walkthrough.html'),
    `<!doctype html><meta charset="utf-8"><title>Programmable Notes walkthrough</title><style>body{font:16px system-ui;max-width:72rem;margin:2rem auto;padding:1rem}video,img{max-width:100%}figure{margin:1rem 0}</style><h1>Unified document workspace</h1><p>Source edits exact MDX, Split runs isolated React, Visual edits supported Markdown. The recording exercises the counter, changes a paragraph, saves exact MDX, protects unapplied text, switches modes at three sizes and creates an independent new note saved with Ctrl+S.</p><video src="walkthrough.webm" controls aria-label="Editor interaction walkthrough"></video><p>Actual saved source: <a href="lesson.mdx" download>edited lesson</a> · <a href="new-note.mdx" download>new note</a>.</p><figure><figcaption>New unsaved note</figcaption><img alt="A separately created note in Source mode" src="04-new-note.png"></figure>${['desktop', 'tablet', 'mobile'].map((device) => `<h2>${device}</h2><figure><figcaption>Before</figcaption><img alt="Previous three-surface ${device} layout" src="before/${device}.png"></figure>${['source', 'split', 'visual'].map((mode) => `<figure><figcaption>${mode}</figcaption><img alt="${device} ${mode} mode" src="${device}-${mode}.png"></figure>`).join('')}`).join('')}`,
  );
} finally {
  await browser.close();
}
assert.deepEqual(
  await readFile('dist/index.html'),
  buildIndex,
  'Build changed during capture',
);
assert.deepEqual(
  await buildManifest(),
  buildFiles,
  'Build assets changed during capture',
);
assert.deepEqual(
  await readFile(new URL(import.meta.url)),
  captureScript,
  'Capture script changed during capture',
);
const names = [
  '01-preview.png',
  '02-inline-edit.png',
  '03-updated.png',
  '04-new-note.png',
  'walkthrough.webm',
  'walkthrough.html',
  'lesson.mdx',
  'new-note.mdx',
  ...['desktop', 'tablet', 'mobile'].flatMap((device) => [
    `before/${device}.png`,
    ...['source', 'split', 'visual'].map((mode) => `${device}-${mode}.png`),
  ]),
];
const files = Object.fromEntries(
  await Promise.all(
    names.map(async (name) => [name, sha(await readFile(join(output, name)))]),
  ),
);
await writeFile(
  join(output, 'capture.json'),
  JSON.stringify(
    {
      verified: true,
      schema: 1,
      buildFiles,
      capturedAt: new Date().toISOString(),
      buildIndexSha256: sha(buildIndex),
      captureScriptSha256: sha(captureScript),
      files,
    },
    null,
    2,
  ) + '\n',
);
