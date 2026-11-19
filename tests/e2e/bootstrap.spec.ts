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
  const probeSource = `export function Probe(){
 const [result,setResult]=React.useState('waiting');
 return <button onClick={async()=>{const r={};
 for(const [k,f] of Object.entries({dom:()=>parent.document.title,storage:()=>parent.localStorage.secret,ownStorage:()=>localStorage.secret,native:()=>window.__TAURI_INTERNALS__.invoke('plugin:fs|read_file',{path:'/etc/passwd'}),popup:()=>{if(!window.open('https://probe.invalid')) throw Error();},top:()=>{top.location.href='https://probe.invalid';}})){try{f();r[k]='allowed';}catch{r[k]='denied';}}
 for(const url of ['https://probe.invalid','http://127.0.0.1:9']){try{await fetch(url);r[url]='allowed';}catch{r[url]='denied';}}
 const image=new Image();image.src='https://probe.invalid/pixel';document.body.append(image);
 const script=document.createElement('script');script.src='https://probe.invalid/evil.js';document.body.append(script);
 parent.postMessage({type:'save',path:'/etc/passwd',content:'bad'},'*');
 parent.postMessage({type:'apply-markdown-edit',from:0,to:6,text:'Changed'},'*');
 parent.postMessage({type:'compiler-diagnostics',locations:[{file:'note.mdx',line:1}]},'*');
 setResult(JSON.stringify(r));}}>Probe {result}</button>;
}

import * as React from 'react'

<Probe />`;
  await open(page, probeSource);
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
  await expect(
    page.getByRole('button', { name: /^Open .* at line / }),
  ).toHaveCount(0);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(
    probeSource,
  );
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
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await expect(panel.getByRole('button', { name: 'Nested JSX' })).toHaveCount(
    0,
  );
  await panel.getByRole('button', { name: 'Editable paragraph.' }).click();
  await panel.getByLabel('Paragraph text').fill('Updated paragraph.');
  await panel.getByLabel('Paragraph text').press('Enter');
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
  const selection = page.getByLabel('Source file');
  const editedKey = await selection.inputValue();
  await selection.selectOption('note.mdx');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(source).toContainText('useState');
  await selection.selectOption(editedKey);
  await expect(source).toContainText('Updated paragraph.');
  await source.press('Control+z');
  await expectDownload(original);
  await source.press('Control+Shift+z');
  await expectDownload(updated);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await panel.getByRole('button', { name: 'Updated paragraph.' }).click();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await panel.getByLabel('Paragraph text').press('Enter');
  await expect(panel.getByRole('alert')).toContainText('Paragraph changed');
  await expectDownload(original);
});

test('an edited heading can be downloaded and reopened without rewriting its markers', async ({
  page,
}) => {
  await page.goto('/');
  const original = '##   Original title  ##\r\n\r\nUnchanged paragraph.\r\n';
  await open(page, original, 'heading.mdx');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await panel
    .getByRole('heading', { name: 'Original title', level: 2 })
    .getByRole('button')
    .click();
  await panel.getByLabel('Heading text').fill('New title');
  await panel.getByLabel('Heading text').press('Enter');
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
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await panel
    .getByRole('list')
    .getByRole('button', { name: 'Second item' })
    .click();
  await panel.getByLabel('List item text').fill('Updated item');
  await panel.getByLabel('List item text').press('Enter');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(
    page.frameLocator('iframe').getByText('Updated item'),
  ).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(
    original.replace('Second item', 'Updated item'),
  );
});

