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
  // Diagnose edge/login/interstitial responses without logging HTML, cookies,
  // redirected account hostnames or authentication query parameters.
  const html = await response.text();
  const origin = new URL(response.url()).origin;
  const diagnostic = JSON.stringify({
    status: response.status(),
    cloudflareServer: response.headers()['server'] === 'cloudflare',
    challengeHeader: response.headers()['cf-mitigated'] === 'challenge',
    stayedOnOrigin: origin === new URL(test.info().project.use.baseURL!).origin,
    accessLogin: new URL(response.url()).hostname.endsWith(
      '.cloudflareaccess.com',
    ),
    accessPage:
      /cloudflareaccess\.com|cloudflare access|cf-access|\/cdn-cgi\/access/i.test(
        html,
      ),
    appRoot: /\bid=["']root["']/.test(html),
    compiledApp: /\/assets\/index-[^"'\s]+\.js/.test(html),
    appTitle: /<title>Programmable Notes<\/title>/.test(html),
    cloudflareChallenge:
      /cf-chl-|challenges\.cloudflare\.com|Just a moment/i.test(html),
  });
  expect(response.ok()).toBe(true);
  expect(/src=["']\/src\/main\.tsx["']/.test(html), diagnostic).toBe(false);
  expect(/\/assets\/index-[^"'\s]+\.js/.test(html), diagnostic).toBe(true);
  expect(response.headers()['x-content-type-options']).toBe('nosniff');
  expect(response.headers()['referrer-policy'], diagnostic).toBe('no-referrer');
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

test('ordinary keyboard Markdown authoring remains usable after deployment', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFF# Hosted writing\r\n\r\nStart here.\r\n\r\n<span data-kept="yes">Opaque JSX</span>\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Keyboard.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByText('Start here.', { exact: true }).click();
  await page.keyboard.press('End');
  await page.keyboard.type(' Keep writing.');
  await page.keyboard.press('Enter');
  await page.keyboard.type('1. first');
  await page.keyboard.press('Enter');
  await page.keyboard.type('second');
  await expect(view.locator('ol > li'), await view.innerText()).toHaveCount(2);
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('- bullet');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Tab');
  await page.keyboard.type('nested');
  await expect(view.locator('ul ul li')).toHaveText('nested');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.press('Enter');
  await page.keyboard.type('## New heading');
  await expect(
    view.getByRole('heading', { level: 2, name: 'New heading' }),
  ).toBeVisible();
  await page.keyboard.press('Enter');
  await page.keyboard.type('**bold** and *italic* with `code`.');
  await expect(view.locator('strong'), await view.innerText()).toHaveText(
    'bold',
  );
  await expect(view.locator('em'), await view.innerText()).toHaveText('italic');
  await expect(
    view.locator('code').filter({ hasText: 'code' }),
    await view.innerText(),
  ).toHaveText('code');
  await page.keyboard.press('Control+Shift+K');
  await expect(page.getByRole('textbox', { name: 'Link URL' })).toBeVisible();
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toHaveCount(0);
  await page.getByRole('button', { name: 'Cancel', exact: true }).click();

  await expect(
    page.getByRole('toolbar', { name: 'Text formatting' }),
  ).toHaveCount(0);
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  const after = await exported(page);
  expect(
    after
      .toString()
      .startsWith(
        '\uFEFF# Hosted writing\r\n\r\nStart here.&#32;Keep&#32;writing.\r\n',
      ),
  ).toBe(true);
  expect(
    after.toString().endsWith('<span data-kept="yes">Opaque JSX</span>\r\n'),
  ).toBe(true);
  await saved(page);
  await page.reload();
  expect(await exported(page)).toEqual(after);
});

test('caret mathematics edits in place without forms and preserves source through undo and reload', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const original =
    '\uFEFF# Hosted math\r\n\r\nBefore $x^2$ after.\r\n\r\n$$\r\ny^2\r\n$$\r\n\r\n<span title="unchanged">Opaque</span>\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Caret.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view.getByRole('button', { name: 'Edit inline equation: x^2' }).click();
  const inline = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await expect(inline).toBeFocused();
  await expect(
    view.locator('input, textarea, .rendered-math-controls'),
  ).toHaveCount(0);
  await inline.fill('$x^3$');
  await inline.press('End');
  await inline.press('ArrowRight');
  await expect(inline).toHaveCount(0);
  await view
    .getByRole('button', { name: 'Edit display equation: y^2' })
    .click();
  const display = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await display.fill('$$\ny^2\n+ z^2\n$$');
  await expect(display).toHaveText('$$\ny^2\n+ z^2\n$$', {
    useInnerText: true,
  });
  await testInfo.attach('math-caret-source', {
    body: await view.screenshot(),
    contentType: 'image/png',
  });
  await display.press('Control+End');
  await display.press('ArrowDown');
  await expect(display).toHaveCount(0);
  await expect(view.locator('.katex-display')).toBeVisible();
  await testInfo.attach('math-caret-rendered', {
    body: await view.screenshot(),
    contentType: 'image/png',
  });
  const changed = original
    .replace('x^2', 'x^3')
    .replace('y^2\r\n', 'y^2\r\n+ z^2\r\n');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+z');
  expect(await exported(page)).toEqual(
    Buffer.from(original.replace('x^2', 'x^3')),
  );
  await source.press('Control+Shift+Z');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await saved(page);
  await page.reload();
  expect(await exported(page)).toEqual(Buffer.from(changed));
});

test('core plugins, hidden setup and nonblocking invalid mathematics work in the deployed editor', async ({
  page,
}, testInfo) => {
  await page.goto('/');
  const original =
    'import {useState} from "react"\n\nexport function Counter(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Plugin count {n}</button>}\n\n# Modular note\n\nA result $x \\in \\mathbb{R}$.\n\n<Counter />\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Modular.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await expect(view.locator('pre:visible')).toHaveCount(0);
  await expect(
    view.getByRole('button', { name: /Edit (source block|component source)/ }),
  ).toHaveCount(0);
  await page
    .frameLocator('iframe[title="Document preview"]')
    .getByRole('button', { name: 'Plugin count 0', exact: true })
    .click();
  await view
    .getByRole('button', { name: 'Edit inline equation: x \\in \\mathbb{R}' })
    .click();
  const math = page.getByRole('textbox', { name: 'Inline LaTeX source' });
  await math.fill('$x \\in \\mathbb{R$');
  await view.getByRole('heading', { name: 'Modular note' }).click();
  await expect(math).toHaveCount(0);
  await expect(view.locator('.rendered-math-invalid')).toHaveText(
    '$x \\in \\mathbb{R$',
  );
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  await testInfo.attach('invalid-latex-independent-source', {
    body: await view.screenshot(),
    contentType: 'image/png',
  });
  await command(page, 'Settings');
  let dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog
    .getByRole('checkbox', { name: 'Show component source in Preview' })
    .check();
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name: 'React components' }).uncheck();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).uncheck();
  await page
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  await expect(view.locator('.katex')).toHaveCount(0);
  await expect(
    view.locator('pre').filter({ hasText: 'export function Counter' }),
  ).toBeVisible();
  await saved(page);
  await page.reload();
  await expect(
    view.locator('pre').filter({ hasText: 'export function Counter' }),
  ).toBeVisible();
  await expect(page.locator('iframe[title="Document preview"]')).toHaveCount(0);
  await command(page, 'Settings');
  dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await expect(
    dialog.getByRole('checkbox', { name: 'React components' }),
  ).not.toBeChecked();
  await dialog.getByRole('checkbox', { name: 'React components' }).check();
  await dialog.getByRole('checkbox', { name: 'Mathematics' }).check();
  await testInfo.attach('core-plugin-settings', {
    body: await dialog.screenshot(),
    contentType: 'image/png',
  });
  await page
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  await view.locator('.rendered-math-invalid').getByRole('button').click();
  await math.fill('$x \\in \\mathbb{R}$');
  await view.getByRole('heading', { name: 'Modular note' }).click();
  await expect(view.locator('.rendered-math-invalid')).toHaveCount(0);
  await expect(view.locator('.katex')).toBeVisible();
  expect(await exported(page)).toEqual(Buffer.from(original));
});

test('hidden setup survives real selection replacement, undo, redo and exact reopening', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFFimport {useState} from "react"\r\n\r\nexport function Counter(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Count {n}</button>}\r\n\r\n# Hosted selection\r\n\r\nKeep setup intact.\r\n\r\n<Counter />\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'Selection.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect(
    page.getByRole('textbox', { name: 'Document title' }),
  ).toHaveValue('Selection');
  await command(page, 'Preview document');
  const view = page.locator('.rendered-editor .ProseMirror');
  await view
    .getByRole('heading', { name: 'Hosted selection', exact: true })
    .click();
  await page.keyboard.press('Control+a');
  await page.keyboard.insertText('Replacement body.');
  await expect(view).toContainText('Replacement body.');
  const changed = (await exported(page)).toString();
  expect(
    changed.startsWith(
      original.slice(0, original.indexOf('# Hosted selection')),
    ),
  ).toBe(true);
  expect(changed).toContain('Replacement body.');
  expect(changed).not.toContain('<Counter />');
  await view.getByText('Replacement body.', { exact: true }).click();
  await page.keyboard.press('Control+z');
  await expect(
    view.getByRole('heading', { name: 'Hosted selection', exact: true }),
  ).toBeVisible();
  expect(await exported(page)).toEqual(Buffer.from(original));
  await view
    .getByRole('heading', { name: 'Hosted selection', exact: true })
    .click();
  await page.keyboard.press('Control+Shift+z');
  await expect(view).toContainText('Replacement body.');
  expect(await exported(page)).toEqual(Buffer.from(changed));
  await saved(page);
  await page.reload();
  expect(await exported(page)).toEqual(Buffer.from(changed));
});

