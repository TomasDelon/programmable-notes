import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';
const fixture = (name: string) =>
  readFileSync(`docs/handoff/samples/fixtures/${name}`, 'utf8');
async function open(
  page: import('@playwright/test').Page,
  source: string,
  name = 'note.mdx',
) {
  await page.getByLabel('Open files').setInputFiles({
    name,
    mimeType: 'text/plain',
    buffer: Buffer.from(source),
  });
}
test('unsaved MDX hooks, editor updates, errors, TSX imports, pinned package, and source fidelity', async ({
  page,
}) => {
  await page.goto('/');
  const frame = page.frameLocator('iframe');
  await expect(frame.getByRole('button', { name: 'Count: 0' })).toBeVisible({
    timeout: 20000,
  });
  await frame.getByRole('button').click();
  await frame.getByRole('button').click();
  await expect(frame.getByRole('button')).toHaveText('Count: 2');
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.fill('# Unsaved\n\nHello live buffer');
  await expect(frame.getByRole('heading', { name: 'Unsaved' })).toBeVisible({
    timeout: 20000,
  });
  await editor.fill(fixture('invalid.mdx'));
  await expect(page.getByRole('alert')).toContainText('note.mdx');
  await expect(editor).toContainText('BrokenComponent');
  await editor.fill(fixture('imported-counter.mdx'));
  await expect(frame.getByRole('button', { name: 'Imported: 5' })).toBeVisible({
    timeout: 20000,
  });
  await frame.getByRole('button').click();
  await expect(frame.getByRole('button')).toHaveText('Imported: 6');
  await editor.fill(
    "import clsx from 'clsx'\n\n<div className={clsx('one',false && 'two')}>Pinned dependency</div>",
  );
  await expect(frame.locator('.one')).toHaveText('Pinned dependency', {
    timeout: 20000,
  });
  await open(page, fixture('mixed-source.mdx'));
  await expect(
    frame.getByRole('heading', { name: 'Lesson title' }),
  ).toBeVisible({ timeout: 20000 });
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  const file = await download;
  expect(readFileSync((await file.path())!, 'utf8')).toBe(
    fixture('mixed-source.mdx'),
  );
  await open(page, readFileSync((await file.path())!, 'utf8'), 'reopened.mdx');
  await expect(
    frame.getByRole('heading', { name: 'Lesson title' }),
  ).toBeVisible({ timeout: 20000 });
});
test('sandbox denies DOM, storage, network, resources, popup, top navigation and forged messages', async ({
  page,
}) => {
  await page.goto('/');
  await page.evaluate(() => {
    localStorage.setItem('secret', 'host-only');
  });
  const requests: string[] = [];
  const blocked: string[] = [];
  page.on('requestfailed', (r) => {
    if (/csp/i.test(r.failure()?.errorText || '')) blocked.push(r.url());
  });
  page.on('request', (r) => {
    if (r.url().includes('probe.invalid') || r.url().includes('127.0.0.1:9'))
      requests.push(r.url());
  });
  await open(
    page,
    `export function Probe(){
 const [result,setResult]=React.useState('waiting');
 return <button onClick={async()=>{const r={};
 for(const [k,f] of Object.entries({dom:()=>parent.document.title,storage:()=>parent.localStorage.secret,ownStorage:()=>localStorage.secret,native:()=>window.__TAURI_INTERNALS__.invoke('plugin:fs|read_file',{path:'/etc/passwd'}),popup:()=>{if(!window.open('https://probe.invalid')) throw Error();},top:()=>{top.location.href='https://probe.invalid';}})){try{f();r[k]='allowed';}catch{r[k]='denied';}}
 for(const url of ['https://probe.invalid','http://127.0.0.1:9']){try{await fetch(url);r[url]='allowed';}catch{r[url]='denied';}}
 const image=new Image();image.src='https://probe.invalid/pixel';document.body.append(image);
 const script=document.createElement('script');script.src='https://probe.invalid/evil.js';document.body.append(script);
 parent.postMessage({type:'save',path:'/etc/passwd',content:'bad'},'*');
 setResult(JSON.stringify(r));}}>Probe {result}</button>;
}

import * as React from 'react'

<Probe />`,
  );
  const button = page.frameLocator('iframe').getByRole('button');
  await expect(button).toContainText('waiting', { timeout: 20000 });
  await button.click();
  await expect(button).toContainText('"dom":"denied"');
  for (const key of [
    'storage',
    'ownStorage',
    'native',
    'popup',
    'top',
    'https://probe.invalid',
    'http://127.0.0.1:9',
  ])
    await expect(button).toContainText(`"${key}":"denied"`);
  await expect.poll(() => blocked.sort()).toEqual(requests.sort());
  expect(requests).toEqual(
    expect.arrayContaining([
      'https://probe.invalid/pixel',
      'https://probe.invalid/evil.js',
    ]),
  );
  expect(page.url()).toContain('127.0.0.1:4173');
  await page.evaluate(() =>
    window.postMessage({ type: 'preview-error', message: 'forged' }, '*'),
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('original handoff malicious fixture is confined', async ({ page }) => {
  await page.goto('/');
  const reports: unknown[] = [];
  page.on('console', async (msg) => {
    for (const arg of msg.args()) {
      const value = await arg.jsonValue().catch(() => null);
      if (value && typeof value === 'object') reports.push(value);
    }
  });
  await open(page, fixture('security-attempt.mdx'));
  await page
    .frameLocator('iframe')
    .getByRole('button', { name: 'Run sandbox negative test' })
    .click({ timeout: 20000 });
  await expect
    .poll(() => reports)
    .toContainEqual({ parentAccess: 'denied', networkAttempt: 'denied' });
});
test('runtime crash is contained and source remains editable; forbidden imports fail closed', async ({
  page,
}) => {
  await page.goto('/');
  await open(
    page,
    "export function Crash(){throw Error('fixture crash')}\n\n<Crash />",
  );
  await expect(page.getByRole('alert')).toContainText('fixture crash', {
    timeout: 20000,
  });
  await page.getByRole('textbox').fill("import fs from 'node:fs'\n\n# Denied");
  await expect(page.getByRole('alert')).toContainText('Import not permitted', {
    timeout: 20000,
  });
  await page.getByRole('textbox').fill('# Recovered');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Recovered' }),
  ).toBeVisible({ timeout: 20000 });
});

test('new workspace TSX imports work offline; CRLF no-op save and Stop cancellation', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Open files').setInputFiles([
    {
      name: 'fresh.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from("import Widget from './FreshWidget'\n\n<Widget />"),
    },
    {
      name: 'FreshWidget.tsx',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        "import {useState} from 'react'; export default function Widget(){const [n,s]=useState(7); return <button onClick={()=>s(n+1)}>Fresh {n}</button>}",
      ),
    },
  ]);
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: 'Fresh 7' }),
  ).toBeVisible({ timeout: 20000 });
  await page.context().setOffline(true);
  await page.getByRole('button', { name: 'Rebuild preview' }).click();
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: 'Fresh 7' }),
  ).toBeVisible({ timeout: 20000 });
  await page.context().setOffline(false);
  const widgetPath = await page
    .getByLabel('Source file')
    .locator('option')
    .filter({ hasText: 'FreshWidget.tsx' })
    .getAttribute('value');
  await page
    .getByLabel('Source file')
    .selectOption(widgetPath || { label: 'opened-1/FreshWidget.tsx' });
  const editor = page.getByRole('textbox');
  await editor.press('Control+z');
  await expect(editor).toContainText('export default function Widget');
  const crlf = '# CRLF\r\n\r\nUnchanged.\r\n';
  await open(page, crlf, 'crlf.mdx');
  const waiting = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  const download = await waiting;
  expect(readFileSync((await download.path())!, 'utf8')).toBe(crlf);
  await page.getByRole('textbox').fill('# First');
  await page.getByRole('textbox').fill('# Latest');
  await expect(
    page.frameLocator('iframe').getByRole('heading', { name: 'Latest' }),
  ).toBeVisible({ timeout: 20000 });
  await page.getByRole('button', { name: 'Rebuild preview' }).click();
  await page.getByRole('button', { name: 'Stop preview' }).click();
  await expect(page.getByRole('status')).toHaveText('Preview stopped');
  await page.waitForTimeout(1500);
  await expect(page.locator('iframe')).toHaveCount(0);
});