test('compiler diagnostics identify the syntax error in the imported file', async ({
  page,
}) => {
  await page.goto('/');
  await page.getByLabel('Open files').setInputFiles([
    {
      name: 'diagnostics.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from("import Widget from './Broken'\n\n<Widget />"),
    },
    {
      name: 'Broken.tsx',
      mimeType: 'text/plain',
      buffer: Buffer.from(
        'export default function Widget() {\n  const value = ;\n  return <p>{value}</p>;\n}',
      ),
    },
  ]);
  await expect(page.getByRole('alert')).toContainText(/Broken\.tsx:2:17:/);
  const selection = page.getByLabel('Source file');
  const module = await selection
    .locator('option')
    .filter({ hasText: 'Broken.tsx' })
    .getAttribute('value');
  await page
    .getByRole('button', { name: 'Open Broken.tsx at line 2', exact: true })
    .click();
  await expect(selection).toHaveValue(module!);
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await expect(source).toBeFocused();
  await page.keyboard.insertText('// ');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await download).path())!, 'utf8')).toBe(
    'export default function Widget() {\n//   const value = ;\n  return <p>{value}</p>;\n}',
  );
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill(
      'export default function Widget() { return <p>Recovered import</p>; }',
    );
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(
    page.frameLocator('iframe').getByText('Recovered import'),
  ).toBeVisible();
});

test('rebuild retries after a transient compiler download failure', async ({
  page,
}) => {
  await page.route('**/*.wasm', (route) => route.abort());
  await page.goto('/');
  await expect(page.getByRole('status')).toHaveText('Build failed');
  await page.unroute('**/*.wasm');
  await page.getByRole('button', { name: 'Rebuild preview' }).click();
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: 'Count: 0' }),
  ).toBeVisible();
});

test('explicit browser draft survives reload and restores into a separate buffer', async ({
  page,
}) => {
  await page.goto('/');
  const draft = '# Draft\r\n\r\nKeep this text.\r\n';
  await open(page, draft, 'draft.mdx');
  const selection = page.getByLabel('Source file');
  await expect(selection).toHaveValue(/draft\.mdx$/);
  await page.getByText('Browser draft', { exact: true }).click();
  await page.getByRole('button', { name: 'Keep local draft' }).click();
  await expect(page.getByText('Draft stored in this browser.')).toBeVisible();
  await page.reload();
  await expect(selection).toHaveValue('note.mdx');
  await page.getByText('Browser draft', { exact: true }).click();
  await page.getByRole('button', { name: 'Restore local draft' }).click();
  await expect(selection).toHaveValue(/draft\.mdx$/);
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(selection.locator('option[value="note.mdx"]')).toHaveCount(1);
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(draft);
  await page.getByRole('button', { name: 'Delete local draft' }).click();
  await page.getByRole('button', { name: 'Restore local draft' }).click();
  await expect(page.getByText('No local draft is stored.')).toBeVisible();
});

test('automatic drafts require opt-in and track only the selected source', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, '# Draft\r\n', 'autosave.mdx');
  const selection = page.getByLabel('Source file');
  await expect(selection).toHaveValue(/autosave\.mdx$/);
  await page.getByText('Browser draft', { exact: true }).click();
  await page
    .getByRole('button', { name: 'Enable automatic drafts for this document' })
    .click();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.fill('Latest draft.');
  await expect(page.getByText('Draft updated in this browser.')).toBeVisible();
  await selection.selectOption('note.mdx');
  await source.fill('Different document.');
  await page.getByRole('button', { name: 'Restore local draft' }).click();
  await expect(source).toHaveText('Latest draft.');
  await expect(page.getByText('Unsaved changes')).toBeVisible();
  await expect(
    page.getByRole('button', {
      name: 'Enable automatic drafts for this document',
    }),
  ).toBeVisible();
});

test('Setext inline editing cancels with Escape and preserves the underline on save', async ({
  page,
}) => {
  await page.goto('/');
  const original = 'Original title\r\n======\r\n\r\n<em>Opaque JSX</em>\r\n';
  await open(page, original, 'setext.mdx');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  const heading = panel.getByRole('heading', {
    name: 'Original title',
    level: 1,
  });
  const inline = panel.getByRole('textbox', { name: 'Heading text' });
  await heading.getByRole('button').click();
  await inline.fill('Discarded title');
  await inline.press('Escape');
  await expect(heading).toBeVisible();
  await heading.getByRole('button').click();
  await inline.fill('New title');
  await inline.press('Enter');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(
    page
      .frameLocator('iframe')
      .getByRole('heading', { name: 'New title', level: 1 }),
  ).toBeVisible();
  const pending = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source' }).click();
  expect(readFileSync((await (await pending).path())!, 'utf8')).toBe(
    original.replace('Original title', 'New title'),
  );
});

