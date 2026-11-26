import { readFileSync } from 'node:fs';
import { expect, test, type Locator, type Page } from '@playwright/test';
import {
  documentEditor,
  openMath,
  selectDocumentText,
  sourceForMath,
} from './helpers/math-text';

test.describe.configure({ timeout: 60_000 });

const title = 'Laboratory notebook';
const original =
  '\uFEFFimport { useState } from "react"\r\n\r\n' +
  'export function Counter() { const [count, setCount] = useState(0); return <button onClick={() => setCount(count + 1)}>Runs: {count}</button> }\r\n\r\n' +
  '# Trial notes\r\n\r\n' +
  'Café, λ and e\u0301 — with &amp; tea.  \r\n\r\n' +
  'Record the observations.\r\n\r\n' +
  'Readings begin here.\r\n\r\n' +
  '* Unchanged sample  \n* Second sample\n\n' +
  'Speed $v^2$ stays finite.\r\n\r\n' +
  'Set $x \\in \\mathbb{R$ here.\r\n\r\n' +
  'Ratio $\\frac{a}{b$ goes here.\r\n\r\n' +
  'Root $\\sqrt{z$ goes here.\r\n\r\n' +
  'A spare $ is ordinary punctuation.\r\n\r\n' +
  "$$\r\nf'(x) = \\frac{1}{2}\r\n$\r\n\r\n" +
  '{/* Keep this comment and its spacing.  */}\n\n' +
  '<section data-notebook="unchanged">\n  <div><Counter /></div>\n</section>\n';

const runtimeSelector = '.rendered-runtime iframe[title="Document preview"]';

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

function documentTitle(page: Page) {
  return page.getByRole('heading', { name: 'Document title', exact: true });
}

async function exported(page: Page) {
  const pending = page.waitForEvent('download');
  await command(page, 'Export current source');
  return readFileSync((await (await pending).path())!);
}

async function expectExport(page: Page, expected: string) {
  expect(await exported(page)).toEqual(Buffer.from(expected));
}

async function saved(page: Page) {
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
    { timeout: 15_000 },
  );
}

