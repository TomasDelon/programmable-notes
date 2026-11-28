import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Synthetic IME events exercise the shared ProseMirror document observer.
// They are not physical Android keyboard validation or a nested input test.
test.use({
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
});

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

async function compose(
  page: Page,
  priorInput: boolean,
  endFirst: boolean,
  final = '7',
) {
  const original = '# Composition\r\n\r\nBefore $x^2$ after.\r\n';
  await page.goto('/');
  await page.getByLabel('Import note files').setInputFiles({
    name: 'IME.mdx',
    mimeType: 'text/plain',
    buffer: Buffer.from(original),
  });
  await command(page, 'Preview document');
  const editor = page.getByRole('textbox', { name: 'Editable document' });
  await editor.locator('.rendered-math-render .katex-html').click();
  const source = editor.locator('.rendered-math-source');
  await expect(source).toBeVisible();
  await expect(editor).toBeFocused();
  await expect(editor.locator('.cm-editor, input, textarea')).toHaveCount(0);
  await editor.evaluate(
    async (dom, { priorInput, endFirst, final }) => {
      const source = dom.querySelector('.rendered-math-source')!;
      dom.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true }),
      );
      dom.dispatchEvent(
        new KeyboardEvent('keydown', {
          key: 'Escape',
          code: 'Escape',
          keyCode: 229,
          isComposing: true,
          bubbles: true,
        }),
      );
      if (!source.isConnected)
        throw new Error('IME Escape removed document text.');
      const write = (value: string) => {
        const walker = document.createTreeWalker(source, NodeFilter.SHOW_TEXT);
        let text = walker.nextNode();
        while (text && !/[23]/.test(text.nodeValue ?? ''))
          text = walker.nextNode();
        if (!text) throw new Error('Expected composing digit is absent.');
        const offset = text.nodeValue!.search(/[23]/);
        text.nodeValue =
          text.nodeValue!.slice(0, offset) +
          value +
          text.nodeValue!.slice(offset + 1);
        const selection = window.getSelection()!;
        const range = document.createRange();
        range.setStart(text, offset + value.length);
        range.collapse(true);
        selection.removeAllRanges();
        selection.addRange(range);
        dom.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertCompositionText',
            data: value,
            isComposing: true,
          }),
        );
      };
      if (priorInput) {
        write('3');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        if (!source.textContent?.includes('x^3'))
          throw new Error('Prior composition was lost.');
      }
      write(final);
      const end = () =>
        dom.dispatchEvent(
          new CompositionEvent('compositionend', {
            bubbles: true,
            data: final,
          }),
        );
      if (endFirst) end();
      (dom as HTMLElement).blur();
      if (!endFirst) end();
    },
    { priorInput, endFirst, final },
  );
  await editor.getByRole('heading', { name: 'Composition' }).click();
  await expect(page.locator('.web-shell')).toHaveAttribute(
    'data-save-status',
    'saved',
  );
  const download = page.waitForEvent('download');
  await command(page, 'Export current source');
  expect(readFileSync((await (await download).path())!)).toEqual(
    Buffer.from(original.replace('x^2', 'x^' + final)),
  );
  await expect(page.getByRole('alert')).toHaveCount(0);
}

for (const endFirst of [false, true]) {
  for (const firstChange of [false, true]) {
    test(`document mathematics composition retains the final DOM insertion across blur (earlier input: ${firstChange}; end first: ${endFirst})`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        'Exercises synthetic Android Chromium composition scheduling.',
      );
      await compose(page, firstChange, endFirst);
    });
  }
}

test.describe('modern Android shared-document mathematics', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  });
  test('retains a final Unicode composition in document text without a separate math input', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Exercises synthetic Android Chromium composition scheduling.',
    );
    await compose(page, true, false, '七');
  });
});

for (const endFirst of [false, true]) {
  test(`removing a math delimiter during composition retains its live DOM and final Unicode text (end first: ${endFirst})`, async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Exercises synthetic Android Chromium composition scheduling.',
    );
    const original = '# Delimiter composition\r\n\r\nBefore $x^2$ after.\r\n';
    await page.goto('/');
    await page.getByLabel('Import note files').setInputFiles({
      name: 'Delimiter IME.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(original),
    });
    await command(page, 'Preview document');
    const editor = page.getByRole('textbox', { name: 'Editable document' });
    await editor.locator('.rendered-math-render .katex-html').click();
    await editor.evaluate(
      async (dom, { endFirst }) => {
        const source = dom.querySelector('.rendered-math-source')!;
        dom.dispatchEvent(
          new CompositionEvent('compositionstart', { bubbles: true }),
        );
        const write = (value: string) => {
          if (!source.isConnected)
            throw new Error('A source reparse detached the composing text.');
          const text = source.firstChild!;
          text.nodeValue = value;
          const range = document.createRange();
          range.setStart(text, value.length);
          range.collapse(true);
          const selection = window.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          dom.dispatchEvent(
            new InputEvent('input', {
              bubbles: true,
              inputType: 'insertCompositionText',
              data: value,
              isComposing: true,
            }),
          );
        };
        write('$x^2');
        await new Promise<void>((resolve) =>
          requestAnimationFrame(() => requestAnimationFrame(() => resolve())),
        );
        write('$x^七');
        const end = () =>
          dom.dispatchEvent(
            new CompositionEvent('compositionend', {
              bubbles: true,
              data: '七',
            }),
          );
        if (endFirst) end();
        (dom as HTMLElement).blur();
        if (!endFirst) end();
      },
      { endFirst },
    );
    await editor
      .getByRole('heading', { name: 'Delimiter composition' })
      .click();
    await expect(editor.locator('.rendered-math-host')).toHaveCount(0);
    await expect(editor).toContainText('Before $x^七 after.');
    const download = page.waitForEvent('download');
    await command(page, 'Export current source');
    expect(readFileSync((await (await download).path())!)).toEqual(
      Buffer.from(original.replace('$x^2$', '$x^七')),
    );
    await expect(page.getByRole('alert')).toHaveCount(0);
  });
}