for (const viewport of [
  { width: 1440, height: 1000 },
  { width: 820, height: 1180 },
  { width: 390, height: 844 },
]) {
  test(`unified modes preserve React state and lossless multiline edits at ${viewport.width}px`, async ({
    page,
  }) => {
    await page.setViewportSize(viewport);
    await page.goto('/');
    const counter = page
      .frameLocator('iframe')
      .getByRole('button', { name: /^Count:/ });
    await counter.click();
    await expect(counter).toHaveText('Count: 1');
    await expect(
      page.getByRole('region', { name: 'Markdown editing' }),
    ).toHaveCount(0);
    await page.getByRole('button', { name: 'Visual', exact: true }).click();
    await expect(page.locator('iframe')).toBeHidden();
    await expect(
      page.getByRole('textbox', { name: 'MDX source' }),
    ).toBeHidden();
    await page.getByRole('button', { name: 'Source', exact: true }).click();
    await expect(
      page.getByRole('textbox', { name: 'MDX source' }),
    ).toBeVisible();
    await page.getByRole('button', { name: 'Split', exact: true }).click();
    await expect(counter).toHaveText('Count: 1');
    const original =
      '## Notes\r\n\r\nBudget: €20 (approx.); 50% + tax.\r\n\r\n<div><span>Opaque JSX</span></div>\r\n';
    await open(page, original, 'punctuation.mdx');
    await page.getByRole('button', { name: 'Visual', exact: true }).click();
    const panel = page.getByRole('region', { name: 'Markdown editing' });
    await panel.getByRole('button', { name: 'Budget:', exact: false }).click();
    const field = panel.getByRole('textbox', { name: 'Paragraph text' });
    await field.fill('Revised: €30 (approx.); 75% + tax.');
    await field.press('Shift+Enter');
    await field.press('End');
    // fill also exercises browser paste containing soft line breaks.
    await field.fill(
      'Revised: €30 (approx.); 75% + tax.\nSecond line / preserved.',
    );
    await field.press('Enter');
    await expect(panel.getByRole('button', { name: /Revised:/ })).toBeVisible();
    await page.getByRole('button', { name: 'Undo', exact: true }).click();
    await expect(panel.getByRole('button', { name: /Budget:/ })).toBeVisible();
    await page.getByRole('button', { name: 'Redo', exact: true }).click();
    const waiting = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    const bytes = readFileSync((await (await waiting).path())!);
    expect(bytes.toString()).toBe(
      original.replace(
        'Budget: €20 (approx.); 50% + tax.',
        'Revised: €30 (approx.); 75% + tax.\r\nSecond line / preserved.',
      ),
    );
    await page.reload();
    await page.getByLabel('Open files').setInputFiles({
      name: 'reopened.mdx',
      mimeType: 'text/plain',
      buffer: bytes,
    });
    await expect(
      page.getByRole('textbox', { name: 'MDX source' }),
    ).toContainText('Second line / preserved.');
    expect(
      await page.evaluate(
        () => document.documentElement.scrollWidth <= innerWidth,
      ),
    ).toBe(true);
  });
}