async function openNotebook(page: Page) {
  await page.goto('/');
  await expect(documentTitle(page)).toHaveText('Welcome');
  await page.getByLabel('Import note files').setInputFiles({
    name: title + '.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await expect(documentTitle(page)).toHaveText(title);
  await command(page, 'Preview document');
  await expect(documentEditor(page)).toBeVisible();
}

function counter(page: Page, count: number) {
  return page
    .frameLocator(runtimeSelector)
    .getByRole('button', { name: 'Runs: ' + count, exact: true });
}

async function incrementCounter(page: Page) {
  const button = page
    .frameLocator(runtimeSelector)
    .getByRole('button', { name: /^Runs: \d+$/ });
  await expect(button).toBeVisible();
  const count = Number((await button.innerText()).slice('Runs: '.length));
  await button.click();
  await expect(counter(page, count + 1)).toBeVisible();
  return count + 1;
}

async function componentSource(page: Page, enabled: boolean) {
  await command(page, 'Settings');
  await page
    .getByRole('dialog', { name: 'Settings', exact: true })
    .getByRole('checkbox', { name: 'Show component source in Preview' })
    .setChecked(enabled);
  await page.getByRole('button', { name: 'Close Settings' }).click();
}

async function corePlugin(
  page: Page,
  name: 'React components' | 'Mathematics',
  enabled: boolean,
) {
  await command(page, 'Settings');
  const dialog = page.getByRole('dialog', { name: 'Settings', exact: true });
  await dialog
    .getByRole('button', { name: 'Core plugins', exact: true })
    .click();
  await dialog.getByRole('checkbox', { name }).setChecked(enabled);
  await page.getByRole('button', { name: 'Close Settings' }).click();
}

async function metrics(text: Locator) {
  return text.evaluate((element) => {
    const { x, y, width, height } = element.getBoundingClientRect();
    const { font, lineHeight, margin, padding } = getComputedStyle(element);
    return { x, y, width, height, font, lineHeight, margin, padding };
  });
}

test('keyboard authoring in mixed MDX survives undo, note switching and reload', async ({
  page,
}, info) => {
  await openNotebook(page);
  const view = documentEditor(page);
  const keys = page.keyboard;
  await expect(page.locator(runtimeSelector)).toHaveAttribute(
    'sandbox',
    'allow-scripts',
  );
  await expect(view.locator('pre:visible')).toHaveCount(0);
  await counter(page, 0).click();
  await expect(counter(page, 1)).toBeVisible();
  await expectExport(page, original);

  await test.step('edit a heading and prose with ordinary typing', async () => {
    await view.getByRole('heading', { name: 'Trial notes' }).click();
    await keys.press('End');
    await keys.type(' and results');
    await expect(
      view.getByRole('heading', { name: 'Trial notes and results' }),
    ).toBeVisible();
    const prose = view.getByText('Record the observations.', { exact: true });
    await prose.click();
    await keys.press('End');
    await keys.type(' Ready?! (Yes.)');
    await expect(view).toContainText('Record the observations. Ready?! (Yes.)');
  });

  const editedProse = (await exported(page)).toString('utf8');
  expect(
    editedProse
      .replace(/(?<=# Trial notes)[^\r\n]*/, '')
      .replace(/(?<=Record the observations\.)[^\r\n]*/, ''),
  ).toBe(original);

  await test.step('type list markers, continue, nest and leave each list', async () => {
    await view
      .getByText('Record the observations. Ready?! (Yes.)', { exact: true })
      .click();
    await keys.press('End');
    await keys.press('Enter');
    await keys.type('1. Observe');
    await keys.press('Enter');
    await keys.type('Measure');
    await expect(view.locator('ol > li')).toHaveText(['Observe', 'Measure']);
    await keys.press('Enter');
    await keys.press('Tab');
    await keys.type('Compare');
    await expect(view.locator('ol ol > li')).toHaveText('Compare');
    await keys.press('Enter');
    await keys.press('Enter');
    await keys.press('Enter');
    await keys.type('- Repeat');
    await keys.press('Enter');
    await keys.press('Tab');
    await keys.type('Log the result');
    await expect(view.locator('ul ul > li')).toHaveText('Log the result');
    await keys.press('Enter');
    await keys.press('Enter');
    await keys.press('Enter');
    await keys.type('List observations complete.');
    await expect(view.locator(':scope > p')).toContainText([
      'List observations complete.',
    ]);
  });

  const editedLists = (await exported(page)).toString('utf8');
  const nextParagraph = 'Readings begin here.';
  const insertionStart = editedProse.indexOf(nextParagraph);
  const insertionEnd = editedLists.indexOf(nextParagraph);
  expect(editedLists.slice(0, insertionStart)).toBe(
    editedProse.slice(0, insertionStart),
  );
  expect(editedLists.slice(insertionEnd)).toBe(
    editedProse.slice(insertionStart),
  );
  expect(editedLists.slice(insertionStart, insertionEnd)).toMatch(
    /^1\. Observe\r\n2\. Measure\r\n {3}1\. Compare\r\n\r\n- Repeat\r\n {2}- Log[^\r\n]+\r\n\r\nList[^\r\n]+\r\n\r\n$/,
  );

  await test.step('enter a soft break and a hard break within prose', async () => {
    const paragraph = view
      .locator('p')
      .filter({ hasText: 'Readings begin here.' });
    await selectDocumentText(paragraph);
    await paragraph.evaluate((element) => {
      const data = new DataTransfer();
      data.setData(
        'text/plain',
        'Readings begin here.\nCheck the temperature.',
      );
      const event = new ClipboardEvent('paste', {
        bubbles: true,
        cancelable: true,
        clipboardData: data,
      });
      // Firefox gives synthetic paste an empty transfer unless it is set explicitly.
      Object.defineProperty(event, 'clipboardData', { value: data });
      element.dispatchEvent(event);
    });
    await expect(paragraph).toContainText('Check the temperature.');
    expect(await paragraph.textContent()).toBe(
      'Readings begin here.\nCheck the temperature.',
    );
    const caretAfterPaste = await paragraph.evaluate((element) => {
      const selection = window.getSelection()!;
      return {
        inParagraph: element.contains(selection.anchorNode),
        parent: (selection.anchorNode?.parentElement?.outerHTML ?? '').slice(
          0,
          300,
        ),
        offset: selection.anchorOffset,
      };
    });
    await keys.type('!');
    const afterTyping = await exported(page);
    await info.attach('soft-break-paste', {
      body: JSON.stringify({
        caretAfterPaste,
        exported: afterTyping.toString('utf8'),
      }),
      contentType: 'application/json',
    });
    expect(afterTyping).toEqual(
      Buffer.from(
        editedLists.replace(
          'Readings begin here.',
          'Readings begin here.\r\nCheck the temperature.!',
        ),
      ),
    );
    expect(caretAfterPaste.inParagraph).toBe(true);
    await selectDocumentText(
      paragraph,
      'Readings begin here.\nCheck the temperature.!'.length,
      'Readings begin here.\nCheck the temperature.!'.length,
    );
    await keys.press('Shift+Enter');
    await keys.insertText('Then record the time.');
    await expect(
      paragraph.locator('br:not(.ProseMirror-trailingBreak)'),
    ).toHaveCount(1);
    await expect(paragraph).toContainText('Then record the time.');
  });

  const edited = editedLists.replace(
    'Readings begin here.',
    'Readings begin here.\r\nCheck the temperature.!\\\r\nThen record the time.',
  );
  await expectExport(page, edited);
  await incrementCounter(page);
  await expect(view).not.toContainText(/&(?:#\d+|#x[a-f\d]+|amp|lt|gt);/i);
  await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
  await expect(
    page.getByRole('toolbar', { name: 'Text formatting' }),
  ).toHaveCount(0);

  const heading = view.getByRole('heading', {
    name: 'Trial notes and results',
  });
  await heading.click();
  await keys.press('End');
  await keys.type('!');
  const annotated = edited.replace(/(?<=# Trial notes)[^\r\n]*/, '$&!');
  await expect(heading).toHaveText('Trial notes and results!');
  await expectExport(page, annotated);

  await command(page, 'Edit source');
  const source = page.getByRole('textbox', { name: 'MDX source' });
  await expect(source).toBeVisible();
  await source.press('Control+z');
  await expectExport(page, edited);
  await source.press('Control+Shift+Z');
  await expectExport(page, annotated);
  await command(page, 'Preview document');
  await expect(
    view.getByText('List observations complete.', { exact: true }),
  ).toBeVisible();

  await command(page, 'Save workspace');
  await saved(page);
  await command(page, 'Welcome');
  await expect(documentTitle(page)).toHaveText('Welcome');
  await command(page, title);
  await expect(documentTitle(page)).toHaveText(title);
  await expect(
    view.getByRole('heading', { name: 'Trial notes and results' }),
  ).toBeVisible();
  await expectExport(page, annotated);

  await saved(page);
  await page.reload();
  await expect(documentTitle(page)).toHaveText(title);
  await expect(view.locator('ol ol > li')).toHaveText('Compare');
  await counter(page, 0).click();
  await expect(counter(page, 1)).toBeVisible();
  await expectExport(page, annotated);
});

test('the same document caret edits and corrects mathematics while React stays live', async ({
  page,
}) => {
  await openNotebook(page);
  const view = documentEditor(page);
  const keys = page.keyboard;
  const heading = view.getByRole('heading', { name: 'Trial notes' });
  await counter(page, 0).click();
  await expect(counter(page, 1)).toBeVisible();

  await test.step('unmatched dollars retain ordinary text geometry on focus', async () => {
    const plain = [
      view.locator('p').filter({ hasText: 'A spare $' }),
      view.locator('p').filter({ hasText: "f'(x)" }),
    ];
    await page.evaluate(() => document.fonts.ready.then(() => undefined));
    for (const paragraph of plain) {
      await expect(paragraph).toBeVisible();
      await paragraph.scrollIntoViewIfNeeded();
      await expect(paragraph.locator('.rendered-math-host')).toHaveCount(0);
      const unfocused = await metrics(paragraph);
      await paragraph.click();
      await expect(view).toBeFocused();
      expect(await metrics(paragraph)).toEqual(unfocused);
      await view.evaluate((element) => (element as HTMLElement).blur());
      await expect(view).not.toBeFocused();
      expect(await metrics(paragraph)).toEqual(unfocused);
    }
  });

  const speed = view.locator('p').filter({ hasText: 'Speed ' });
  await test.step('arrow through math with the document caret, then reclose an incomplete formula', async () => {
    await expect(speed.locator('.katex')).toBeVisible();
    await selectDocumentText(speed, 'Speed '.length, 'Speed '.length);
    await keys.press('ArrowRight');
    const raw = sourceForMath(page, '$v^2$');
    await expect(raw).toBeVisible();
    await expect(view).toBeFocused();
    await expect
      .poll(() =>
        raw.evaluate((element) => {
          const caret = window.getSelection()!;
          return [element.contains(caret.anchorNode), caret.anchorOffset];
        }),
      )
      .toEqual([true, 1]);
    for (let step = 0; step < '$v^2$'.length; step++)
      await keys.press('ArrowRight');
    await expect(raw).toBeHidden();
    await expect(view).toBeFocused();

    await openMath(page, '$v^2$');
    await selectDocumentText(raw, '$v^2'.length, '$v^2$'.length);
    await keys.press('Backspace');
    await expect(speed).toHaveText('Speed $v^2 stays finite.');
    await expect(speed.locator('.rendered-math-host')).toHaveCount(0);
    await expectExport(page, original.replace('$v^2$', '$v^2'));

    await selectDocumentText(speed, 'Speed $v^2'.length, 'Speed $v^2'.length);
    await keys.type('$');
    await heading.click();
    await expect(speed.locator('.katex')).toBeVisible();
    await expectExport(page, original);
  });

  const corrections = [
    ['$x \\in \\mathbb{R$', '$x \\in \\mathbb{R}$'],
    ['$\\frac{a}{b$', '$\\frac{a}{b}$'],
    ['$\\sqrt{z$', '$\\sqrt{z}$'],
  ] as const;
  let edited = original;
  let countAfterCorrections = 1;
  await test.step('correct three independent invalid formulas as raw document text', async () => {
    const invalid = view.locator('.rendered-math-invalid');
    await expect(invalid).toHaveCount(corrections.length);
    for (const [index, [before, after]] of corrections.entries()) {
      const raw = sourceForMath(page, before);
      await expect(raw).toBeVisible();
      await expect(raw).toHaveText(before);
      await expect(raw).toHaveCSS('color', 'rgb(199, 67, 67)');
      const boundary = before.length - 1;
      await selectDocumentText(raw, boundary, boundary);
      await keys.type('}');
      await heading.click();
      await expect(invalid).toHaveCount(corrections.length - index - 1);
      await expect(sourceForMath(page, after)).toBeHidden();
      edited = edited.replace(before, after);
      await expectExport(page, edited);
    }
    await expect(view.locator('.katex')).toHaveCount(1 + corrections.length);
    await expect(view).not.toContainText(/&(?:#\d+|#x[a-f\d]+|amp|lt|gt);/i);
    await expect(view).toContainText('Café, λ and e\u0301 — with & tea.');
    await expect(
      view.locator('.cm-editor, input, textarea, [tabindex], [role="button"]'),
    ).toHaveCount(0);
    await expect(page.locator('.pn-notice[data-tone="error"]')).toHaveCount(0);
    countAfterCorrections = await incrementCounter(page);
  });

  await test.step('toggle component source visibility and core capabilities without rewriting source', async () => {
    await componentSource(page, true);
    await expect(
      view.locator('pre').filter({ hasText: 'import { useState }' }),
    ).toBeVisible();
    await expect(
      view.locator('pre').filter({ hasText: '<div><Counter /></div>' }),
    ).toBeVisible();
    await expect(counter(page, countAfterCorrections)).toBeVisible();
    await expectExport(page, edited);
    await componentSource(page, false);
    await expect(view.locator('pre:visible')).toHaveCount(0);

    await corePlugin(page, 'Mathematics', false);
    await expect(view.locator('.katex')).toHaveCount(0);
    await expect(speed).toHaveText('Speed $v^2$ stays finite.');
    await incrementCounter(page);
    await expectExport(page, edited);
    await corePlugin(page, 'React components', false);
    await expect(page.locator(runtimeSelector)).toHaveCount(0);
    await expectExport(page, edited);
    await corePlugin(page, 'Mathematics', true);
    await corePlugin(page, 'React components', true);
    await expect(view.locator('.katex')).toHaveCount(1 + corrections.length);
    await counter(page, 0).click();
    await expect(counter(page, 1)).toBeVisible();
    await expectExport(page, edited);
  });
});

test('Rebuild restarts the live Counter in Editable Preview without changing source', async ({
  page,
}) => {
  await openNotebook(page);
  await counter(page, 0).click();
  await expect(counter(page, 1)).toBeVisible();
  const iframe = page.locator(runtimeSelector);
  const originalFrame = await (await iframe.elementHandle())!.contentFrame();
  expect(originalFrame).not.toBeNull();

  await page.getByRole('button', { name: 'Open right panel' }).click();
  const controls = page.getByRole('region', { name: 'Preview controls' });
  await expect(
    controls.getByText('Editable preview', { exact: true }),
  ).toBeVisible();
  await controls.getByRole('button', { name: 'Rebuild', exact: true }).click();
  await expect(counter(page, 0)).toBeVisible();
  expect(originalFrame!.isDetached()).toBe(true);
  await counter(page, 0).click();
  await expect(counter(page, 1)).toBeVisible();
  await expectExport(page, original);

  await controls.getByRole('button', { name: 'Pause', exact: true }).click();
  await expect(iframe).toHaveCount(0);
  await controls.getByRole('button', { name: 'Resume', exact: true }).click();
  await expect(counter(page, 0)).toBeVisible();
  await expectExport(page, original);
});
