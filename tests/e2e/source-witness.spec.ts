import { test, expect, type Page } from '@playwright/test';
import { build } from 'esbuild';
import { resolve } from 'node:path';

let javascript = '',
  stylesheet = '';
test.beforeAll(async () => {
  const bundle = await build({
    entryPoints: [resolve('tests/fixtures/source-witness.tsx')],
    outfile: 'fixture.js',
    bundle: true,
    write: false,
    format: 'esm',
    define: { 'process.env.NODE_ENV': '"test"' },
    loader: { '.woff2': 'dataurl', '.woff': 'dataurl', '.ttf': 'dataurl' },
    plugins: [
      {
        name: 'no-document-runtime-in-editor-fixture',
        setup(builder) {
          builder.onLoad(
            { filter: /[/\\]rendered[/\\]RenderedRuntime\.tsx$/ },
            () => ({
              contents: 'export function RenderedRuntime() { return null; }',
              loader: 'js',
            }),
          );
        },
      },
    ],
  });
  javascript = bundle.outputFiles.find((file) =>
    file.path.endsWith('.js'),
  )!.text;
  stylesheet = bundle.outputFiles.find((file) =>
    file.path.endsWith('.css'),
  )!.text;
});
test.beforeEach(async ({ page }) => {
  await page.route('**/__source-witness__/**', (route) => {
    const pathname = new URL(route.request().url()).pathname;
    if (pathname.endsWith('fixture.js'))
      return route.fulfill({
        contentType: 'text/javascript',
        body: javascript,
      });
    if (pathname.endsWith('fixture.css'))
      return route.fulfill({ contentType: 'text/css', body: stylesheet });
    return route.fulfill({
      contentType: 'text/html',
      body: '<!doctype html><html><head><link rel="stylesheet" href="fixture.css"><style>.ProseMirror { white-space: pre-wrap; padding: 24px; min-height: 100px; } .cm-editor { min-height: 100px; } nav button { margin: 8px; }</style></head><body><div id="root"></div><script type="module" src="fixture.js"></script></body></html>',
    });
  });
  await page.goto('/__source-witness__/index.html');
  await expect(
    page.getByRole('textbox', { name: 'Editable document' }),
  ).toBeVisible();
});
async function state(
  page: Page,
): Promise<{ source: string; editorRevision: number; publications: number }> {
  return JSON.parse((await page.getByTestId('state').textContent())!);
}

test('opt-in receipts support real Markdown/math typing while React source props lag', async ({
  page,
}) => {
  const surface = page.getByRole('textbox', { name: 'Editable document' });
  await surface.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type(' first second');
  await expect.poll(async () => (await state(page)).source).toContain('second');
  // Existing lossless authoring escapes typed spaces in source; the owning
  // document must still present the exact text entered by the user.
  await expect.poll(() => surface.innerText()).toContain(' first second');
  await page.locator('.rendered-math-render').click();
  await expect(page.locator('.rendered-math-source')).toBeVisible();
  await page.keyboard.press('ArrowRight');
  await page.keyboard.type('^2');
  await expect.poll(async () => (await state(page)).source).toContain('$x^2$');
  const accepted = await state(page);
  expect(accepted.editorRevision).toBeGreaterThan(2);
  expect(accepted.publications).toBe(accepted.editorRevision);
  expect(accepted.source).toContain('\r\n');
  await expect(page.getByRole('button', { name: 'Review draft' })).toHaveCount(
    0,
  );
  await page.getByRole('button', { name: 'Echo current props' }).click();
  await expect
    .poll(async () => (await state(page)).editorRevision)
    .toBe(accepted.editorRevision);
});

test('same-byte undo rejects a captured location and stale visual projection, retaining typed text', async ({
  page,
}) => {
  await page.getByRole('button', { name: 'Source', exact: true }).click();
  await page.getByRole('button', { name: 'Capture location' }).click();
  const source = page.locator('.cm-content');
  await source.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Z');
  await page.keyboard.press('Control+z');
  await expect
    .poll(async () => (await state(page)).source)
    .toBe('Paragraph $x$.\r\n');
  expect((await state(page)).editorRevision).toBe(2);
  await page.getByRole('button', { name: 'Reveal captured location' }).click();
  await expect(page.getByTestId('location')).not.toHaveText('4');
  await page.getByRole('button', { name: 'Preview', exact: true }).click();
  await page.getByRole('textbox', { name: 'Editable document' }).click();
  await page.keyboard.type('Q');
  await expect(
    page.getByRole('button', { name: 'Review draft' }),
  ).toBeVisible();
  expect((await state(page)).source).toBe('Paragraph $x$.\r\n');
  await page.getByRole('button', { name: 'Review draft' }).click();
  await expect(
    page.getByRole('textbox', { name: 'Unapplied text' }),
  ).toContainText('Q');
});