test('pending visual input survives mode changes and rejects a changed source revision', async ({
  page,
}) => {
  await page.goto('/');
  await open(page, 'Original paragraph.\n\n<Widget />\n', 'revision.mdx');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page
    .getByRole('button', { name: 'Original paragraph.', exact: true })
    .click();
  const field = page.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Pending edit.');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('External paragraph.\n\n<Widget />\n');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(field).toHaveValue('Pending edit.');
  await field.press('Enter');
  await expect(
    page.getByRole('region', { name: 'Markdown editing' }).getByRole('alert'),
  ).toContainText('Paragraph changed');
  await field.press('Escape');
  await expect(
    page.getByRole('button', { name: 'External paragraph.', exact: true }),
  ).toBeFocused();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page
    .getByRole('textbox', { name: 'MDX source' })
    .fill('Visible text.\n\n<Broken');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('No safe visual mapping');
});

test('opaque metadata, fences and Unicode survive visual edits, stale revisions and exact reopen', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFF---\r\ntitle: "A 😀 note"\r\n---\r\n\r\nimport {useState} from "react"\r\n\r\nexport function Widget(){const [n,setN]=useState(0);return <button onClick={()=>setN(n+1)}>Clicks: {n}</button>}\r\n\r\nCafe\u0301 😀 paragraph.\r\n\r\n```tsx\r\nconst nested = <Widget value={{literal: true}} />\r\n```\r\n\r\n{/* keep comment exactly */}\r\n\r\n<Widget />\r\n';
  await open(page, original, 'metadata.mdx');
  const counter = page
    .frameLocator('iframe')
    .getByRole('button', { name: 'Clicks: 0' });
  await counter.click();
  await expect(
    page.frameLocator('iframe').getByRole('button', { name: 'Clicks: 1' }),
  ).toBeVisible();
  async function exported() {
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    return readFileSync((await (await pending).path())!);
  }
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await expect(panel.getByRole('button', { name: /title:/ })).toHaveCount(0);
  await panel
    .getByRole('button', { name: 'Cafe\u0301 😀 paragraph.', exact: true })
    .click();
  const field = panel.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Updated 😀 paragraph.');
  await field.press('Enter');
  const updated = original.replace(
    'Cafe\u0301 😀 paragraph.',
    'Updated 😀 paragraph.',
  );
  expect(await exported()).toEqual(Buffer.from(updated));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(updated));
  await panel
    .getByRole('button', { name: 'Updated 😀 paragraph.', exact: true })
    .click();
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const changed = updated.replace('A 😀 note', 'B 😀 note');
  await page.getByRole('textbox', { name: 'MDX source' }).fill(changed);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await field.press('Enter');
  await expect(panel.getByRole('alert')).toContainText('Paragraph changed');
  expect(await exported()).toEqual(Buffer.from(changed));
  await page.reload();
  await page.getByLabel('Open files').setInputFiles({
    name: 'reopened.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(changed),
  });
  expect(await exported()).toEqual(Buffer.from(changed));
});

test('preserves mixed physical line endings through checked patches, source edits and undo', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    'import React from "react"\r\n\r\nFirst paragraph.\n\nSecond paragraph.\r\n\r\n<div data-value={{literal: true}}>Opaque JSX</div>\n\nLast paragraph.';
  await open(page, original, 'mixed-endings.mdx');
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  async function exported() {
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    return readFileSync((await (await pending).path())!);
  }
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  const panel = page.getByRole('region', { name: 'Markdown editing' });
  await panel
    .getByRole('button', { name: 'Last paragraph.', exact: true })
    .click();
  const field = panel.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Last changed.\nSoft break.');
  await field.press('Enter');
  const updated = original.replace(
    'Last paragraph.',
    'Last changed.\r\nSoft break.',
  );
  expect(await exported()).toEqual(Buffer.from(updated));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(updated));
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+End');
  await page.keyboard.insertText(' Tail.');
  expect(await exported()).toEqual(Buffer.from(updated + ' Tail.'));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(updated));
});

