/** Capture or verify the portable browser edition through its public workspace. */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import process from 'node:process';
import { chromium, expect } from '@playwright/test';

const dist = process.env.DEMO_DIST ?? 'dist';
const output = process.env.DEMO_OUTPUT ?? '.cache/web-editor-demo';
function loopbackUrl(value) {
  const url = new URL(value);
  assert.ok(
    url.protocol === 'http:' && url.hostname === '127.0.0.1',
    'Use a loopback HTTP production server',
  );
  return url;
}

const launchBrowser = () =>
  chromium.launch({
    executablePath: process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH,
  });

async function command(page, label) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(label);
  await palette
    .getByRole('button', { name: new RegExp('^' + label) })
    .first()
    .click();
}

async function expectSaved(page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

async function openNotebook(page) {
  const title = page.getByRole('heading', { name: 'Document title' });
  await expect(title).toHaveText('Welcome');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Field measurements.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect(title).toHaveText('Field measurements');
  await command(page, 'Preview document');
}

function counter(page, value) {
  return page
    .frameLocator('.rendered-runtime iframe[title="Document preview"]')
    .getByRole('button', { name: 'Samples taken: ' + value, exact: true });
}

const sha = (bytes) => createHash('sha256').update(bytes).digest('hex');
const sizes = {
  desktop: { width: 1440, height: 1000 },
  tablet: { width: 820, height: 1000 },
  mobile: { width: 390, height: 844 },
};
const original =
  '\uFEFFimport { useState } from "react"\r\n\r\n' +
  'export function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>Samples taken: {count}</button> }\r\n\r\n' +
  '# Sample log\r\n\r\n' +
  'Record the first reading.\r\n\r\n' +
  'The volume scale is $r^2$.\r\n\r\n' +
  'Estimate uncertainty with $\\sqrt{x$.\r\n\r\n' +
  'Café &amp; tea break, then record λ.  \n\n' +
  '{/* Preserve this spacing.  */}\r\n\r\n' +
  '<section data-run="kept">\n  <div><Counter /></div>\n</section>\r\n';
const edited = original
  .replace(
    'Record the first reading.',
    'Record the first reading!\r\n\r\n1. Observe\r\n2. Measure',
  )
  .replace('$r^2$', '$r^3$')
  .replace('$\\sqrt{x$', '$\\sqrt{x}$');

async function manifest(prefix = '') {
  const files = {};
  for (const item of (
    await readdir(join(dist, prefix), { withFileTypes: true })
  ).sort((a, b) => a.name.localeCompare(b.name))) {
    assert.ok(
      !item.isSymbolicLink() &&
        !/[<>:"\\|?*]/.test(item.name) &&
        ![...item.name].some((character) => character.charCodeAt(0) < 32) &&
        !/[. ]$/.test(item.name) &&
        !/^(con|prn|aux|nul|com[1-9¹²³]|lpt[1-9¹²³])(?:\.|$)/i.test(item.name),
      'Build paths must be portable regular files',
    );
    const name = prefix ? prefix + '/' + item.name : item.name;
    if (item.isDirectory()) Object.assign(files, await manifest(name));
    else {
      assert.ok(item.isFile(), 'Unsupported build entry');
      files[name] = sha(await readFile(join(dist, name)));
    }
  }
  return files;
}

async function captureWalkthrough() {
  const url = loopbackUrl(process.env.DEMO_URL ?? 'http://127.0.0.1:4188/');
  await mkdir(output, { recursive: true });
  const receipt = join(output, 'capture.json');
  await writeFile(receipt, '{"verified":false}\n');
  const buildFiles = await manifest();
  const indexSha = buildFiles['index.html'];
  assert.ok(indexSha, 'Build has no index.html');
  if (process.env.DEMO_INDEX_SHA256)
    assert.equal(indexSha, process.env.DEMO_INDEX_SHA256);
  const scriptSha = sha(await readFile(new URL(import.meta.url)));
  const filesToCapture = [
    '01-math-source.png',
    '02-math-corrected.png',
    ...Object.keys(sizes).flatMap((device) => [
      device + '-preview.png',
      device + '-source.png',
    ]),
    'lesson.mdx',
    'walkthrough.html',
    'walkthrough.webm',
  ];
  const served = new Map();
  const responses = [];
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext({
      viewport: sizes.desktop,
      recordVideo: { dir: output, size: sizes.desktop },
    });
    const page = await context.newPage();
    const editor = page.getByRole('textbox', { name: 'Editable document' });
    const heading = editor.getByRole('heading', { name: 'Sample log' });
    const keys = page.keyboard;
    page.on('response', (response) => {
      const target = new URL(response.url());
      if (target.origin !== url.origin || response.status() !== 200) return;
      const name =
        target.pathname === '/'
          ? 'index.html'
          : decodeURIComponent(target.pathname.slice(1));
      if (!Object.hasOwn(buildFiles, name)) return;
      responses.push(
        response.body().then(
          (body) => ({ name, digest: sha(body) }),
          (error) => ({ name, error }),
        ),
      );
    });
    const verifyIndex = async (response) => {
      assert.ok(response?.ok());
      assert.equal(
        sha(await response.body()),
        indexSha,
        'Served HTML bytes do not match the build',
      );
    };
    const selectText = (locator, start, end = start) =>
      locator.evaluate(
        (element, offsets) => {
          element.closest('.ProseMirror').focus();
          const text = element.firstChild;
          if (text?.nodeType !== 3)
            throw new Error('Expected an editable native text node');
          const range = element.ownerDocument.createRange();
          range.setStart(text, offsets.start);
          range.setEnd(text, offsets.end);
          const selection = element.ownerDocument.getSelection();
          selection.removeAllRanges();
          selection.addRange(range);
        },
        { start, end },
      );
    // Recording pacing gives viewers time to read. Assertions gate readiness.
    const hold = () => page.waitForTimeout(950);
    const shot = (name) => page.screenshot({ path: join(output, name) });
    const checkWidth = () =>
      page.locator('html').evaluate((element) => {
        const { body, defaultView } = element.ownerDocument;
        return (
          Math.max(element.scrollWidth, body.scrollWidth) <=
          defaultView.innerWidth + 1
        );
      });

    await verifyIndex(await page.goto(url.href));
    await openNotebook(page);
    await expect(heading).toBeVisible();
    await expect(counter(page, 0)).toBeVisible({ timeout: 20_000 });
    await counter(page, 0).click();
    await expect(counter(page, 1)).toBeVisible();
    await hold();

    const prose = editor.getByText('Record the first reading.', {
      exact: true,
    });
    await prose.click();
    await keys.press('End');
    await keys.press('Backspace');
    await keys.type('!');
    await expect(
      editor.getByText('Record the first reading!', { exact: true }),
    ).toBeVisible();
    await keys.press('Enter');
    await keys.type('1. Observe', { delay: 55 });
    await keys.press('Enter');
    await keys.type('Measure', { delay: 55 });
    await expect(editor.locator('ol > li')).toHaveText(['Observe', 'Measure']);
    await hold();

    const area = editor.locator('p').filter({ hasText: 'The volume scale' });
    const areaSource = area.locator('.rendered-math-source');
    await area.locator('.rendered-math-render .katex-html').click();
    await expect(areaSource).toHaveText('$r^2$');
    await expect(areaSource).toBeVisible();
    await expect(editor).toBeFocused();
    await expect(counter(page, 1)).toBeVisible();
    await shot('01-math-source.png');
    await hold();
    await selectText(areaSource, 3, 4);
    await keys.type('3');
    await heading.click();
    await expect(area.locator('.katex')).toBeVisible();
    await expect(areaSource).toBeHidden();

    const invalid = editor.locator(
      '.rendered-math-invalid .rendered-math-source',
    );
    await expect(invalid).toHaveText('$\\sqrt{x$');
    await invalid.click();
    await selectText(invalid, '$\\sqrt{x'.length);
    await keys.type('}');
    await heading.click();
    await expect(editor.locator('.rendered-math-invalid')).toHaveCount(0);
    await expect(editor.locator('.katex')).toHaveCount(2);
    await expect(counter(page, 1)).toBeVisible();
    await counter(page, 1).click();
    await expect(counter(page, 2)).toBeVisible();
    await shot('02-math-corrected.png');
    await hold();

    await command(page, 'Save workspace');
    await expectSaved(page);
    const pending = page.waitForEvent('download');
    await command(page, 'Export current source');
    await (await pending).saveAs(join(output, 'lesson.mdx'));
    assert.deepEqual(
      await readFile(join(output, 'lesson.mdx')),
      Buffer.from(edited),
    );
    await verifyIndex(await page.reload());
    await expect(heading).toBeVisible();
    await expect(editor.locator('ol > li')).toHaveText(['Observe', 'Measure']);

    for (const [device, viewport] of Object.entries(sizes)) {
      await page.setViewportSize(viewport);
      await expect(heading).toBeVisible();
      const widget = page
        .frameLocator('.rendered-runtime iframe[title="Document preview"]')
        .getByRole('button', { name: /^Samples taken: \d+$/ });
      await expect(widget).toBeVisible({ timeout: 20_000 });
      const currentCount = Number((await widget.innerText()).split(': ')[1]);
      await widget.click();
      await expect(counter(page, currentCount + 1)).toBeVisible();
      await heading.scrollIntoViewIfNeeded();
      assert.ok(await checkWidth(), 'Unexpected horizontal document overflow');
      await shot(device + '-preview.png');
      await hold();
      await command(page, 'Edit source');
      await expect(
        page.getByRole('textbox', { name: 'MDX source' }),
      ).toBeVisible();
      assert.ok(await checkWidth(), 'Unexpected horizontal source overflow');
      await shot(device + '-source.png');
      await hold();
      await command(page, 'Preview document');
    }

    for (const { name, digest, error } of await Promise.all(responses)) {
      if (error) throw error;
      assert.equal(
        digest,
        buildFiles[name],
        'Different bytes served for ' + name,
      );
      served.set(name, digest);
    }
    assert.equal(served.get('index.html'), indexSha);
    const assetNames = [...served.keys()];
    assert.ok(assetNames.some((name) => /^assets\/WebApp-.*\.js$/.test(name)));
    assert.ok(
      assetNames.some((name) => /^assets\/SourceEditor-.*\.js$/.test(name)),
    );
    const video = page.video();
    await context.close();
    await video.saveAs(join(output, 'walkthrough.webm'));
    await video.delete();
  } finally {
    await browser.close();
  }

  assert.deepEqual(
    await manifest(),
    buildFiles,
    'The build changed during capture',
  );
  assert.equal(sha(await readFile(new URL(import.meta.url))), scriptSha);
  const illustrations = Object.keys(sizes).map((device) =>
    [
      '<h2>' + device[0].toUpperCase() + device.slice(1) + '</h2>',
      '<figure><img src="' +
        device +
        '-preview.png" alt="Editable Preview at the ' +
        device +
        ' viewport"><figcaption>Editable Preview</figcaption></figure>',
      '<figure><img src="' +
        device +
        '-source.png" alt="MDX Source at the ' +
        device +
        ' viewport"><figcaption>Source</figcaption></figure>',
    ].join('\n'),
  );
  await writeFile(
    join(output, 'walkthrough.html'),
    [
      '<!doctype html>',
      '<html lang="en">',
      '<meta charset="utf-8">',
      '<meta name="viewport" content="width=device-width,initial-scale=1">',
      '<title>Programmable Notes web walkthrough</title>',
      '<style>body{font:1rem/1.6 system-ui,sans-serif;max-width:72rem;margin:2rem auto;padding:0 1rem}img,video{display:block;max-width:100%;height:auto;border:1px solid #cfcfcf}figure{margin:1rem 0 2rem}figcaption{margin-top:.5rem}@media(prefers-color-scheme:dark){body{color:#eee;background:#222}a{color:#c5d9ff}}</style>',
      '<h1>Programmable Notes web walkthrough</h1>',
      '<p>In Editable Preview, the author changes a sentence, types an ordered list, edits an equation at the document caret, corrects an incomplete root, and interacts with a React component. The note is saved, exported, and reopened.</p>',
      '<video controls preload="metadata" src="walkthrough.webm" aria-label="Editor walkthrough"></video>',
      '<p><a href="lesson.mdx" download>Download the exact exported MDX</a></p>',
      '<figure><img src="01-math-source.png" alt="The focused equation exposes its exact LaTeX within the paragraph"><figcaption>The document caret opens the equation source.</figcaption></figure>',
      '<figure><img src="02-math-corrected.png" alt="Two rendered equations and a React button displaying the recorded sample count"><figcaption>Both equations render after correction, and the Counter acknowledges its second click.</figcaption></figure>',
      ...illustrations,
      '</html>',
      '',
    ].join('\n'),
  );
  const files = Object.fromEntries(
    await Promise.all(
      filesToCapture.map(async (name) => [
        name,
        sha(await readFile(join(output, name))),
      ]),
    ),
  );
  await writeFile(
    receipt,
    JSON.stringify(
      {
        verified: true,
        schema: 2,
        profile: 'web-editor',
        capturedAt: new Date().toISOString(),
        buildIndexSha256: indexSha,
        captureScriptSha256: scriptSha,
        buildFiles,
        servedFiles: Object.fromEntries([...served].sort()),
        files,
      },
      null,
      2,
    ) + '\n',
  );
  console.log(
    JSON.stringify({
      output,
      buildIndexSha256: indexSha,
      served: served.size,
      files: Object.keys(files).length,
    }),
  );
}

async function verifyExtracted() {
  const url = loopbackUrl(
    process.env.REVIEW_DEMO_URL ?? 'http://127.0.0.1:4190/',
  );
  const browser = await launchBrowser();
  try {
    const context = await browser.newContext();
    const page = await context.newPage();
    await page.goto(url.href);
    await openNotebook(page);
    await expect(counter(page, 0)).toBeVisible({ timeout: 20_000 });
    await counter(page, 0).click();
    await expect(counter(page, 1)).toBeVisible();
    await expectSaved(page);
    await page.waitForFunction(
      () => Boolean(navigator.serviceWorker.controller),
      undefined,
      { timeout: 20_000 },
    );

    await context.setOffline(true);
    await page.reload();
    const editor = page.getByRole('textbox', { name: 'Editable document' });
    await expect(editor.locator('.katex')).toBeVisible();
    await expect(counter(page, 0)).toBeVisible({ timeout: 20_000 });
    await counter(page, 0).click();
    await expect(counter(page, 1)).toBeVisible();
    await editor
      .getByText('Record the first reading.', { exact: true })
      .click();
    await page.keyboard.press('End');
    await page.keyboard.press('Backspace');
    await page.keyboard.type('!');
    await expect(
      editor.getByText('Record the first reading!', { exact: true }),
    ).toBeVisible();
    await command(page, 'Save workspace');
    await expectSaved(page);
    const pending = page.waitForEvent('download');
    await command(page, 'Export current source');
    const bytes = await readFile(await (await pending).path());
    assert.deepEqual(
      bytes,
      Buffer.from(original.replace('first reading.', 'first reading!')),
    );
    await page.reload();
    await expect(
      editor.getByText('Record the first reading!', { exact: true }),
    ).toBeVisible();
    console.log(
      'WEB_REVIEW_EXTRACTED_BROWSER_PASS offline_counter_save_exact_export_reload',
    );
  } finally {
    await browser.close();
  }
}

const args = process.argv.slice(2);
if (args.length === 0) await captureWalkthrough();
else if (args.length === 1 && args[0] === '--verify-extracted')
  await verifyExtracted();
else
  throw new Error(
    'Usage: node scripts/demo-web-editor.mjs [--verify-extracted]',
  );
