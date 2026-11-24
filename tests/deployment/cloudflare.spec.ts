import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.describe.configure({ timeout: 60_000 });
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
async function exported(page: Page) {
  const result = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await result).path())!);
}
async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

test('hosting serves correct transport policies and compiler MIME without exposing control files', async ({
  request,
}) => {
  const response = await request.get('/');
  expect(response.ok()).toBe(true);
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['referrer-policy']).toBe('no-referrer');
  expect(response.headers()['x-frame-options']).toBe('DENY');
  expect(response.headers()['content-security-policy']).toContain(
    "frame-ancestors 'none'",
  );
  expect(response.headers()['cache-control']).toContain('no-cache');
  const canonical = await request.get('/index.html', {
    maxRedirects: 0,
  });
  expect(canonical.status()).toBeGreaterThanOrEqual(300);
  expect(canonical.status()).toBeLessThan(400);
  expect(canonical.headers()['location']).toBe('/');
  const serviceWorker = await request.get('/sw.js');
  expect(serviceWorker.headers()['cache-control']).toContain('no-cache');
  const source = await serviceWorker.text();
  const assets = JSON.parse(
    /const ASSETS = (.+);/.exec(source)![1]!,
  ) as string[];
  expect(assets).not.toContain('/_headers');
  expect(assets).not.toContain('/_redirects');
  const wasm = assets.find((path) => path.endsWith('.wasm'))!;
  expect(wasm).toBeTruthy();
  const binary = await request.get(wasm);
  expect(binary.ok()).toBe(true);
  expect(binary.headers()['content-type']).toContain('application/wasm');
  expect(binary.headers()['cache-control']).toContain('immutable');
  const control = await request.get('/_headers');
  expect(await control.text()).not.toContain('Referrer-Policy: no-referrer');
  const notices = await request.get('/THIRD_PARTY_NOTICES.txt');
  expect(notices.ok()).toBe(true);
  expect(notices.headers()['content-type']).toContain('text/plain');
  expect(await notices.text()).toContain('THIRD-PARTY NOTICES');
  expect(await notices.text()).toContain('Permission is hereby granted');
});

test('real MDX React stays interactive and unprivileged under hosting headers', async ({
  page,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
  const source =
    "\uFEFFimport {useState} from 'react'\r\n\r\nexport function Probe(){const [n,setN]=useState(0);const [result,setResult]=useState('ready');return <><button onClick={()=>setN(n+1)}>Count: {n}</button><button onClick={async()=>{let parentAccess,network;try{parent.document.body;parentAccess='allowed'}catch{parentAccess='denied'}try{await fetch('https://probe.invalid/hosting');network='allowed'}catch{network='denied'}parent.postMessage({type:'save',source:'FORGED'},'*');setResult(parentAccess+'/'+network)}}>Boundary: {result}</button></>}\r\n\r\n# Hosted React\r\n\r\n<Probe />\r\n";
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Hosted.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await command(page, 'Preview document');
  const frame = page.frameLocator('iframe[title="Document preview"]');
  const counter = frame.getByRole('button', { name: 'Count: 0' });
  await expect(counter).toBeVisible({ timeout: 20000 });
  await counter.click();
  await expect(frame.getByRole('button', { name: 'Count: 1' })).toBeVisible();
  const documentFrame = page
    .frames()
    .find((candidate) => candidate.parentFrame() === page.mainFrame())!;
  await documentFrame.evaluate(() => {
    addEventListener('securitypolicyviolation', (event) => {
      if (event.effectiveDirective === 'connect-src')
        document.documentElement.dataset.connectDenied = 'yes';
    });
  });
  await frame.getByRole('button', { name: 'Boundary: ready' }).click();
  await expect(
    frame.getByRole('button', { name: 'Boundary: denied/denied' }),
  ).toBeVisible();
  await expect(frame.locator('html')).toHaveAttribute(
    'data-connect-denied',
    'yes',
  );
  expect(await exported(page)).toEqual(Buffer.from(source));
});

test('visual and source edits retain exact bytes through history, saving and offline reopening', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
  const original =
    '\uFEFF# Hosted\r\n\r\nKeep café and whitespace.  \r\n\r\n$x+1$\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Exact.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const rendered = page.locator('.rendered-editor .ProseMirror');
  await rendered.getByRole('heading', { name: 'Hosted', exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' edited');
  const changed = original.replace('# Hosted', '# Hosted edited');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await command(page, 'Edit source');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.click();
  await page.keyboard.press('Control+z');
  expect(await exported(page)).toEqual(Buffer.from(original));
  await editor.click();
  await page.keyboard.press('Control+Shift+z');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('Tail.');
  const final = changed + 'Tail.';
  expect(await exported(page)).toEqual(Buffer.from(final));
  await saved(page);
  await page.reload();
  expect(await exported(page)).toEqual(Buffer.from(final));
  await page.waitForFunction(
    () => Boolean(navigator.serviceWorker.controller),
    undefined,
    { timeout: 20000 },
  );
  await context.setOffline(true);
  try {
    await page.reload();
    await expect(
      page.getByRole('main', { name: 'Document workspace' }),
    ).toBeVisible();
    await command(page, 'Preview document');
    await expect(rendered.locator('.katex')).toBeVisible({ timeout: 20000 });
    await expect(rendered).toContainText('Tail.');
    expect(await exported(page)).toEqual(Buffer.from(final));
  } finally {
    await context.setOffline(false);
  }
});