test('MDX compiler navigation uses original physical lines without changing source', async ({
  page,
}) => {
  await page.goto('/');
  const original = '# Café 😀\r\n\r\n<Broken';
  await open(page, original, 'syntax.mdx');
  await page
    .getByRole('button', { name: 'Open syntax.mdx at line 3', exact: true })
    .click();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await expect(source).toBeFocused();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(original),
  );
  // Repeating the request must work when already viewing the same source.
  await page
    .getByRole('button', { name: 'Open syntax.mdx at line 3', exact: true })
    .click();
  await source.press('Shift+End');
  await page.keyboard.insertText('Recovered text.');
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await expect(
    page.frameLocator('iframe').getByText('Recovered text.'),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(page.getByRole('alert')).toContainText('syntax.mdx');
});

test('JavaScript Unicode line terminators navigate to the original module offset', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    'export default function Widget(){\u2028 const value=;\u2029 return <p>Recovered</p>; }';
  await page.getByLabel('Open files').setInputFiles([
    {
      name: 'unicode.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from("import Widget from './Broken'\n\n<Widget />"),
    },
    {
      name: 'Broken.tsx',
      mimeType: 'text/plain',
      buffer: Buffer.from(original),
    },
  ]);
  await page
    .getByRole('button', { name: 'Open Broken.tsx at line 2', exact: true })
    .click();
  await page.keyboard.insertText('// ');
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await download).path())!, 'utf8')).toBe(
    original.replace(' const value', '//  const value'),
  );
});

test('new notes preserve siblings and independent history through save and reopen', async ({
  page,
  context,
}) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const diskSource = '# Existing\r\n\r\nKeep <span>JSX</span> bytes.\r\n';
  await open(page, diskSource, 'existing.mdx');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  const selection = page.getByLabel('Source file');
  await expect(selection).toHaveValue(/existing\.mdx$/);
  expect((await exported()).bytes).toEqual(Buffer.from(diskSource));
  await source.press('Control+End');
  await page.keyboard.insertText('Unsaved tail.');
  const original = diskSource + 'Unsaved tail.';
  const originalKey = await selection.inputValue();
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  await expect(
    page.getByRole('button', { name: 'Source', exact: true }),
  ).toHaveAttribute('aria-pressed', 'true');
  await expect(source).toBeFocused();
  await expect(source).toHaveText('');
  const firstKey = await selection.inputValue();
  expect(firstKey).toContain('Untitled-2.mdx');
  const fresh = '# Fresh note\n\nA new paragraph.\n';
  await page.keyboard.insertText(fresh);
  await page.getByRole('button', { name: 'New note', exact: true }).click();
  const secondKey = await selection.inputValue();
  expect(secondKey).not.toBe(firstKey);
  await page.keyboard.insertText('A separate dirty note.');
  async function exported(target = page) {
    const pending = target.waitForEvent('download');
    await target
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    const file = await pending;
    return {
      name: file.suggestedFilename(),
      bytes: readFileSync((await file.path())!),
    };
  }
  await selection.selectOption(originalKey);
  expect((await exported()).bytes).toEqual(Buffer.from(original));
  await selection.selectOption(firstKey);
  const saved = await exported();
  expect(saved).toEqual({ name: 'Untitled-2.mdx', bytes: Buffer.from(fresh) });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect((await exported()).bytes).toEqual(Buffer.from(''));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  expect((await exported()).bytes).toEqual(Buffer.from(fresh));
  await selection.selectOption(secondKey);
  expect((await exported()).bytes).toEqual(
    Buffer.from('A separate dirty note.'),
  );
  const reopened = await context.newPage();
  await reopened.goto('/');
  await reopened.getByLabel('Open files').setInputFiles({
    name: saved.name,
    mimeType: 'text/plain',
    buffer: saved.bytes,
  });
  expect((await exported(reopened)).bytes).toEqual(saved.bytes);
});