test('unfinished dollars stay literal and correct without notices on the deployed application', async ({
  page,
}, testInfo) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  const raw = "$$\r\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\r\n$";
  const source =
    '\uFEFF# Mathematics\r\n\r\n' + raw + '\r\n\r\nContinue writing here.\r\n';
  await page.getByLabel('Import note files').setInputFiles({
    name: 'literal-math.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await command(page, 'Preview document');
  const editor = page.getByRole('textbox', { name: 'Editable document' });
  await expect(
    editor.getByText('Continue writing here.', { exact: true }),
  ).toBeVisible();
  await expect(editor.locator('.katex, .rendered-math-invalid')).toHaveCount(0);
  await expect(page.getByRole('alert')).toHaveCount(0);
  await saved(page);
  expect(await exported(page)).toEqual(Buffer.from(source));
  await page.screenshot({
    path: testInfo.outputPath('literal-math-mobile.png'),
    fullPage: true,
  });
  await page.reload();
  await editor.getByRole('button', { name: /^Edit display equation:/ }).click();
  const field = page.getByRole('textbox', { name: 'Display LaTeX source' });
  await field.press('Control+End');
  await page.keyboard.insertText('$');
  await field.press('Control+Enter');
  await expect(editor.locator('.katex')).toHaveCount(1);
  await expect(page.getByRole('alert')).toHaveCount(0);
  expect(await exported(page)).toEqual(
    Buffer.from(source.replace(raw, () => raw + '$')),
  );
});
