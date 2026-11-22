import { expect, test, type Page } from '@playwright/test';
import { readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import path from 'node:path';

const contentTypes: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.wasm': 'application/wasm',
  '.json': 'application/json; charset=utf-8',
  '.webmanifest': 'application/manifest+json',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

async function updateFixture() {
  const directory = path.resolve('dist');
  const worker = await readFile(path.join(directory, 'sw.js'), 'utf8');
  const cacheDeclaration = /const CACHE = '([^']+)';/;
  const match = worker.match(cacheDeclaration);
  if (!match)
    throw new Error(
      'Build the production service worker before testing updates.',
    );
  let release = 0;
  const cacheName = () => `${match[1]}-update-test-${release}`;
  const server = createServer((request, response) => {
    void (async () => {
      if (request.method !== 'GET' && request.method !== 'HEAD') {
        response.writeHead(405).end();
        return;
      }
      const pathname = decodeURIComponent(
        new URL(request.url ?? '/', 'http://localhost').pathname,
      );
      const relative = pathname === '/' ? 'index.html' : pathname.slice(1);
      const file = path.resolve(directory, relative);
      if (!file.startsWith(directory + path.sep)) {
        response.writeHead(403).end();
        return;
      }
      // Exercise the production install/activate/fetch logic unchanged. Only
      // its cache version differs, as it would after another real build.
      const bytes =
        pathname === '/sw.js'
          ? Buffer.from(
              worker.replace(
                cacheDeclaration,
                `const CACHE = '${cacheName()}';`,
              ),
            )
          : await readFile(file);
      response.writeHead(200, {
        'Content-Type':
          contentTypes[path.extname(file)] ?? 'application/octet-stream',
        'Content-Length': bytes.byteLength,
        'Cache-Control':
          pathname === '/sw.js' ? 'no-store' : 'public, max-age=60',
      });
      response.end(request.method === 'HEAD' ? undefined : bytes);
    })().catch(() => {
      if (!response.headersSent) response.writeHead(404);
      response.end();
    });
  });
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  const address = server.address();
  if (!address || typeof address === 'string')
    throw new Error('No HTTP test port was assigned.');
  return {
    origin: `http://127.0.0.1:${address.port}`,
    cacheName,
    nextRelease: () => {
      release++;
    },
    close: () =>
      new Promise<void>((resolve, reject) => {
        server.close((error) => (error ? reject(error) : resolve()));
        server.closeAllConnections();
      }),
  };
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 15_000 },
  );
}

async function command(page: Page, name: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(name);
  await palette
    .getByRole('button', { name: new RegExp('^' + name) })
    .first()
    .click();
}

async function storedDocument(page: Page) {
  return page.evaluate(
    () =>
      new Promise<{
        selected: string;
        title: string;
        source: string;
        theme: string;
        mode: string;
      }>((resolve, reject) => {
        const opening = indexedDB.open('programmable-notes-web-v1');
        opening.onerror = () => reject(opening.error);
        opening.onsuccess = () => {
          const database = opening.result;
          const read = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
          read.onsuccess = () => {
            database.close();
            const state = read.result.state;
            const selected = state.workspace.selected;
            resolve({
              selected,
              title: state.documents[selected].title,
              source: state.workspace.files[selected],
              theme: state.theme,
              mode: state.mode,
            });
          };
        };
      }),
  );
}

test('saves and activates a real service worker update after an idle save without losing the document', async ({
  page,
}) => {
  test.setTimeout(60_000);
  const fixture = await updateFixture();
  try {
    await page.goto(fixture.origin);
    await saved(page);
    await page.evaluate(async () => {
      await navigator.serviceWorker.ready;
    });
    await expect
      .poll(() =>
        page.evaluate(() => Boolean(navigator.serviceWorker.controller)),
      )
      .toBe(true);
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([fixture.cacheName()]);

    const source =
      '# Update survival\n\nKeep this exact text: café, λ, and ∇f.\n';
    await page.getByLabel('Import note files').setInputFiles({
      name: 'Update-survival.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    });
    await expect
      .poll(async () => (await storedDocument(page)).source)
      .toBe(source);
    await command(page, 'Edit source');
    await saved(page);
    await command(page, 'Settings');
    const settings = page.getByRole('dialog', {
      name: 'Settings',
      exact: true,
    });
    await settings.getByRole('button', { name: 'Dark', exact: true }).click();
    await expect(
      settings.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();
    await expect
      .poll(async () => (await storedDocument(page)).theme)
      .toBe('dark');
    const before = await storedDocument(page);
    expect(before).toMatchObject({
      source,
      title: 'Update-survival',
      theme: 'dark',
      mode: 'source',
    });
    // A save with no dirty generation formerly left a resolved in-flight
    // promise behind. The next update action must still finish and reload.
    await page.keyboard.press('Control+s');
    await expect(
      settings.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();

    const oldCache = fixture.cacheName();
    fixture.nextRelease();
    await page.evaluate(async () => {
      const registration = await navigator.serviceWorker.getRegistration();
      if (!registration)
        throw new Error('The initial service worker was not registered.');
      await registration.update();
    });
    const update = settings.getByRole('button', {
      name: 'Save and update app',
      exact: true,
    });
    await expect(update).toBeVisible({ timeout: 20_000 });
    await expect
      .poll(() =>
        page.evaluate(
          async () =>
            (await navigator.serviceWorker.getRegistration())?.waiting?.state,
        ),
      )
      .toBe('installed');
    await expect(
      settings.getByText('Saved in this browser', { exact: true }),
    ).toBeVisible();

    const reloaded = page.waitForEvent('framenavigated', {
      predicate: (frame) => frame === page.mainFrame(),
      timeout: 15_000,
    });
    await update.click();
    await reloaded;
    await saved(page);
    await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveText(
      source,
      { useInnerText: true },
    );
    await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
    expect(await storedDocument(page)).toEqual(before);
    expect(
      await page.evaluate(
        () =>
          (
            performance.getEntriesByType(
              'navigation',
            )[0] as PerformanceNavigationTiming
          ).type,
      ),
    ).toBe('reload');
    await expect
      .poll(() => page.evaluate(() => caches.keys()))
      .toEqual([fixture.cacheName()]);
    expect(await page.evaluate(() => caches.keys())).not.toContain(oldCache);
    await expect
      .poll(() =>
        page.evaluate(async () => {
          const registration = await navigator.serviceWorker.getRegistration();
          return {
            active: registration?.active?.state,
            waiting: Boolean(registration?.waiting),
          };
        }),
      )
      .toEqual({ active: 'activated', waiting: false });
  } finally {
    await fixture.close();
  }
});