test('unapplied visual text blocks document replacement and stays protected until apply or cancel', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFF---\r\ntitle: Pending edits\r\n---\r\n\r\nOriginal paragraph.\r\n\r\nSecond paragraph.\r\n\r\n<div>Opaque JSX</div>\r\n';
  await open(page, original, 'pending.mdx');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page
    .getByRole('button', { name: 'Original paragraph.', exact: true })
    .click();
  const field = page.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Unapplied 😀 paragraph.');
  await expect(
    page.getByRole('button', { name: 'Save source', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Close source', exact: true }),
  ).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'New note', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Open files')).toBeDisabled();
  await expect(page.getByLabel('Source file')).toBeDisabled();
  await expect(
    page.getByRole('button', { name: 'Second paragraph.', exact: true }),
  ).toBeDisabled();
  await expect(page.getByLabel('Document status')).toContainText(
    'Unapplied visual edit',
  );
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await expect(page.getByRole('note')).toContainText('Enter to apply');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(field).toHaveValue('Unapplied 😀 paragraph.');
  await field.press('Enter');
  await expect(
    page.getByRole('button', { name: 'Save source', exact: true }),
  ).toBeEnabled();
  const download = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(
      original.replace('Original paragraph.', 'Unapplied 😀 paragraph.'),
    ),
  );
  await page
    .getByRole('button', { name: 'Unapplied 😀 paragraph.', exact: true })
    .click();
  await field.fill('Discard this pending value.');
  await field.press('Escape');
  await expect(page.getByLabel('Source file')).toBeEnabled();
  const selected = await page.getByLabel('Source file').inputValue();
  await page.getByLabel('Source file').selectOption('note.mdx');
  await page.getByLabel('Source file').selectOption(selected);
  await expect(
    page.getByRole('button', { name: 'Unapplied 😀 paragraph.', exact: true }),
  ).toBeVisible();
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  const undo = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await undo).path())!)).toEqual(
    Buffer.from(original),
  );
  await page
    .getByRole('button', { name: 'Original paragraph.', exact: true })
    .click();
  await field.fill('Keep this value after a source error.');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('textbox', { name: 'MDX source' }).fill('<Broken');
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await expect(field).toHaveValue('Keep this value after a source error.');
  await field.press('Enter');
  await expect(
    page.getByRole('region', { name: 'Markdown editing' }).getByRole('alert'),
  ).toContainText('Paragraph changed');
  await field.press('Escape');
  await expect(
    page.getByRole('button', { name: 'Save source', exact: true }),
  ).toBeEnabled();
  const stale = page.waitForEvent('download');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  expect(readFileSync((await (await stale).path())!, 'utf8')).toBe('<Broken');
});

test('leading BOM keeps original MDX mappings, opaque React imports and exact save history', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFF' +
    fixture('counter.mdx').replace(/\n/g, '\r\n') +
    '\r\n{/* Preserve BOM and JSX 😀 */}\r\n';
  await open(page, original, 'bom-first.mdx');
  const frame = page.frameLocator('iframe');
  await frame.getByRole('button', { name: 'Count: 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count: 1', exact: true }),
  ).toBeVisible();
  async function exported() {
    const pending = page.waitForEvent('download');
    await page
      .getByRole('button', { name: 'Save source', exact: true })
      .click();
    return readFileSync((await (await pending).path())!);
  }
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page
    .getByRole('button', {
      name: 'This paragraph should render as Markdown.',
      exact: true,
    })
    .click();
  const field = page.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Updated paragraph — 😀.');
  await field.press('Enter');
  const updated = original.replace(
    'This paragraph should render as Markdown.',
    'Updated paragraph — 😀.',
  );
  expect(await exported()).toEqual(Buffer.from(updated));
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  expect(await exported()).toEqual(Buffer.from(original));
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  const saved = await exported();
  expect(saved).toEqual(Buffer.from(updated));
  await open(page, saved.toString('utf8'), 'reopened-bom.mdx');
  await expect(
    page.getByRole('button', { name: 'Updated paragraph — 😀.', exact: true }),
  ).toBeVisible();
  expect(await exported()).toEqual(Buffer.from(updated));
  await page.getByRole('button', { name: 'Split', exact: true }).click();
  await frame.getByRole('button', { name: 'Count: 0', exact: true }).click();
  await expect(
    frame.getByRole('button', { name: 'Count: 1', exact: true }),
  ).toBeVisible();
});

