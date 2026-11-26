import { readFileSync } from 'node:fs';
import { expect, test, type Page } from '@playwright/test';
import { documentEditor } from './helpers/math-text';

const island = '.rendered-runtime iframe[title="Document preview"]';
const noteName = 'Lifecycle.mdx';
const siblingName = 'Unused draft.mdx';
const moduleName = 'FieldCounter.tsx';
const noteSource =
  '\uFEFFimport FieldCounter from "./FieldCounter.tsx"\r\n\r\n' +
  '# Counter in context\r\n\r\nPreserve $x^2$ and café.  \n\n' +
  '<FieldCounter />\r\n';
const siblingSource = '\uFEFF# Unused sibling\r\n\r\nUnrelated paragraph.';
const moduleSource =
  'import { useState } from "react";\n' +
  'export default function FieldCounter() { const [count, setCount] = useState(4); return <button onClick={() => setCount(count + 1)}>Field count: {count}</button>; }\n';

async function command(page: Page, label: string) {
  await page.locator('.doc-title-row').click();
  await page.keyboard.press('Control+k');
  const palette = page.getByRole('dialog', { name: 'Command palette' });
  await palette.getByLabel('Search commands and notes').fill(label);
  await palette
    .getByRole('button', { name: new RegExp('^' + label) })
    .first()
    .click();
}

async function downloaded(page: Page, label: string) {
  const pending = page.waitForEvent('download');
  await command(page, label);
  return readFileSync((await (await pending).path())!);
}

async function backup(page: Page) {
  const payload = JSON.parse(
    (await downloaded(page, 'Export workspace backup')).toString('utf8'),
  ) as {
    state: {
      workspace: {
        selected: string;
        files: Record<string, string>;
        groups: Record<string, string>;
      };
    };
  };
  return payload.state.workspace;
}

function title(page: Page) {
  return page.getByRole('heading', { name: 'Document title' });
}

function counter(page: Page, value?: number) {
  return page.frameLocator(island).getByRole('button', {
    name: value === undefined ? /^Field count: \d+$/ : 'Field count: ' + value,
    exact: value !== undefined,
  });
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
}

async function refreshCleanTab(reader: Page) {
  await reader.bringToFront();
  // A headless browser can activate a page without delivering window focus.
  // Exercise the same refresh handler used when a reader returns to this tab.
  await reader.evaluate(() => window.dispatchEvent(new Event('focus')));
}

test('a saved unused sibling preserves a live Counter and a changed import restarts it', async ({
  page: reader,
  context,
}) => {
  test.setTimeout(60_000);
  await reader.goto('/');
  await expect(title(reader)).toHaveText('Welcome');
  await reader.getByLabel('Import note files').setInputFiles(
    (
      [
        [noteName, noteSource],
        [siblingName, siblingSource],
        [moduleName, moduleSource],
      ] as const
    ).map(([name, source]) => ({
      name,
      mimeType: 'text/plain',
      buffer: Buffer.from(source),
    })),
  );
  await expect(title(reader)).toHaveText('Lifecycle');
  await command(reader, 'Preview document');
  await expect(documentEditor(reader)).toBeVisible();
  await expect(counter(reader, 4)).toBeVisible({ timeout: 20_000 });
  await counter(reader, 4).click();
  await expect(counter(reader, 5)).toBeVisible();
  await saved(reader);
  const iframe = reader.locator(island);
  const originalFrame = await (await iframe.elementHandle())!.contentFrame();
  expect(originalFrame).not.toBeNull();

  const original = await backup(reader);
  const noteKey = original.selected;
  const siblingKey = Object.keys(original.files).find((key) =>
    key.endsWith('/' + siblingName),
  )!;
  const moduleKey = Object.keys(original.files).find((key) =>
    key.endsWith('/' + moduleName),
  )!;
  expect(original.files[noteKey]).toBe(noteSource);
  expect(original.files[siblingKey]).toBe(siblingSource);
  expect(original.files[moduleKey]).toBe(moduleSource);
  expect([original.groups[siblingKey], original.groups[moduleKey]]).toEqual([
    original.groups[noteKey],
    original.groups[noteKey],
  ]);

  const writer = await context.newPage();
  await writer.goto('/');
  await saved(writer);
  await command(writer, 'Unused draft');
  await expect(title(writer)).toHaveText('Unused draft');
  await command(writer, 'Edit source');
  const source = writer.getByRole('textbox', { name: 'MDX source' });
  await source.press('Control+End');
  await writer.keyboard.type('!');
  await writer.keyboard.press('Control+s');
  await saved(writer);
  const changedSibling = siblingSource + '!';
  expect(await downloaded(writer, 'Export current source')).toEqual(
    Buffer.from(changedSibling),
  );

  await refreshCleanTab(reader);
  await expect
    .poll(async () => (await backup(reader)).files[siblingKey])
    .toBe(changedSibling);
  const afterSibling = await backup(reader);
  expect(afterSibling.selected).toBe(noteKey);
  expect(afterSibling.files[noteKey]).toBe(noteSource);
  expect(afterSibling.files[moduleKey]).toBe(moduleSource);
  await expect(counter(reader)).toBeVisible({ timeout: 20_000 });
  const siblingFrame = await (await iframe.elementHandle())!.contentFrame();
  expect(siblingFrame).not.toBeNull();
  // Preserve both observations on a regression so the imported-module
  // control still proves that executable changes restart the runtime.
  expect.soft(await counter(reader).innerText()).toBe('Field count: 5');
  expect.soft(siblingFrame === originalFrame).toBe(true);
  expect(await downloaded(reader, 'Export current source')).toEqual(
    Buffer.from(noteSource),
  );

  await writer.bringToFront();
  await command(writer, 'FieldCounter');
  await expect(title(writer)).toHaveText('FieldCounter');
  const changedModule = moduleSource.replace('useState(4)', 'useState(9)');
  await source.fill(changedModule);
  await writer.keyboard.press('Control+s');
  await saved(writer);
  expect(await downloaded(writer, 'Export current source')).toEqual(
    Buffer.from(changedModule),
  );

  await refreshCleanTab(reader);
  await expect
    .poll(async () => (await backup(reader)).files[moduleKey])
    .toBe(changedModule);
  const afterModule = await backup(reader);
  expect(afterModule.selected).toBe(noteKey);
  expect(afterModule.files[noteKey]).toBe(noteSource);
  expect(afterModule.files[siblingKey]).toBe(changedSibling);
  await expect(counter(reader, 9)).toBeVisible({ timeout: 20_000 });
  expect(siblingFrame!.isDetached()).toBe(true);
  await counter(reader, 9).click();
  await expect(counter(reader, 10)).toBeVisible();
  expect(await downloaded(reader, 'Export current source')).toEqual(
    Buffer.from(noteSource),
  );
});
