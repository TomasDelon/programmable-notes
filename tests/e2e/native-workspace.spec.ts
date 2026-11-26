import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Historical rejected-native-entry coverage with a simulated IPC adapter.
// This does not establish target product acceptance, WebKitGTK, dialogs or disk I/O.
// Migrate the fidelity/security scenarios to the shared app; do not preserve Split/X.
const original =
  '\uFEFFimport Counter from "./Counter"\r\n\r\n# First title\r\n\r\nA **bold** paragraph and $x^2$.\r\n\r\n<Counter />\r\n\r\n{/* preserve comment */}\r\n';
type NativeFixture = {
  commands: { command: string; args: Record<string, unknown> }[];
  browserStorageOpens: number;
  saves: { id: string; revision: string; source: string }[];
};

async function nativeEntry(page: Page) {
  await page.addInitScript(
    ({ source }) => {
      const fixture: NativeFixture = {
        commands: [],
        browserStorageOpens: 0,
        saves: [],
      };
      const host = window as unknown as {
        isTauri: boolean;
        __nativeFixture: NativeFixture;
        __TAURI_INTERNALS__: {
          invoke: (
            command: string,
            args?: Record<string, unknown>,
          ) => Promise<unknown>;
        };
      };
      host.isTauri = true;
      host.__nativeFixture = fixture;
      Object.defineProperty(indexedDB, 'open', {
        value() {
          fixture.browserStorageOpens++;
          throw Error('Native notes must not open a browser database');
        },
      });
      const grants = [
        {
          id: 'note-grant',
          revision: 'revision-1',
          name: 'note.mdx',
          logicalPath: 'math/note.mdx',
          displayPath: '/home/test/Notes/math/note.mdx',
          source,
          durabilityWarning: false,
        },
        {
          id: 'other-grant',
          revision: 'revision-1',
          name: 'other.mdx',
          logicalPath: 'other.mdx',
          displayPath: '/home/test/Notes/other.mdx',
          source: '# Other title\r\n\r\nSecond unchanged.\r\n',
          durabilityWarning: false,
        },
        {
          id: 'component-grant',
          revision: 'revision-1',
          name: 'Counter.tsx',
          logicalPath: 'math/Counter.tsx',
          displayPath: '/home/test/Notes/math/Counter.tsx',
          source:
            'export default function Counter() { return <button>Count</button>; }',
          durabilityWarning: false,
        },
      ];
      host.__TAURI_INTERNALS__ = {
        async invoke(command, args = {}) {
          fixture.commands.push({ command, args });
          if (command === 'open_notes_folder' || command === 'open_documents')
            return grants.map((grant) => ({ ...grant }));
          if (command === 'set_documents_dirty' || command === 'close_document')
            return;
          if (command === 'confirm_discard') return true;
          if (command === 'start_preview' || command === 'stop_preview') return;
          if (command === 'preview_connection_active') return true;
          if (command === 'desktop_update_check')
            return {
              installedVersion: '0.1.1',
              state: 'disabled',
              message: 'This testing build has no signed update channel.',
            };
          if (command === 'save_document' || command === 'reopen_document') {
            const grant = grants.find((item) => item.id === args.id);
            if (!grant || grant.revision !== args.revision)
              throw Error('Stale or unknown native grant');
            if (command === 'reopen_document') return { ...grant };
            if (typeof args.source !== 'string') throw Error('Invalid source');
            fixture.saves.push({
              id: grant.id,
              revision: grant.revision,
              source: args.source,
            });
            grant.source = args.source;
            grant.revision = `revision-${fixture.saves.length + 1}`;
            return { revision: grant.revision, durable: true };
          }
          if (command === 'recovery_draft') {
            if (args.action === 'list')
              return { snapshots: [], errors: [], capacityExceeded: false };
            if (args.action === 'migrate') return null;
            if (args.action === 'append') {
              const input = args.input as {
                documentId: string;
                name: string;
                baseline: string | null;
                parent: string | null;
                source: string;
              };
              return {
                snapshot: {
                  file: 'snapshot.json',
                  id: 'snapshot',
                  metadata: {
                    schema: 1,
                    documentId: input.documentId,
                    name: input.name,
                    baseline: input.baseline,
                    parent: input.parent,
                    generation: 1,
                    createdAtMs: Date.now(),
                    sourceBytes: new TextEncoder().encode(input.source).length,
                  },
                },
                durable: true,
                warning: null,
              };
            }
            return null;
          }
          throw Error(`Unexpected native authority: ${command}`);
        },
      };
    },
    { source: original },
  );
  await page.goto('/');
  await expect(page.locator('.native-workspace-shell')).toBeVisible();
}

