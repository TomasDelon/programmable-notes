import { expect, test, type BrowserContext, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { documentEditor, selectDocumentText } from '../e2e/helpers/math-text';

const origin = 'https://127.0.0.1:4185';
async function owner(context: BrowserContext) {
  await context.addCookies([
    {
      name: 'pn_cloud_test_owner',
      value: '1',
      url: origin,
      httpOnly: true,
      secure: true,
      sameSite: 'Lax',
    },
  ]);
}
async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 20_000 },
  );
}
async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await dialog.getByLabel('Search commands and notes').fill(name);
  await dialog
    .getByRole('button', { name: new RegExp('^' + name) })
    .first()
    .click();
}
async function exported(page: Page) {
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await download).path())!);
}

test('unauthenticated access cannot create a local fallback or a remote workspace', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your workspace could not open' }),
  ).toBeVisible();
  await expect(page.locator('.web-shell')).toHaveCount(0);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
  const response = await page.request.get('/api/storage/head', {
    headers: { 'X-Programmable-Notes': 'storage-v1' },
  });
  expect(response.status()).toBe(401);
  expect(response.headers()['cache-control']).toContain('no-store');
});

test('automatic cloud saves preserve source and reopen independently of browser storage', async ({
  page,
  context,
  browser,
}) => {
  await owner(context);
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: 'Your private workspace is empty' }),
  ).toBeVisible();
  const empty = await context.request.get(origin + '/api/storage/head', {
    headers: { 'X-Programmable-Notes': 'storage-v1' },
  });
  expect(await empty.json()).toEqual({ version: 0, manifest: null });
  await page
    .getByRole('button', { name: 'Create workspace', exact: true })
    .click();
  await saved(page);
  const original =
    '\uFEFF# Cloud document\r\n\r\nA **bold** paragraph.\r\n\r\nUntouched &amp; café λ.  \r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Cloud document.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const paragraph = documentEditor(page)
    .locator('p')
    .filter({ hasText: 'A bold paragraph.' });
  await selectDocumentText(
    paragraph,
    'A bold paragraph.'.length,
    'A bold paragraph.'.length,
  );
  await page.keyboard.type('!');
  const edited = original.replace('paragraph.', 'paragraph.!');
  await saved(page);
  expect(await exported(page)).toEqual(Buffer.from(edited));
  await documentEditor(page).press('Control+z');
  expect(await exported(page)).toEqual(Buffer.from(original));
  await documentEditor(page).press('Control+Shift+z');
  expect(await exported(page)).toEqual(Buffer.from(edited));
  await saved(page);
  expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);

  const other = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  try {
    await owner(other);
    const reopened = await other.newPage();
    await reopened.goto('/');
    await saved(reopened);
    expect(await exported(reopened)).toEqual(Buffer.from(edited));
    expect(await reopened.evaluate(() => indexedDB.databases())).toEqual([]);

    // A failed publication never reports saved or replaces the last commit.
    await page.route('**/api/storage/commit', (route) => route.abort());
    await command(page, 'Edit source');
    const pending = edited + '\r\nPending local draft.\r\n';
    await page.getByRole('textbox', { name: 'MDX source' }).fill(pending);
    await page.keyboard.press('Control+s');
    await expect(page.locator('.web-shell')).toHaveAttribute(
      'data-save-status',
      'error',
    );
    expect(await exported(page)).toEqual(Buffer.from(pending));
    expect(await page.evaluate(() => indexedDB.databases())).toEqual([]);
    await reopened.reload();
    await saved(reopened);
    expect(await exported(reopened)).toEqual(Buffer.from(edited));
    await page.unroute('**/api/storage/commit');
    await page.keyboard.press('Control+s');
    await saved(page);
    await reopened.reload();
    await saved(reopened);
    expect(await exported(reopened)).toEqual(Buffer.from(pending));
  } finally {
    await other.close();
  }
});

