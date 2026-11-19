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
  // Recording pacing only; all readiness/correctness assertions remain explicit.
  const pauseForReview = (milliseconds = 900) =>
    page.waitForTimeout(milliseconds);
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
  await pauseForReview();
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
  await pauseForReview();
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
  await pauseForReview();
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
      await pauseForReview(650);
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
  await pauseForReview();
  const newKey = await page.getByLabel('Source file').inputValue();
  await page.getByLabel('Source file').selectOption(lessonKey);
  assert.equal(
    await page.getByLabel('Document status').textContent(),
    'Source unchanged',
  );
  assert.equal(
    await page.getByLabel('Workspace status').textContent(),
    '1 other source has unsaved changes.',
  );
  await page.screenshot({
    path: join(output, '05-dirty-sibling.png'),
    fullPage: true,
  });
  await pauseForReview();
  await page.getByLabel('Source file').selectOption(newKey);
  assert.equal(
    await page.getByLabel('Document status').textContent(),
    'Unsaved changes',
  );
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
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
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
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await panel.locator('p button').first().click();
  const longInput = panel.getByRole('textbox', { name: 'Paragraph text' });
  assert.equal(await longInput.inputValue(), longParagraph);
  const geometry = await longInput.evaluate((e) => ({
    height: e.getBoundingClientRect().height,
    viewport: e.ownerDocument.defaultView.innerHeight,
    client: e.clientHeight,
    scroll: e.scrollHeight,
  }));
  assert.ok(geometry.height <= geometry.viewport * 0.75);
  assert.ok(geometry.scroll > geometry.client + 1000);
  await longInput.press('Control+End');
  assert.ok(await longInput.evaluate((e) => e.scrollTop > 0));
  await page.keyboard.insertText(' Tail saved.');
  assert.equal(await longInput.inputValue(), longParagraph + ' Tail saved.');
  await page.screenshot({
    path: join(output, '06-long-input.png'),
    fullPage: true,
  });
  await pauseForReview();
  await longInput.press('Enter');
  const longDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (await longDownload).saveAs(join(output, 'long-note.mdx'));
  assert.equal(
    await readFile(join(output, 'long-note.mdx'), 'utf8'),
    longSource.replace(longParagraph, longParagraph + ' Tail saved.'),
  );
  const quoteSource =
    '\uFEFF# Quote example\r\n\r\n  >\tQuoted café 😀.\r\n\r\n<div>Opaque JSX</div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'quoted-note.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(quoteSource),
  });
  await panel.locator('blockquote button').click();
  const quoteInput = panel.getByRole('textbox', { name: 'Paragraph text' });
  await quoteInput.fill('Edited quote: café 😀 + £50.');
  await quoteInput.press('Enter');
  assert.equal(
    await panel.locator('blockquote button').textContent(),
    'Edited quote: café 😀 + £50.',
  );
  await page.screenshot({ path: join(output, '07-quote.png'), fullPage: true });
  await pauseForReview();
  const quoteDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (await quoteDownload).saveAs(join(output, 'quoted-note.mdx'));
  assert.equal(
    await readFile(join(output, 'quoted-note.mdx'), 'utf8'),
    quoteSource.replace('Quoted café 😀.', 'Edited quote: café 😀 + £50.'),
  );
  const multilineSource =
    '\uFEFF# Multiline quote\r\n\r\n  >  First café 😀.\r\n >\tSecond line.\n> Third line.\r\n\r\n<div><span>Opaque JSX</span></div>\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'multiline-quoted-note.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(multilineSource),
  });
  const multilineButton = panel.locator('blockquote button');
  await multilineButton.click();
  const multilineInput = panel.getByRole('textbox', { name: 'Paragraph text' });
  assert.equal(
    await multilineInput.inputValue(),
    'First café 😀.\nSecond line.\nThird line.',
  );
  await multilineInput.fill('First café 😀.\nChanged: £50 + tax.\nThird line.');
  await multilineInput.press('Enter');
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  assert.equal(
    await multilineButton.textContent(),
    'First café 😀.\r\nSecond line.\nThird line.',
  );
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await page.screenshot({
    path: join(output, '08-multiline-quote.png'),
    fullPage: true,
  });
  await pauseForReview(1200);
  const multilineDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (
    await multilineDownload
  ).saveAs(join(output, 'multiline-quoted-note.mdx'));
  const multilineSaved = multilineSource.replace(
    'Second line.',
    'Changed: £50 + tax.',
  );
  assert.equal(
    await readFile(join(output, 'multiline-quoted-note.mdx'), 'utf8'),
    multilineSaved,
  );
  await multilineButton.click();
  await multilineInput.fill('First\nSecond\nThird\nExtra');
  await multilineInput.press('Enter');
  await panel.getByRole('alert').waitFor();
  assert.equal(
    await multilineInput.inputValue(),
    'First\nSecond\nThird\nExtra',
  );
  assert.equal(
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .isEnabled(),
    false,
  );
  await page.screenshot({
    path: join(output, '09-unsafe-quote.png'),
    fullPage: true,
  });
  await pauseForReview(1200);
  await multilineInput.press('Escape');
  const opaque = panel
    .locator('details.opaque-block')
    .filter({ hasText: 'Opaque JSX' });
  await opaque.locator('summary').click();
  await opaque.getByRole('button', { name: 'Show in Source' }).click();
  const sourceEditor = page.getByRole('textbox', { name: 'MDX source' });
  await sourceEditor.waitFor();
  await page.waitForFunction(
    (element) => element === element.ownerDocument.activeElement,
    await sourceEditor.elementHandle(),
    { timeout: 5000 },
  );
  await page.screenshot({
    path: join(output, '10-source-navigation.png'),
    fullPage: true,
  });
  await pauseForReview(1200);
  const sourceDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (await sourceDownload).saveAs(join(output, 'source-navigation.mdx'));
  assert.equal(
    await readFile(join(output, 'source-navigation.mdx'), 'utf8'),
    multilineSaved,
  );
  const denseSource =
    '\uFEFF# Dense source remains exact\r\n\r\n' +
    '['.repeat(50_000) +
    'x' +
    ']'.repeat(50_000) +
    '\r\n';
  await page.getByLabel('Open files').setInputFiles({
    name: 'dense-visual.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(denseSource),
  });
  await page
    .getByLabel('Source file')
    .locator('option:checked')
    .filter({ hasText: 'dense-visual.mdx' })
    .waitFor({ state: 'attached' });
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await panel
    .getByRole('note')
    .filter({ hasText: 'too complex for visual editing' })
    .waitFor();
  const denseBlock = panel.locator('details.opaque-block');
  assert.equal(await denseBlock.count(), 1);
  assert.equal(await denseBlock.locator('pre').textContent(), denseSource);
  await denseBlock.locator('summary').click();
  assert.equal(await panel.getByRole('button').count(), 1);
  await page.screenshot({
    path: join(output, '11-dense-fallback.png'),
    fullPage: true,
  });
  await pauseForReview(1400);
  const denseDownload = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await (await denseDownload).saveAs(join(output, 'dense-visual.mdx'));
  assert.equal(
    await readFile(join(output, 'dense-visual.mdx'), 'utf8'),
    denseSource,
  );
  const video = page.video();
  await page.close();
  await video.saveAs(join(output, 'walkthrough.webm'));
  await video.delete();
  await writeFile(
    join(output, 'walkthrough.html'),
    `<!doctype html><meta charset="utf-8"><title>Programmable Notes walkthrough</title><style>body{font:16px system-ui;max-width:72rem;margin:2rem auto;padding:1rem}video,img{max-width:100%}figure{margin:1rem 0}</style><h1>Unified document workspace</h1><p>Source edits exact MDX, Split runs isolated React, Visual edits supported Markdown. The recording exercises the counter, changes a paragraph, saves exact MDX, protects unapplied text, switches modes at three sizes and creates an independent new note saved with Ctrl+S, and distinguishes its unsaved text from the clean lesson. It then edits the end of a thousand-line paragraph in a bounded scrollable input and saves exact source. It edits a literal blockquote, then a multiline quoted paragraph with Undo/Redo while preserving every prefix and mixed physical line ending. A rejected line-count change retains pending text and blocks Save until cancelled. Trusted Show in Source focuses opaque JSX without changing bytes. Dense syntax then falls back to one exact read-only source block, retaining an exact export.</p><video src="walkthrough.webm" controls aria-label="Editor interaction walkthrough"></video><p>Actual saved source: <a href="lesson.mdx" download>edited lesson</a> · <a href="new-note.mdx" download>new note</a> · <a href="long-note.mdx" download>long paragraph</a> · <a href="quoted-note.mdx" download>edited quote</a> · <a href="multiline-quoted-note.mdx" download>multiline quote</a> · <a href="source-navigation.mdx" download>unchanged navigation export</a> · <a href="dense-visual.mdx" download>dense read-only source</a>.</p><figure><figcaption>New unsaved note</figcaption><img alt="A separately created note in Source mode" src="04-new-note.png"></figure><figure><figcaption>Clean selected source with a dirty sibling</figcaption><img alt="A clean lesson remains distinct from an unsaved other source" src="05-dirty-sibling.png"></figure><figure><figcaption>Full long-paragraph input with internal scrolling</figcaption><img alt="Thousand-line paragraph edited at its end without an oversized input" src="06-long-input.png"></figure><figure><figcaption>Literal quote edited without rewriting its marker</figcaption><img alt="Direct quote editing preserves surrounding opaque JSX" src="07-quote.png"></figure><figure><figcaption>Multiline quote keeps every marker and physical ending</figcaption><img alt="Three-line quoted text edited without changing its prefixes" src="08-multiline-quote.png"></figure><figure><figcaption>Unsupported structure stays pending</figcaption><img alt="A changed quote line count is refused and Save stays blocked" src="09-unsafe-quote.png"></figure><figure><figcaption>Opaque JSX opens at its original Source position</figcaption><img alt="Trusted Source navigation without modifying document bytes" src="10-source-navigation.png"></figure><figure><figcaption>Dense syntax remains exact and read only</figcaption><img alt="Conservative visual fallback with explicit Source authoring" src="11-dense-fallback.png"></figure>${['desktop', 'tablet', 'mobile'].map((device) => `<h2>${device}</h2><figure><figcaption>Before</figcaption><img alt="Previous three-surface ${device} layout" src="before/${device}.png"></figure>${['source', 'split', 'visual'].map((mode) => `<figure><figcaption>${mode}</figcaption><img alt="${device} ${mode} mode" src="${device}-${mode}.png"></figure>`).join('')}`).join('')}`,
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
  '05-dirty-sibling.png',
  '06-long-input.png',
  '07-quote.png',
  '08-multiline-quote.png',
  '09-unsafe-quote.png',
  '10-source-navigation.png',
  '11-dense-fallback.png',
  'walkthrough.webm',
  'walkthrough.html',
  'lesson.mdx',
  'new-note.mdx',
  'long-note.mdx',
  'quoted-note.mdx',
  'multiline-quoted-note.mdx',
  'source-navigation.mdx',
  'dense-visual.mdx',
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