async function fixture(page: Page) {
  return page.evaluate(
    () =>
      (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture,
  );
}

async function capture(page: Page, info: TestInfo, name: string) {
  const path = info.outputPath(name + '.png');
  await page.evaluate(async () => {
    await document.fonts.ready;
  });
  await page.screenshot({ path, fullPage: true, animations: 'disabled' });
  await info.attach(name, { path, contentType: 'image/png' });
}

async function mode(page: Page, name: 'Source' | 'Preview' | 'Split') {
  const handle = page.getByRole('button', { name: 'Show document modes' });
  if ((await handle.getAttribute('aria-expanded')) !== 'true')
    await handle.click();
  await page.getByRole('button', { name, exact: true }).click();
  if ((await handle.getAttribute('aria-expanded')) === 'true')
    await handle.click();
}

async function inspector(page: Page) {
  const open = page.getByRole('button', { name: 'Open right panel' });
  if (await open.isVisible()) await open.click();
}

test('native entry uses the document workspace and opaque native saves without browser persistence', async ({
  page,
}, testInfo) => {
  await nativeEntry(page);
  await capture(page, testInfo, 'native-workspace-welcome-default');
  await expect(
    page.getByRole('textbox', { name: 'Editable document' }),
  ).toBeVisible();
  await expect(page.locator('iframe')).toHaveCount(0);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
  expect(
    (await fixture(page)).commands.some(
      ({ command }) => command === 'start_preview',
    ),
  ).toBe(false);
  await inspector(page);
  await page
    .getByRole('button', { name: 'Open notes folder', exact: true })
    .click();
  await page.getByRole('button', { name: 'Open left panel' }).click();
  await expect(
    page.getByTitle('opened-1/math/note.mdx', { exact: true }),
  ).toHaveAttribute('aria-current', 'page');
  const editor = page.getByRole('textbox', { name: 'Editable document' });
  const heading = editor.locator('h1');
  await expect(heading).toHaveText('First title');
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' revised');
  await expect(heading).toHaveText('First title revised');
  await editor.press('Control+z');
  await expect(heading).toHaveText('First title');
  await editor.press('Control+Shift+z');
  await expect(heading).toHaveText('First title revised');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect.poll(async () => (await fixture(page)).saves.length).toBe(1);
  expect((await fixture(page)).saves[0]).toEqual({
    id: 'note-grant',
    revision: 'revision-1',
    source: original.replace('# First title', '# First title revised'),
  });
  await page.getByRole('button', { name: 'Undo', exact: true }).click();
  await expect(editor.locator('h1')).toHaveText('First title');
  await page.getByRole('button', { name: 'Redo', exact: true }).click();
  await expect(editor.locator('h1')).toHaveText('First title revised');
  // Focus remains on the inspector button: history shortcuts must still own
  // canonical document history outside either editing surface.
  await page.getByRole('button', { name: 'Redo', exact: true }).focus();
  await page.keyboard.press('Control+z');
  await expect(editor.locator('h1')).toHaveText('First title');
  await page.keyboard.press('Control+Shift+z');
  await expect(editor.locator('h1')).toHaveText('First title revised');
  await page
    .getByRole('button', { name: 'Open other.mdx', exact: true })
    .click();
  await expect(editor.locator('h1')).toHaveText('Other title');
  await page.getByTitle('opened-1/math/note.mdx', { exact: true }).click();
  await expect(editor.locator('h1')).toHaveText('First title revised');
  await page
    .getByRole('button', { name: 'Reopen source', exact: true })
    .click();
  await expect
    .poll(
      async () =>
        (await fixture(page)).commands.filter(
          ({ command }) => command === 'reopen_document',
        ).length,
    )
    .toBe(1);
  await expect(editor.locator('h1')).toHaveText('First title revised');
  await mode(page, 'Source');
  const rawEditor = page.getByRole('textbox', { name: 'MDX source' });
  await expect(rawEditor).toBeVisible();
  await rawEditor.click();
  await rawEditor.press('Control+End');
  await page.keyboard.insertText('Tail from Source.');
  await page.getByRole('button', { name: 'Save source', exact: true }).click();
  await expect.poll(async () => (await fixture(page)).saves.length).toBe(2);
  expect((await fixture(page)).saves[1]).toEqual({
    id: 'note-grant',
    revision: 'revision-2',
    source:
      original.replace('# First title', '# First title revised') +
      'Tail from Source.',
  });
  await mode(page, 'Preview');
  await expect(editor).toContainText('Tail from Source.');
  await expect(page.locator('iframe')).toHaveCount(0);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
  await capture(page, testInfo, 'native-workspace-desktop-browser-adapter');
});

