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

async function savedSource(page: Page): Promise<string> {
  return page.evaluate(
    () =>
      new Promise<string>((resolve, reject) => {
        const open = indexedDB.open('programmable-notes-web-v1');
        open.onerror = () => reject(open.error);
        open.onsuccess = () => {
          const database = open.result;
          const read = database
            .transaction('workspace', 'readonly')
            .objectStore('workspace')
            .get('current');
          read.onsuccess = () => {
            database.close();
            const state = read.result.state;
            resolve(state.workspace.files[state.workspace.selected]);
          };
          read.onerror = () => {
            database.close();
            reject(read.error);
          };
        };
      }),
  );
}

// One project owns deliberate renderer faults after ordinary browser work ends.
test.describe.configure({ mode: 'default' });

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
      // This clock is shared by both tabs, including Source DOM-settlement frames.
      // Allow two frames without reaching the 250ms save debounce. The original
      // saved source and active composing local range must remain intact.
      await page.clock.runFor(32);
      await expect(
        other.getByText('Resolve the pending edit before saving', {
          exact: true,
        }),
      ).toHaveCount(0);
      expect(await savedSource(other)).toBe(original);
      await expect(editor).toHaveAttribute('contenteditable', 'true');
      await expect(
        editor.getByRole('heading', { name: 'Conflict local' }),
      ).toBeVisible();
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