test('browser import preserves a UTF-8 BOM and refuses malformed UTF-8', async ({
  page,
}) => {
  await page.goto('/');
  const original = '\uFEFF# Encoded\r\n\r\nCafé\r\n';
  await open(page, original, 'encoded.mdx');
  await expect(page.getByLabel('Source file')).toHaveValue(/encoded\.mdx$/);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  const download = await pending;
  expect(readFileSync((await download.path())!)).toEqual(Buffer.from(original));

  await page.getByLabel('Open files').setInputFiles({
    name: 'invalid.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from([0xc3, 0x28]),
  });
  await expect(page.locator('[data-file-error]')).toContainText('UTF-8');
  await expect(page.getByLabel('Source file')).toHaveValue(/encoded\.mdx$/);
});

test('paragraph edits preserve mixed MDX bytes and support exact undo and redo', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    "import React from 'react'\r\n\r\nEditable paragraph.\r\n\r\n<div><span>Nested JSX</span></div>\r\n\r\n{/* keep comment */}\r\n";
  await open(page, original, 'visual.mdx');
  await page.getByRole('button', { name: 'Edit rendered Markdown' }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await expect(panel.getByRole('button', { name: 'Nested JSX' })).toHaveCount(
    0,
  );
  await panel.getByRole('button', { name: 'Editable paragraph.' }).click();
  await panel.getByLabel('Paragraph text').fill('Updated paragraph.');
  await panel.getByRole('button', { name: 'Apply paragraph edit' }).click();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  const updated = original.replace('Editable paragraph.', 'Updated paragraph.');
  async function expectDownload(expected: string) {
    const pending = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Save source' }).click();
    expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(
      expected,
    );
  }
  await expectDownload(updated);
  await source.press('Control+z');
  await expectDownload(original);
  await source.press('Control+Shift+z');
  await expectDownload(updated);
  await panel.getByRole('button', { name: 'Updated paragraph.' }).click();
  await source.fill('Different source.');
  await panel.getByRole('button', { name: 'Apply paragraph edit' }).click();
  await expect(panel.getByRole('alert')).toContainText('Paragraph changed');
  await expectDownload('Different source.');
});