test('native React execution stays explicit and supervised while Settings exposes the inactive signed channel', async ({
  page,
}) => {
  await nativeEntry(page);
  await inspector(page);
  await page.getByRole('button', { name: 'Settings', exact: true }).click();
  const settings = page.getByRole('dialog', { name: 'Settings' });
  await settings.getByRole('button', { name: 'Check for updates' }).click();
  await expect(settings.getByRole('status')).toContainText(
    'no signed update channel',
  );
  await expect(
    settings.getByRole('button', { name: 'Download and install' }),
  ).toHaveCount(0);
  await settings.getByRole('button', { name: 'Close', exact: true }).click();
  await mode(page, 'Split');
  await expect
    .poll(
      async () =>
        (await fixture(page)).commands.filter(
          ({ command }) => command === 'start_preview',
        ).length,
      { timeout: 20_000 },
    )
    .toBeGreaterThan(0);
  await expect(page.locator('iframe')).toHaveCount(0);
  await page.getByRole('button', { name: 'Stop preview', exact: true }).click();
  await expect
    .poll(
      async () =>
        (await fixture(page)).commands.filter(
          ({ command }) => command === 'stop_preview',
        ).length,
    )
    .toBeGreaterThan(0);
  expect(
    (await fixture(page)).commands.some(
      ({ command }) =>
        command.startsWith('plugin:fs|') ||
        command.startsWith('plugin:shell|') ||
        command.startsWith('plugin:updater|'),
    ),
  ).toBe(false);
});

test('native document workspace remains usable at tablet and mobile widths', async ({
  page,
}, testInfo) => {
  await nativeEntry(page);
  for (const [name, width, height] of [
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect(
      page.getByRole('textbox', { name: 'Editable document' }),
    ).toBeVisible();
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const scrollingArea = await page
      .locator('.native-workspace-shell .main-scroll')
      .boundingBox();
    const statusArea = await page
      .getByRole('status', { name: 'Save status' })
      .boundingBox();
    expect(scrollingArea).not.toBeNull();
    expect(statusArea).not.toBeNull();
    expect(scrollingArea!.y + scrollingArea!.height).toBeLessThanOrEqual(
      statusArea!.y + 1,
    );
    await capture(page, testInfo, `native-workspace-${name}-browser-adapter`);
  }
});
