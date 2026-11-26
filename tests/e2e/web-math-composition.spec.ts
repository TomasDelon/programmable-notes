import { expect, test, type Page } from '@playwright/test';
import { readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';

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

for (const kind of ['prose/math', 'plain prose'] as const) {
  test(`a competing save during a ${kind} composition retains final Unicode through a browser restart and explicit recovery`, async ({
    browserName,
    playwright,
  }, testInfo) => {
    test.skip(
      browserName !== 'chromium',
      'Exercises Chromium composition and its on-disk profile.',
    );
    const profile = testInfo.outputPath('composition-profile');
    const open = () =>
      playwright.chromium.launchPersistentContext(profile, {
        ...testInfo.project.use.launchOptions,
        baseURL: testInfo.project.use.baseURL,
        userAgent: testInfo.project.use.userAgent,
      });
    let context = await open();
    const paragraph =
      kind === 'prose/math' ? 'Before $x$ after.' : 'Before the final word.';
    const original = `\ufeff# Conflict\r\n\r\n${paragraph}\r\n`;
    const remote = '\ufeff# Saved elsewhere\r\n\r\nRemote $y$ wins.\r\n';
    const expected = '\ufeff# Conflict local\r\n\r\n確定🌱\r\n';
    try {
      const page = await context.newPage();
      await page.goto('/');
      await page.getByLabel('Import note files').setInputFiles({
        name: 'Conflict.mdx',
        mimeType: 'text/plain',
        buffer: Buffer.from(original),
      });
      await command(page, 'Preview document');
      const shell = page.locator('.web-shell');
      await expect(shell).toHaveAttribute('data-save-status', 'saved');
      const other = await context.newPage();
      await other.goto('/');
      await command(other, 'Edit source');
      await expect(other.locator('.web-shell')).toHaveAttribute(
        'data-save-status',
        'saved',
      );
      const editor = page.getByRole('textbox', { name: 'Editable document' });
      const heading = editor.getByRole('heading', { name: 'Conflict' });
      await heading.click();
      await page.keyboard.press('End');
      // Hold the local debounce while the ordinary heading edit creates a real
      // undo event and the synthetic composition acquires the document range.
      await page.clock.install({ time: new Date('2026-11-25T12:00:00Z') });
      await page.clock.pauseAt(new Date('2026-11-25T13:00:00Z'));
      await page.keyboard.insertText(' local');
      await expect(
        editor.getByRole('heading', { name: 'Conflict local' }),
      ).toBeVisible();
      await editor.evaluate((dom, kind) => {
        if (kind === 'prose/math') {
          dom
            .querySelector('.rendered-math-render')!
            .dispatchEvent(
              new MouseEvent('mousedown', { bubbles: true, button: 0 }),
            );
        } else if (dom.querySelector('.rendered-math-host')) {
          throw new Error(
            'The prose-only fixture unexpectedly contains mathematical input.',
          );
        }
        dom.focus();
        const p = dom.querySelector('p')!;
        const selection = getSelection()!;
        const range = document.createRange();
        range.setStart(p.firstChild!, 0);
        range.setEnd(p.lastChild!, p.lastChild!.textContent!.length);
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
      }, kind);
      await page.clock.runFor(30);
      await editor.evaluate((dom, paragraph) => {
        if (getSelection()?.toString() !== paragraph)
          throw new Error('The composing document selection was lost.');
        dom.dispatchEvent(
          new CompositionEvent('compositionstart', { bubbles: true }),
        );
      }, paragraph);
      // Use an actual edit in another tab. The app's checksum and CAS save paths
      // run normally while the local composing range owns its final DOM input.
      await other.getByRole('textbox', { name: 'MDX source' }).fill(remote);
      await other.keyboard.press('Control+s');
      await expect(other.locator('.web-shell')).toHaveAttribute(
        'data-save-status',
        'saved',
      );
      await page.clock.runFor(500);
      await page.clock.resume();
      await expect(shell).toHaveAttribute('data-save-status', 'conflict');
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      const canonical = page.locator('.cm-line');
      const before = await canonical.allTextContents();
      expect(before).toContain('\ufeff# Conflict local');
      await editor.evaluate((dom) => {
        const p = dom.querySelector('p')!;
        const text = document.createTextNode('確定🌱');
        p.replaceChildren(text);
        getSelection()!.collapse(text, text.length);
        dom.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertCompositionText',
            isComposing: true,
            data: text.data,
          }),
        );
        dom.dispatchEvent(
          new CompositionEvent('compositionend', {
            bubbles: true,
            data: text.data,
          }),
        );
      });
      await expect(editor).toHaveAttribute('contenteditable', 'false');
      for (const inputType of ['historyUndo', 'historyRedo']) {
        await editor.evaluate((dom, inputType) => {
          dom.dispatchEvent(
            new InputEvent('beforeinput', {
              bubbles: true,
              cancelable: true,
              inputType,
            }),
          );
        }, inputType);
        expect(await canonical.allTextContents()).toEqual(before);
      }
      await editor.evaluate((dom) => {
        dom.querySelector('p')!.textContent = 'Late refused DOM mutation';
        dom.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertText',
            data: 'Late refused DOM mutation',
          }),
        );
      });
      await expect(page.locator('.cm-line')).toHaveText(before);
      await page.getByRole('button', { name: 'Review draft' }).click();
      const review = page.getByRole('dialog', { name: 'Retained edit' });
      await expect(review).toContainText('Recovery copy saved.');
      await expect(
        review.getByRole('textbox', { name: 'Unapplied text' }),
      ).toHaveValue(expected.replaceAll('\r\n', '\n'));
      // Kill this renderer before any unload handlers can rescue page-local state.
      const session = await context.newCDPSession(page);
      const crashed = page.waitForEvent('crash');
      void session.send('Page.crash').catch(() => {});
      await crashed;
      await context.close();
      context = await open();
      const reopened = await context.newPage();
      await reopened.goto('/');
      const exported = async () => {
        const download = reopened.waitForEvent('download');
        await command(reopened, 'Export current source');
        return readFileSync((await (await download).path())!);
      };
      // CodeMirror projects an ordinary source fill through existing physical EOLs.
      expect(await exported()).toEqual(Buffer.from(remote));
      const originalTitle = (
        await reopened.locator('.doc-title-row').innerText()
      ).trim();
      await command(reopened, 'Recovery history');
      const settings = reopened.getByRole('dialog');
      await expect(
        settings.getByRole('heading', { name: 'Retained edits' }),
      ).toBeVisible();
      const rescueDownload = reopened.waitForEvent('download');
      await settings
        .getByRole('button', { name: 'Download retained source' })
        .click();
      expect(readFileSync((await (await rescueDownload).path())!)).toEqual(
        Buffer.from(expected),
      );
      await settings
        .getByRole('button', { name: 'Restore as new note' })
        .click();
      await expect(reopened.locator('.doc-title-row')).toContainText(
        'Recovered',
      );
      expect(await exported()).toEqual(Buffer.from(expected));
      const recovered = reopened.getByRole('textbox', { name: 'MDX source' });
      await recovered.focus();
      await reopened.keyboard.press('Control+End');
      await reopened.keyboard.insertText('More');
      await expect(recovered).toContainText('More');
      await reopened.keyboard.press('Control+z');
      expect(await exported()).toEqual(Buffer.from(expected));
      await command(reopened, originalTitle);
      expect(await exported()).toEqual(Buffer.from(remote));
    } finally {
      await context.close();
      await rm(profile, { recursive: true, force: true });
    }
  });
}