test('opaque preview origins and forged assertions cannot mutate cloud storage', async ({
  context,
  page,
}) => {
  await owner(context);
  const before = await context.request.get(origin + '/api/storage/head', {
    headers: { 'X-Programmable-Notes': 'storage-v1' },
  });
  expect(before.status()).toBe(200);
  const head: unknown = await before.json();
  for (const requestOrigin of ['null', 'https://untrusted.example']) {
    const response = await context.request.post(
      origin + '/api/storage/commit',
      {
        headers: {
          Origin: requestOrigin,
          'X-Programmable-Notes': 'storage-v1',
        },
        data: { expectedVersion: 0, manifestId: 'invented' },
      },
    );
    expect(response.status()).toBe(403);
    expect(response.headers()['access-control-allow-origin']).toBeUndefined();
  }
  await page.goto('/');
  await saved(page);
  // User-authored frames have an opaque origin and no API allowance. This
  // independent opaque-frame witness also checks the server's CORS boundary.
  const blocked = await page.evaluate(async (endpoint) => {
    const frame = document.createElement('iframe');
    frame.sandbox.add('allow-scripts');
    return new Promise<boolean>((resolve) => {
      const listener = (event: MessageEvent) => {
        if (
          event.source !== frame.contentWindow ||
          event.data !== 'cloud-denied'
        )
          return;
        window.removeEventListener('message', listener);
        frame.remove();
        resolve(true);
      };
      window.addEventListener('message', listener);
      frame.srcdoc = `<script>fetch(${JSON.stringify(endpoint)}, {method:'POST',credentials:'include',headers:{'Content-Type':'application/json','X-Programmable-Notes':'storage-v1'},body:'{}'}).then(()=>parent.postMessage('cloud-unexpected','*')).catch(()=>parent.postMessage('cloud-denied','*'))</script>`;
      document.body.append(frame);
    });
  }, origin + '/api/storage/commit');
  expect(blocked).toBe(true);
  const after = await context.request.get(origin + '/api/storage/head', {
    headers: { 'X-Programmable-Notes': 'storage-v1' },
  });
  expect(await after.json()).toEqual(head);
  await context.clearCookies();
  const forged = await context.request.get(origin + '/api/storage/head', {
    headers: {
      'Cf-Access-Jwt-Assertion': 'forged',
      'X-Programmable-Notes': 'storage-v1',
    },
  });
  expect(forged.status()).toBe(401);
});

test('restoring a backup from a stale dirty device cannot overwrite the remote winner', async ({
  page,
  context,
  browser,
}) => {
  await owner(context);
  await page.goto('/');
  await saved(page);
  const download = page.waitForEvent('download');
  await command(page, 'Export workspace backup');
  const backup = readFileSync((await (await download).path())!);
  await page.route('**/api/storage/stage', (route) => route.abort());
  await command(page, 'Edit source');
  const draft = '# Keep my unsaved draft\n';
  await page.getByRole('textbox', { name: 'MDX source' }).fill(draft);
  await page.keyboard.press('Control+s');
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'error',
  );
  const retainedDraft = await exported(page);
  expect(retainedDraft.toString('utf8').replace(/\r\n/g, '\n')).toBe(draft);

  const remoteContext = await browser.newContext({
    baseURL: origin,
    ignoreHTTPSErrors: true,
  });
  try {
    await owner(remoteContext);
    const remote = await remoteContext.newPage();
    await remote.goto('/');
    await saved(remote);
    await command(remote, 'Edit source');
    const winner = '\uFEFF# Remote winner\r\nDo not overwrite.\r\n';
    await remote.getByRole('textbox', { name: 'MDX source' }).fill(winner);
    await remote.keyboard.press('Control+s');
    await saved(remote);

    await page.unroute('**/api/storage/stage');
    page.once('dialog', (dialog) => dialog.accept());
    await page.getByLabel('Choose workspace backup').setInputFiles({
      name: 'reviewed-backup.json',
      mimeType: 'application/json',
      buffer: backup,
    });
    await expect(page.locator('.web-shell')).toHaveAttribute(
      'data-save-status',
      'conflict',
    );
    expect(await exported(page)).toEqual(retainedDraft);
    await remote.reload();
    await saved(remote);
    expect(await exported(remote)).toEqual(Buffer.from(winner));
  } finally {
    await remoteContext.close();
  }
});