test('an edited heading can be downloaded and reopened without rewriting its markers', async ({
  page,
}) => {
  await page.goto('/');
  const original = '##   Original title  ##\r\n\r\nUnchanged paragraph.\r\n';
  await open(page, original, 'heading.mdx');
  await page.getByRole('button', { name: 'Edit rendered Markdown' }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await panel
    .getByRole('heading', { name: 'Original title', level: 2 })
    .getByRole('button')
    .click();
  await panel.getByLabel('Heading text').fill('New title');
  await panel.getByRole('button', { name: 'Apply heading edit' }).click();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  const bytes = readFileSync((await (await pending).path())!);
  expect(bytes).toEqual(
    Buffer.from(original.replace('Original title', 'New title')),
  );
  await page.reload();
  await page.getByLabel('Open files').setInputFiles({
    name: 'reopened.mdx',
    mimeType: 'text/plain',
    buffer: bytes,
  });
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'New title', level: 2 }),
  ).toBeVisible();
});

test('the rendered list editor patches only a simple item', async ({
  page,
}) => {
  await page.goto('/');
  const original = '- First item\r\n- Second item\r\n\r\n<div>Opaque</div>\r\n';
  await open(page, original, 'list.mdx');
  await page.getByRole('button', { name: 'Edit rendered Markdown' }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await panel
    .getByRole('list')
    .getByRole('button', { name: 'Second item' })
    .click();
  await panel.getByLabel('List item text').fill('Updated item');
  await panel.getByRole('button', { name: 'Apply list item edit' }).click();
  await expect(
    page.frameLocator('iframe').getByText('Updated item'),
  ).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(
    original.replace('Second item', 'Updated item'),
  );
});