test('trusted save keys export exact source while synthetic, repeated and unapplied edits cannot save', async ({
  page,
}) => {
  await page.goto('/');
  const original =
    '\uFEFF# Keyboard source\r\n\r\nA paragraph.\r\n\r\n<div>Opaque JSX</div>\r\n';
  await open(page, original, 'keyboard.mdx');
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+End');
  await page.keyboard.insertText('Unsaved tail.');
  const expected = Buffer.from(original + 'Unsaved tail.');
  let downloads = 0;
  page.on('download', () => downloads++);
  const first = page.waitForEvent('download', { timeout: 5000 });
  await source.press('Control+s');
  expect(readFileSync((await (await first).path())!)).toEqual(expected);
  const dispatched = await page.evaluate(() =>
    document.querySelector('main')!.dispatchEvent(
      new KeyboardEvent('keydown', {
        key: 's',
        ctrlKey: true,
        bubbles: true,
        cancelable: true,
      }),
    ),
  );
  expect(dispatched).toBe(false);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(downloads).toBe(1);
  const repeat = page.waitForEvent('download', { timeout: 5000 });
  await page.keyboard.down('Control');
  await page.keyboard.down('s');
  await page.keyboard.down('s');
  await page.keyboard.up('s');
  await page.keyboard.up('Control');
  expect(readFileSync((await (await repeat).path())!)).toEqual(expected);
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(downloads).toBe(2);
  await page.getByRole('button', { name: 'Visual', exact: true }).click();
  await page.getByRole('button', { name: 'A paragraph.', exact: true }).click();
  const field = page.getByRole('textbox', { name: 'Paragraph text' });
  await field.fill('Unapplied value must not be saved.');
  await field.press('Control+s');
  await expect(field).toHaveValue('Unapplied value must not be saved.');
  await expect(page.getByLabel('Document status')).toContainText(
    'Unapplied visual edit',
  );
  expect(downloads).toBe(2);
  await field.press('Escape');
  const final = page.waitForEvent('download', { timeout: 5000 });
  await page
    .getByRole('button', { name: 'Visual', exact: true })
    .press('Control+s');
  expect(readFileSync((await (await final).path())!)).toEqual(expected);
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  const priorKey = await page.getByLabel('Source file').inputValue();
  const release = await page.evaluateHandle(() => {
    const original = File.prototype.arrayBuffer;
    let finish: (() => void) | undefined;
    File.prototype.arrayBuffer = function () {
      return new Promise((resolve) => {
        finish = () => {
          void original.call(this).then(resolve);
        };
      });
    };
    return () => {
      File.prototype.arrayBuffer = original;
      finish?.();
    };
  });
  await open(page, '# Incoming\n\nA separate note.\n', 'incoming.mdx');
  await expect(
    page.getByRole('button', { name: 'Save source', exact: true }),
  ).toBeDisabled();
  await source.press('Control+End');
  await page.keyboard.insertText('During read.');
  await source.press('Control+s');
  await page.evaluate(
    () =>
      new Promise((resolve) =>
        requestAnimationFrame(() => requestAnimationFrame(resolve)),
      ),
  );
  expect(downloads).toBe(3);
  await release.evaluate((finish) => finish());
  await release.dispose();
  await expect(page.getByLabel('Source file')).toHaveValue(/incoming\.mdx$/);
  await page.getByLabel('Source file').selectOption(priorKey);
  const late = page.waitForEvent('download', { timeout: 5000 });
  await source.press('Control+s');
  expect(readFileSync((await (await late).path())!)).toEqual(
    Buffer.from(original + 'Unsaved tail.During read.'),
  );
});
