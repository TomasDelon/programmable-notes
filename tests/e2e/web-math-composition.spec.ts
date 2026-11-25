import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

// Exercise CodeMirror's real Android/Chrome deferred composition path in a
// browser, using the pre-EditContext compatibility path (Chrome <126).
// Synthetic IME events are not physical Android keyboard validation.
test.use({
  userAgent:
    'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0.0.0 Mobile Safari/537.36',
});

for (const endFirst of [false, true]) {
  for (const firstChange of [false, true]) {
    test(`math composition retains the final DOM insertion across blur (earlier input: ${firstChange}; end first: ${endFirst})`, async ({
      page,
      browserName,
    }) => {
      test.skip(
        browserName !== 'chromium',
        'Specifically exercises the Android Chromium composition scheduling path.',
      );
      await page.goto('/');
      const original = '# Composition\r\n\r\nBefore $x^2$ after.\r\n';
      await page.getByLabel('Import note files').setInputFiles({
        name: 'IME.mdx',
        mimeType: 'text/plain',
        buffer: Buffer.from(original),
      });
      async function command(name: string) {
        await page.locator('.doc-title-row').click();
        await page.keyboard.press('Control+k');
        const palette = page.getByRole('dialog', { name: 'Command palette' });
        await palette.getByLabel('Search commands and notes').fill(name);
        await palette
          .getByRole('button', { name: new RegExp('^' + name) })
          .first()
          .click();
      }
      await command('Preview document');
      await page
        .getByRole('button', { name: 'Edit inline equation: x^2' })
        .click();
      const field = page.getByRole('textbox', { name: 'Inline LaTeX source' });
      expect(
        await field.evaluate(
          (dom) =>
            (dom as HTMLElement & { editContext?: unknown }).editContext ??
            null,
        ),
      ).toBeNull();
      await field.evaluate(
        async (dom, { priorInput, endFirst }) => {
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
          if (!dom.isConnected)
            throw new Error('IME Escape incorrectly cancelled the equation.');
          const write = (digit: string) => {
            const line = dom.querySelector('.cm-line')!;
            const walker = document.createTreeWalker(
              line,
              NodeFilter.SHOW_TEXT,
            );
            let textNode = walker.nextNode();
            while (textNode && !/[23]/.test(textNode.nodeValue ?? ''))
              textNode = walker.nextNode();
            if (!textNode)
              throw new Error('Expected composing digit is absent.');
            const position = textNode.nodeValue!.search(/[23]/);
            textNode.nodeValue =
              textNode.nodeValue!.slice(0, position) +
              digit +
              textNode.nodeValue!.slice(position + 1);
            const selection = window.getSelection()!;
            const range = document.createRange();
            range.setStart(textNode, position + 1);
            range.collapse(true);
            selection.removeAllRanges();
            selection.addRange(range);
            dom.dispatchEvent(
              new InputEvent('input', {
                bubbles: true,
                inputType: 'insertCompositionText',
                data: digit,
                isComposing: true,
              }),
            );
          };
          if (priorInput) {
            write('3');
            await new Promise<void>((resolve) =>
              requestAnimationFrame(() =>
                requestAnimationFrame(() => resolve()),
              ),
            );
          }
          if (priorInput) {
            const view = (
              dom as HTMLElement & {
                cmTile: {
                  root: {
                    view: { state: { doc: { toString: () => string } } };
                  };
                };
              }
            ).cmTile.root.view;
            if (view.state.doc.toString() !== '$x^3$')
              throw new Error(
                'Prior composition input has not reached CodeMirror.',
              );
          }
          write('7');
          const end = () =>
            dom.dispatchEvent(
              new CompositionEvent('compositionend', {
                bubbles: true,
                data: '7',
              }),
            );
          if (endFirst) end();
          (dom as HTMLElement).blur();
          if (!endFirst) end();
        },
        { priorInput: firstChange, endFirst },
      );
      await expect(field).toHaveCount(0);
      const download = page.waitForEvent('download');
      await command('Export current source');
      expect(readFileSync((await (await download).path())!)).toEqual(
        Buffer.from(original.replace('x^2', 'x^7')),
      );
    });
  }
}

test.describe('modern Android EditContext mathematics', () => {
  test.use({
    userAgent:
      'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/142.0.0.0 Mobile Safari/537.36',
  });
  test('finishes a blurred composition whose completion is dispatched only on EditContext', async ({
    page,
    browserName,
  }) => {
    test.skip(
      browserName !== 'chromium',
      'Requires the Chromium EditContext browser API.',
    );
    await page.goto('/');
    const original = '# EditContext\r\n\r\nBefore $x^2$ after.\r\n';
    await page.getByLabel('Import note files').setInputFiles({
      name: 'Context.mdx',
      mimeType: 'text/plain',
      buffer: Buffer.from(original),
    });
    async function command(name: string) {
      await page.locator('.doc-title-row').click();
      await page.keyboard.press('Control+k');
      const palette = page.getByRole('dialog', { name: 'Command palette' });
      await palette.getByLabel('Search commands and notes').fill(name);
      await palette
        .getByRole('button', { name: new RegExp('^' + name) })
        .first()
        .click();
    }
    await command('Preview document');
    await page
      .getByRole('button', { name: 'Edit inline equation: x^2' })
      .click();
    const field = page.getByRole('textbox', { name: 'Inline LaTeX source' });
    await field.evaluate((dom) => {
      type Context = EventTarget & {
        text: string;
        updateText: (from: number, to: number, text: string) => void;
      };
      const context = (dom as HTMLElement & { editContext?: Context })
        .editContext;
      if (!context) throw new Error('Required EditContext API is unavailable.');
      context.dispatchEvent(new CompositionEvent('compositionstart'));
      const before = context.text;
      const text = '$x^7$';
      context.updateText(0, before.length, text);
      const update = new Event('textupdate');
      Object.defineProperties(update, {
        updateRangeStart: { value: 0 },
        updateRangeEnd: { value: before.length },
        text: { value: text },
        selectionStart: { value: text.length - 1 },
        selectionEnd: { value: text.length - 1 },
      });
      context.dispatchEvent(update);
      (dom as HTMLElement).blur();
      context.dispatchEvent(new CompositionEvent('compositionend'));
    });
    await expect(field).toHaveCount(0);
    const download = page.waitForEvent('download');
    await command('Export current source');
    expect(readFileSync((await (await download).path())!)).toEqual(
      Buffer.from(original.replace('x^2', 'x^7')),
    );
  });
});
