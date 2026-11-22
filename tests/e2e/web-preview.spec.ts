import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const preview = (page: Page) =>
  page.frameLocator('iframe[title="Document preview"]');
async function setMode(page: Page, mode: 'source' | 'preview') {
  const panel = page.locator(`.web-${mode}-panel`);
  if (!(await panel.isVisible())) {
    // Keyboard focus inside an isolated document cannot invoke host shortcuts.
    await page.locator('.doc-title-row').click();
    await page.keyboard.press('Control+e');
  }
  await expect(panel).toBeVisible();
}
async function importNote(page: Page, source: string, name = 'fixture.mdx') {
  await page.getByLabel('Import note files').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
  await setMode(page, 'preview');
}
test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await expect(
    page.getByRole('main', { name: 'Document workspace' }),
  ).toBeVisible();
});

test('web default renders mathematics, GFM and bundled fonts inside the opaque preview', async ({
  page,
}) => {
  const frame = preview(page);
  await expect(frame.locator('.katex-display')).toBeVisible({ timeout: 20000 });
  await importNote(
    page,
    '## Scientific note\n\nInline $x^2 + y^2$.\n\n$$\n\\int_0^1 x^2\\,dx=\\frac{1}{3}\n$$\n\n| Property | Value |\n| --- | --- |\n| Result | Exact |\n\n- [x] Verified\n',
  );
  await expect(
    frame.getByRole('heading', { name: 'Scientific note' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(frame.locator('.katex')).toHaveCount(2);
  await expect(frame.getByRole('table')).toContainText('Result');
  await expect(frame.getByRole('checkbox')).toBeChecked();
  const typography = await frame.locator('body').evaluate(async (body) => {
    await document.fonts.ready;
    return {
      family: getComputedStyle(body).fontFamily,
      size: getComputedStyle(body).fontSize,
      loaded: [...document.fonts]
        .filter((font) => font.status === 'loaded')
        .map((font) => font.family),
    };
  });
  expect(typography.family).toContain('DM Sans Variable');
  expect(
    typography.loaded.some((family) => family.includes('DM Sans Variable')),
  ).toBe(true);
  expect(typography.loaded.some((family) => family.includes('KaTeX'))).toBe(
    true,
  );
  const lightBackground = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(frame.locator('html')).toHaveCSS(
    'background-color',
    lightBackground,
  );
  await expect
    .poll(() =>
      page
        .locator('iframe')
        .evaluate((element) => element.getBoundingClientRect().height),
    )
    .toBeGreaterThan(240);
  const originalFrame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame())!;
  for (const width of [760, 700]) {
    await page.setViewportSize({ width, height: 900 });
    const expectedSize = width > 720 ? '16px' : '15.5px';
    await expect(frame.locator('body')).toHaveCSS('font-size', expectedSize);
    const reading = await frame.locator('body').evaluate((body) => {
      const style = getComputedStyle(body);
      return {
        size: style.fontSize,
        weight: style.fontWeight,
        line: style.lineHeight,
        tracking: style.letterSpacing,
        color: style.color,
      };
    });
    await setMode(page, 'source');
    const writing = await page
      .getByRole('textbox', { name: 'MDX source' })
      .evaluate((body) => {
        const style = getComputedStyle(body);
        return {
          size: style.fontSize,
          weight: style.fontWeight,
          line: style.lineHeight,
          tracking: style.letterSpacing,
          color: style.color,
        };
      });
    expect(writing).toEqual(reading);
    await setMode(page, 'preview');
    expect(originalFrame.isDetached()).toBe(false);
  }
  // An opaque iframe with color-scheme:dark needs an explicit matching canvas,
  // otherwise Chromium may paint a darker rectangle than the host document.
  await page.setViewportSize({ width: 1280, height: 900 });
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill('Settings');
  await palette
    .getByRole('button', { name: /^Settings/ })
    .first()
    .click();
  await page.getByRole('button', { name: 'Dark', exact: true }).click();
  await page
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  await expect(page.locator('html')).toHaveAttribute('data-theme', 'dark');
  const hostBackground = await page
    .locator('body')
    .evaluate((element) => getComputedStyle(element).backgroundColor);
  await expect(frame.locator('html')).toHaveCSS(
    'background-color',
    hostBackground,
  );
  expect(hostBackground).toBe('rgb(25, 26, 27)');
  expect(originalFrame.isDetached()).toBe(false);
});

test('ordinary Markdown keeps expressions and import statements as source text', async ({
  page,
}) => {
  await importNote(
    page,
    '# Literal Markdown\n\nA set {x: x > 0}.\n\nimport Secret from "https://probe.invalid/module.js"\n\n<script>parent.postMessage({type:"overwrite"}, "*")</script>\n',
    'plain.md',
  );
  const frame = preview(page);
  await expect(
    frame.getByRole('heading', { name: 'Literal Markdown' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(frame.locator('body')).toContainText('A set {x: x > 0}.');
  await expect(frame.locator('body')).toContainText('import Secret from');
  await expect(frame.locator('script')).toHaveCount(1);
  await expect(page.locator('.web-preview-error')).toHaveCount(0);
});

test('MDX imports local TSX and mode switches preserve interactive React state', async ({
  page,
}) => {
  await page.getByLabel('Import note files').setInputFiles([
    {
      name: 'counter.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        "import Counter from './Counter.tsx'\n\n# Connected source\n\n<Counter />",
      ),
    },
    {
      name: 'Counter.tsx',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        "import {useState} from 'react'; export default function Counter(){const [count,setCount]=useState<number>(4);return <button onClick={()=>setCount(count+1)}>Count: {count}</button>}",
      ),
    },
  ]);
  const frame = preview(page);
  await expect(frame.getByRole('button', { name: 'Count: 4' })).toBeVisible({
    timeout: 20000,
  });
  await frame.getByRole('button', { name: 'Count: 4' }).click();
  await expect(frame.getByRole('button', { name: 'Count: 5' })).toBeVisible();
  const originalFrame = page
    .frames()
    .find((candidate) => candidate !== page.mainFrame())!;
  await setMode(page, 'source');
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toContainText(
    "import Counter from './Counter.tsx'",
  );
  await setMode(page, 'preview');
  await expect(frame.getByRole('button', { name: 'Count: 5' })).toBeVisible();
  expect(originalFrame.isDetached()).toBe(false);
  await page.getByRole('button', { name: 'Open right panel' }).click();
  await page
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  await page
    .getByRole('dialog', { name: 'Document actions', exact: true })
    .getByRole('button', { name: 'Pause', exact: true })
    .click();
  await page.getByRole('button', { name: /^Close Document actions$/ }).click();
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Resume preview' }).click();
  await expect(frame.getByRole('button', { name: 'Count: 4' })).toBeVisible({
    timeout: 20000,
  });
});

test('compile errors and runtime failures retain editable source and recover after correction', async ({
  page,
}) => {
  await setMode(page, 'source');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.fill('# Broken\n\n<Unclosed');
  await setMode(page, 'preview');
  await expect(page.locator('.web-preview-error')).toContainText(
    'Preview needs attention',
    { timeout: 20000 },
  );
  await setMode(page, 'source');
  await expect(editor).toContainText('<Unclosed');
  await editor.fill(
    "export function Broken(){throw new Error('Fixture runtime failure')}\n\n<Broken />",
  );
  await setMode(page, 'preview');
  await expect(page.locator('.web-preview-error')).toContainText(
    'Fixture runtime failure',
    { timeout: 20000 },
  );
  await setMode(page, 'source');
  await editor.fill('# Recovered\n\nMy source survived both failures.');
  await setMode(page, 'preview');
  await expect(
    preview(page).getByRole('heading', { name: 'Recovered' }),
  ).toBeVisible({ timeout: 20000 });
  await expect(page.locator('.web-preview-error')).toHaveCount(0);
});

test('web sandbox denies parent storage and network, and ignores forged authority and size messages', async ({
  page,
}) => {
  await page.evaluate(() =>
    localStorage.setItem('pn-private-fixture', 'host-only'),
  );
  const requests: string[] = [];
  const cspFailures: string[] = [];
  page.on('requestfailed', (request) => {
    if (
      request.url().includes('probe.invalid') &&
      /csp/i.test(request.failure()?.errorText || '')
    )
      cspFailures.push(request.url());
  });
  page.on('request', (request) => {
    if (request.url().includes('probe.invalid')) requests.push(request.url());
  });
  const source = `import {useState} from 'react'

export function Probe(){
  const [result,setResult]=useState('ready');
  return <button onClick={async()=>{
    const result={};
    for(const [name,read] of Object.entries({parentDOM:()=>parent.document.body.innerHTML,parentStorage:()=>parent.localStorage.getItem('pn-private-fixture'),ownStorage:()=>localStorage.getItem('pn-private-fixture'),database:()=>indexedDB.open('programmable-notes')})){
      try{read();result[name]='allowed'}catch{result[name]='denied'}
    }
    try{await fetch('https://probe.invalid/notes');result.network='allowed'}catch{result.network='denied'}
    parent.postMessage({type:'save',source:'OVERWRITE ATTEMPT'},'*');
    parent.postMessage({type:'preview-size',height:1e12},'*');
    parent.postMessage({type:'preview-size',height:9999,source:'FORGED'},'*');
    setResult(JSON.stringify(result));
  }}>Probe {result}</button>
}

<Probe />`;
  await importNote(page, source, 'boundary.mdx');
  const frame = preview(page);
  const button = frame.getByRole('button', { name: 'Probe ready' });
  await expect(button).toBeVisible({ timeout: 20000 });
  await button.click();
  for (const field of [
    'parentDOM',
    'parentStorage',
    'ownStorage',
    'database',
    'network',
  ]) {
    await expect(frame.getByRole('button')).toContainText(
      `"${field}":"denied"`,
    );
  }
  await expect.poll(() => cspFailures.toSorted()).toEqual(requests.toSorted());
  const height = await page
    .locator('iframe')
    .evaluate((element) => element.getBoundingClientRect().height);
  expect(height).toBeLessThan(9999);
  await setMode(page, 'source');
  await page.getByRole('button', { name: 'Open right panel' }).click();
  await page
    .getByRole('button', { name: 'Document actions', exact: true })
    .click();
  const download = page.waitForEvent('download');
  await page
    .getByRole('dialog', { name: 'Document actions', exact: true })
    .getByRole('button', { name: 'Export source', exact: true })
    .click();
  expect(readFileSync((await (await download).path())!, 'utf8')).toBe(source);
  expect(
    await page.evaluate(() => localStorage.getItem('pn-private-fixture')),
  ).toBe('host-only');
});
