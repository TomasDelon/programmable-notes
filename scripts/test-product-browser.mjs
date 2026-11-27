import assert from 'node:assert/strict';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { resolve, dirname } from 'node:path';
import { createServer } from 'vite';
import { tmpdir } from 'node:os';
import { chromium, expect } from '@playwright/test';

// Trusted fixture + injected OS ports: this is not installed/native acceptance.
const screenshot = process.argv[2];
const results = [];
let server, browser;
const temporary = await mkdtemp(resolve(tmpdir(), 'pn-product-browser-'));
const original = '\uFEFF# Primary\r\n\r\nBody.\r\n';
try {
  server = await createServer({
    configFile: resolve('vite.config.ts'),
    cacheDir: resolve(temporary, 'vite'),
    optimizeDeps: { entries: ['tests/fixtures/product-browser/index.html'] },
    logLevel: 'silent',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
  });
  await server.listen();
  const address = server.httpServer.address();
  assert.ok(address && typeof address !== 'string');
  browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  page.setDefaultTimeout(30_000);
  const errors = [];
  page.on('pageerror', (error) => errors.push(error.message));
  await page.goto(
    `http://127.0.0.1:${address.port}/tests/fixtures/product-browser/index.html`,
    { waitUntil: 'domcontentloaded' },
  );
  await expect(page).toHaveTitle('Product browser acceptance');
  const read = (path = 'primary.md') =>
    page.evaluate((path) => globalThis.productBrowserFixture.read(path), path);
  const disk = async (expected, path = 'primary.md') => {
    await expect.poll(async () => (await read(path)).disk).toBe(expected);
    await expect(
      page.getByRole('status', { name: 'Document save status' }),
    ).toHaveText('Saved to file');
  };
  const mode = async (name) => {
    const handle = page.getByRole('button', { name: 'Show document modes' });
    await page.mouse.move(720, 1);
    await expect(handle).toHaveAttribute('aria-expanded', 'true');
    await page.getByRole('button', { name, exact: true }).click();
    await page.mouse.move(1000, 300);
    await expect(handle).toHaveAttribute('aria-expanded', 'false');
  };
  await page.getByRole('button', { name: 'Choose local vault' }).click();
  await page
    .getByRole('button', { name: 'Open primary.md', exact: true })
    .click();
  let source = page.getByRole('textbox', { name: 'MDX source' });
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.press('ArrowLeft');
  await page.keyboard.type(' Source.');
  const sourceEdit = original.replace('Body.', 'Body. Source.');
  await disk(sourceEdit);
  await page.keyboard.press('Control+z');
  await disk(original);
  await page.keyboard.press('Control+Shift+z');
  await disk(sourceEdit);
  results.push('source-caret-autosave-exact-bom-crlf', 'source-undo-redo');

  await mode('Preview');
  const visual = page.getByRole('textbox', { name: 'Editable document' });
  await expect(visual.locator('input,textarea,.cm-editor')).toHaveCount(0);
  await visual.locator('p').last().click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Visual.');
  // Existing lossless serializer encodes a just-typed end-of-line space.
  // Only newly authored bytes differ; rendered text must remain literal.
  const visualEdit = sourceEdit.replace('Source.', 'Source.&#32;Visual.');
  await expect(visual).toContainText('Body. Source. Visual.');
  await expect(visual).not.toContainText('&#32;');
  await disk(visualEdit);
  await page.keyboard.press('Control+z');
  await disk(sourceEdit);
  await page.keyboard.press('Control+Shift+z');
  await disk(visualEdit);
  await mode('Source');
  await mode('Preview');
  await expect(visual).toContainText('Body. Source. Visual.');
  await expect(visual).not.toContainText('&#32;');
  results.push(
    'preview-caret-autosave-untouched-source-preserved',
    'preview-undo-redo',
  );
  const firstSession = (await read()).sessionId;
  await page
    .getByRole('button', { name: 'Open mixed.mdx', exact: true })
    .click();
  await mode('Source');
  source = page.getByRole('textbox', { name: 'MDX source' });
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('\nAppended.');
  const mixed = await page.evaluate(
    () => globalThis.productBrowserFixture.originalMixed,
  );
  await disk(mixed + '\r\nAppended.', 'mixed.mdx');
  await page
    .getByRole('button', { name: 'Open primary.md', exact: true })
    .click();
  assert.equal((await read()).sessionId, firstSession);
  assert.equal((await read()).canonical, visualEdit);
  results.push(
    'switch-retains-session-and-source',
    'mixed-mdx-preserves-import-comment-jsx',
  );

  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search commands and notes' })
    .fill('Close document');
  await page.getByRole('button', { name: /Close document/ }).click();
  await expect.poll(async () => (await read()).sessionId).toBeNull();
  await page
    .getByRole('button', { name: 'Open primary.md', exact: true })
    .click();
  assert.notEqual((await read()).sessionId, firstSession);
  assert.equal((await read()).canonical, visualEdit);
  await mode('Preview');
  await expect(visual).toContainText('Body. Source. Visual.');
  await expect(visual).not.toContainText('&#32;');
  if (screenshot) {
    assert.ok(
      resolve(screenshot).startsWith(resolve('.cache') + '/'),
      'Screenshot must remain in ignored .cache',
    );
    await mkdir(dirname(resolve(screenshot)), { recursive: true });
    await page.screenshot({ path: resolve(screenshot), fullPage: true });
    await page
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click();
    for (const [name, width, height] of [
      ['tablet', 768, 1024],
      ['mobile', 390, 844],
    ]) {
      await page.setViewportSize({ width, height });
      await expect(visual).toBeVisible();
      await expect(visual).toContainText('Body. Source. Visual.');
      await expect(visual).not.toContainText('&#32;');
      await expect
        .poll(() =>
          page.evaluate(() => globalThis.document.documentElement.scrollWidth),
        )
        .toBeLessThanOrEqual(width);
      await page
        .getByRole('button', { name: 'Open navigation', exact: true })
        .click();
      await expect(
        page.getByRole('button', { name: 'Open primary.md', exact: true }),
      ).toBeVisible();
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
      await page.mouse.move(width / 2, height * 0.65);
      await expect
        .poll(() =>
          page
            .locator('#notes-navigation')
            .evaluate((node) => node.getBoundingClientRect().right),
        )
        .toBeLessThanOrEqual(0);
      await expect(visual).toBeVisible();
      assert.equal((await read()).canonical, visualEdit);
      await page.screenshot({
        path: resolve(`${screenshot}.${name}.png`),
        fullPage: true,
      });
    }
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
    results.push('responsive-viewport-navigation');
  }
  await mode('Source');
  results.push('close-and-fresh-reopen');

  // Synthetic OS request, real owning editor/transport/model lifecycle.
  source = page.getByRole('textbox', { name: 'MDX source' });
  const composingEditor = await source.elementHandle();
  await source.dispatchEvent('compositionstart', { data: '' });
  await page.evaluate(() =>
    globalThis.productBrowserFixture.requestClose('refuse'),
  );
  await expect
    .poll(async () => (await read()).closeActions.at(-1))
    .toBe('cancel');
  await expect.poll(async () => (await read()).closePhase).toBe('idle');
  assert.equal(
    await composingEditor.evaluate((node) => node.isConnected),
    true,
  );
  assert.equal((await read()).canonical, visualEdit);
  await source.dispatchEvent('compositionend', { data: '' });
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Ready.');
  await disk(visualEdit + 'Ready.');
  await page.keyboard.press('Control+z');
  await disk(visualEdit);
  results.push('composition-close-cancel-keeps-owning-editor-and-editability');

  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Retained history.');
  const beforeRefusal = visualEdit + 'Retained history.';
  await disk(beforeRefusal);
  const refusedEditor = await source.elementHandle();
  const refusalSession = (await read()).sessionId;
  await page.evaluate(() =>
    globalThis.productBrowserFixture.requestClose('refuse'),
  );
  await expect
    .poll(async () => (await read()).closeActions.slice(-2).join(','))
    .toBe('commit,cancel');
  await expect.poll(async () => (await read()).closePhase).toBe('idle');
  await expect
    .poll(() => refusedEditor.evaluate((node) => node.isConnected))
    .toBe(false);
  await expect(source).toBeVisible();
  assert.equal((await read()).sessionId, refusalSession);
  await source.click();
  await page.keyboard.press('Control+z');
  await disk(visualEdit);
  await page.keyboard.press('Control+Shift+z');
  await disk(beforeRefusal);
  await page.keyboard.press('Control+z');
  await disk(visualEdit);
  results.push('native-refusal-cancel-remounts-same-session-and-history');

  await page.evaluate(() => globalThis.productBrowserFixture.failNextSave());
  source = page.getByRole('textbox', { name: 'MDX source' });
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' Failed.');
  await expect.poll(async () => (await read()).status).toBe('blocked');
  let failed = await read();
  assert.equal(failed.disk, visualEdit);
  assert.equal(failed.canonical, visualEdit + ' Failed.');
  results.push('write-failure-retains-canonical-without-overwrite');
  await page.evaluate(() =>
    globalThis.productBrowserFixture.externalWrite('External owner.\r\n'),
  );
  await page.getByRole('button', { name: 'Retry save', exact: true }).click();
  await expect
    .poll(async () => (await read()).saveCalls)
    .toBeGreaterThan(failed.saveCalls);
  failed = await read();
  assert.equal(failed.disk, 'External owner.\r\n');
  assert.equal(failed.canonical, visualEdit + ' Failed.');
  assert.equal(failed.status, 'blocked');
  results.push('retry-cas-preserves-external-writer');

  const heldPage = await browser.newPage({
    viewport: { width: 1440, height: 1000 },
  });
  heldPage.on('pageerror', (error) => errors.push(error.message));
  await heldPage.goto(page.url(), { waitUntil: 'domcontentloaded' });
  await heldPage.getByRole('button', { name: 'Choose local vault' }).click();
  await heldPage
    .getByRole('button', { name: 'Open primary.md', exact: true })
    .click();
  const retiredEditor = await heldPage
    .getByRole('textbox', { name: 'MDX source' })
    .elementHandle();
  await heldPage.evaluate(() =>
    globalThis.productBrowserFixture.requestClose('hold'),
  );
  await expect
    .poll(() =>
      heldPage.evaluate(() =>
        globalThis.productBrowserFixture.read('primary.md').closeActions.at(-1),
      ),
    )
    .toBe('commit');
  await retiredEditor.evaluate((node) => {
    node.textContent = 'Retired input must not publish';
    node.dispatchEvent(
      new globalThis.InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'bad',
      }),
    );
    node.dispatchEvent(
      new globalThis.KeyboardEvent('keydown', {
        bubbles: true,
        key: 'z',
        ctrlKey: true,
      }),
    );
  });
  const held = await heldPage.evaluate(() =>
    globalThis.productBrowserFixture.read('primary.md'),
  );
  assert.equal(held.canonical, original);
  assert.equal(held.disk, original);
  assert.equal(held.saveCalls, 0);
  assert.equal(held.closing, true);
  await heldPage.evaluate(() =>
    globalThis.productBrowserFixture.releaseClose(),
  );
  await expect
    .poll(() =>
      heldPage.evaluate(
        () => globalThis.productBrowserFixture.read('primary.md').closePhase,
      ),
    )
    .toBe('committing');
  const committed = await heldPage.evaluate(() =>
    globalThis.productBrowserFixture.read('primary.md'),
  );
  assert.equal(committed.closing, true);
  assert.equal(committed.closeUncertain, false);
  assert.equal(committed.canonical, original);
  assert.equal(committed.disk, original);
  assert.equal(committed.saveCalls, 0);
  assert.equal(await retiredEditor.evaluate((node) => node.isConnected), false);
  await expect(
    heldPage.getByRole('textbox', { name: 'MDX source' }),
  ).toHaveCount(0);
  await heldPage.close();
  results.push(
    'held-commit-retires-dom-input-and-remains-closed-to-publication',
  );
  assert.deepEqual(errors, []);
  if (screenshot) {
    assert.ok(
      resolve(screenshot).startsWith(resolve('.cache') + '/'),
      'Screenshot must remain in ignored .cache',
    );
    await mkdir(dirname(resolve(screenshot)), { recursive: true });
    await page.screenshot({
      path: resolve(screenshot + '.failure.png'),
      fullPage: true,
    });
  }
  const report = {
    kind: 'browser-controller-injected-os-ports',
    passed: results.length,
    results,
    simulatedStorage: 'memory-with-revision-cas',
    knownSerialization:
      'new trailing space retained as numeric entity after subsequent typing; literal rendered whitespace verified',
    nativeFilesystem: 'not-tested',
    nativeRuntime: 'not-tested',
    nativeClose: 'synthetic port acknowledgements; no actual OS close or IPC',
    composition: 'DOM-dispatched composition lifecycle; not physical IME',
  };
  await writeFile(
    resolve('.cache/product-browser-results.json'),
    JSON.stringify(report, null, 2) + '\n',
  );
  console.log(JSON.stringify(report));
} finally {
  await browser?.close();
  await server?.close();
  await rm(temporary, { recursive: true, force: true });
}
