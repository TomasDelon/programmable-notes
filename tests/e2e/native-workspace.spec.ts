import { expect, test, type Page, type TestInfo } from '@playwright/test';

// Actual main-entry/shared-product browser coverage with simulated native IPC.
// This does not establish WebKitGTK, OS dialogs, real disk I/O or native sandboxing.
const original =
  '\uFEFFimport Counter from "./Counter"\r\n\r\n# First title\r\n\r\nA **bold** paragraph and $x^2$.\r\n\r\n<Counter />\r\n\r\n{/* preserve comment */}\r\n';
type NativeFixture = {
  commands: { command: string; args: Record<string, unknown> }[];
  browserStorageOpens: number;
  saves: { id: string; revision: string; source: string }[];
  files: Record<string, string>;
  opens: { id: string; path: string }[];
  closed: string[];
  holdRecoveryRead?: boolean;
  holdRecoveryAppend?: boolean;
  failSaves?: boolean;
  publishedRecovery: number;
  holdRecoveryList?: boolean;
  failRecoveryList?: boolean;
};

async function nativeEntry(page: Page) {
  await page.addInitScript(
    ({ source }) => {
      const epoch = 'aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
      const vaultId = 'synthetic-vault';
      const fixture: NativeFixture = {
        commands: [],
        browserStorageOpens: 0,
        saves: [],
        opens: [],
        closed: [],
        publishedRecovery: 0,
        files: {
          'math/note.mdx': source,
          'other.mdx': '# Other title\r\n\r\nSecond unchanged.\r\n',
          'math/Counter.tsx':
            'export default function Counter() { return <button>Count</button>; }',
        },
      };
      let guarded = false,
        authorized = false,
        snapshotNumber = 0;
      const acquisitions = new Map<string, number>();
      const grants = new Map<
        string,
        { path: string; revision: string; observed?: string }
      >();
      const revisions = new Map(
        Object.keys(fixture.files).map((path) => [path, 'revision-1']),
      );
      const diskSources = new Map(Object.entries(fixture.files));
      const watches = new Map<
        string,
        { token: string; source: string | undefined }
      >();
      let externalSequence = 0;
      let watchSequence = 0;
      function currentRevision(path: string): string {
        const source = fixture.files[path];
        if (typeof source !== 'string') throw Error('Missing synthetic source');
        if (diskSources.get(path) !== source) {
          diskSources.set(path, source);
          revisions.set(path, `external-${++externalSequence}`);
        }
        return revisions.get(path)!;
      }
      const snapshots = new Map<
        string,
        { id: string; name: string; source: string }
      >();
      const heads = new Map<string, string>();
      const host = window as unknown as {
        isTauri: boolean;
        __nativeFixture: NativeFixture;
        __releaseRecovery?: () => void;
        __releaseRecoveryAppend?: () => void;
        __releaseRecoveryList?: () => void;
        __TAURI_INTERNALS__: {
          invoke(
            command: string,
            args?: Record<string, unknown>,
          ): Promise<unknown>;
        };
      };
      const keys = (args: Record<string, unknown>, expected: string[]) => {
        if (Object.keys(args).sort().join(',') !== expected.sort().join(','))
          throw Error('Unexpected native arguments');
      };
      host.isTauri = true;
      host.__nativeFixture = fixture;
      Object.defineProperty(indexedDB, 'open', {
        value() {
          fixture.browserStorageOpens++;
          throw Error('Native notes must not open a browser database');
        },
      });
      host.__TAURI_INTERNALS__ = {
        async invoke(command, args = {}) {
          fixture.commands.push({ command, args });
          if (command === 'enable_editor_close_guard') {
            keys(args, ['version']);
            if (guarded || fixture.commands.length !== 1 || args.version !== 1)
              throw Error('Guard must precede all native work');
            guarded = true;
            return { version: 1, epoch, phase: 'idle', request: null };
          }
          if (!guarded)
            throw Error('No native authority before close negotiation');
          if (command === 'editor_close_state') {
            keys(args, ['epoch']);
            if (args.epoch !== epoch) throw Error('Wrong close epoch');
            return { version: 1, epoch, phase: 'idle', request: null };
          }
          if (command === 'set_documents_dirty') {
            keys(args, ['dirty', 'busy']);
            if (
              typeof args.dirty !== 'boolean' ||
              typeof args.busy !== 'boolean'
            )
              throw Error('Invalid close hints');
            return;
          }
          if (command === 'choose_vault') {
            keys(args, []);
            authorized = true;
            return { vaultId, displayPath: '/synthetic/Notes' };
          }
          if (command === 'vault_inventory') {
            keys(args, ['vaultId']);
            if (!authorized || args.vaultId !== vaultId)
              throw Error('Vault not authorized');
            return {
              vaultId,
              entries: Object.entries(fixture.files).map(
                ([logicalPath, text]) => ({
                  logicalPath,
                  bytes: new TextEncoder().encode(text).length,
                }),
              ),
            };
          }
          if (command === 'open_vault_sources') {
            keys(args, ['vaultId', 'paths']);
            if (
              !authorized ||
              args.vaultId !== vaultId ||
              !Array.isArray(args.paths) ||
              args.paths.length !== 1
            )
              throw Error('Invalid vault acquisition');
            return {
              status: 'acquired',
              vaultId,
              documents: args.paths.map((path: unknown) => {
                if (
                  typeof path !== 'string' ||
                  !Object.hasOwn(fixture.files, path)
                )
                  throw Error('Unknown scoped path');
                const count = (acquisitions.get(path) ?? 0) + 1;
                acquisitions.set(path, count);
                const id = `${path === 'math/note.mdx' ? 'note' : path === 'other.mdx' ? 'other' : 'component'}-grant-${count}`;
                const revision = revisions.get(path)!;
                grants.set(id, { path, revision });
                fixture.opens.push({ id, path });
                return {
                  id,
                  revision,
                  name: path.split('/').at(-1),
                  logicalPath: path,
                  displayPath: '/synthetic/Notes/' + path,
                  source: fixture.files[path],
                  durabilityWarning: false,
                };
              }),
            };
          }
          if (command === 'create_vault_source') {
            keys(args, ['vaultId', 'path', 'source']);
            if (
              !authorized ||
              args.vaultId !== vaultId ||
              typeof args.path !== 'string' ||
              typeof args.source !== 'string'
            )
              throw Error('Invalid create authority');
            const path = args.path;
            if (path in fixture.files)
              return { status: 'refused', vaultId, path, code: 'conflict' };
            if (
              !/\.(md|mdx|tsx?|jsx?)$/i.test(path) ||
              path
                .split('/')
                .some(
                  (part) =>
                    !part ||
                    [
                      '.',
                      '..',
                      '.git',
                      'node_modules',
                      '.programmable-notes',
                    ].includes(part),
                ) ||
              path.includes('\\')
            )
              return { status: 'refused', vaultId, path, code: 'rejected' };
            fixture.files[path] = args.source;
            diskSources.set(path, args.source);
            const id = 'created-grant-' + path,
              revision = 'created-revision';
            revisions.set(path, revision);
            grants.set(id, { path, revision });
            return {
              status: 'acquired',
              vaultId,
              document: {
                id,
                revision,
                logicalPath: path,
                name: path.split('/').at(-1),
                displayPath: '/synthetic/Notes/' + path,
                source: args.source,
                durabilityWarning: false,
              },
            };
          }
          if (command === 'observe_document' || command === 'watch_document') {
            keys(args, ['id', 'revision']);
            const grant = typeof args.id === 'string' && grants.get(args.id);
            if (
              !grant ||
              (args.revision !== grant.revision &&
                args.revision !== grant.observed)
            )
              throw Error('Unknown observation grant/revision');
            if (command === 'watch_document') {
              if (!watches.has(args.id as string))
                watches.set(args.id as string, {
                  token: (++watchSequence).toString(16).padStart(32, '0'),
                  source: fixture.files[grant.path],
                });
              return watches.get(args.id as string)!.token;
            }
            if (!Object.hasOwn(fixture.files, grant.path))
              return { status: 'unavailable', reason: 'missing' };
            const revision = currentRevision(grant.path);
            if (revision === args.revision)
              return { status: 'unchanged', revision };
            grant.observed = revision;
            return {
              status: 'changed',
              baselineRevision: args.revision,
              revision,
              source: fixture.files[grant.path],
            };
          }
          if (
            command === 'poll_document_watch' ||
            command === 'unwatch_document'
          ) {
            keys(args, ['id', 'watchId']);
            const grant = typeof args.id === 'string' && grants.get(args.id);
            const watch = typeof args.id === 'string' && watches.get(args.id);
            if (!grant || !watch || args.watchId !== watch.token)
              throw Error('Unknown watch scope');
            if (command === 'unwatch_document') {
              watches.delete(args.id as string);
              return;
            }
            const source = fixture.files[grant.path];
            const changed = watch.source !== source;
            watch.source = source;
            return changed;
          }
          if (command === 'save_document') {
            keys(args, ['id', 'revision', 'source']);
            const grant = typeof args.id === 'string' && grants.get(args.id);
            if (
              !grant ||
              (grant.revision !== args.revision &&
                grant.observed !== args.revision) ||
              currentRevision(grant.path) !== args.revision ||
              typeof args.source !== 'string'
            )
              throw Error('Stale or unknown native grant');
            if (fixture.failSaves)
              throw Error('Synthetic original save refused');
            fixture.saves.push({
              id: args.id as string,
              revision: args.revision as string,
              source: args.source,
            });
            fixture.files[grant.path] = args.source;
            diskSources.set(grant.path, args.source);
            grant.observed = undefined;
            grant.revision = `revision-${fixture.saves.length + 1}`;
            revisions.set(grant.path, grant.revision);
            return { revision: grant.revision, durable: true };
          }
          if (command === 'close_document') {
            keys(args, ['id']);
            if (typeof args.id !== 'string' || !grants.delete(args.id))
              throw Error('Unknown close grant');
            watches.delete(args.id);
            fixture.closed.push(args.id);
            return;
          }
          if (command === 'recovery_draft') {
            const retained = {
              id: 'b'.repeat(64),
              file: `${'a'.repeat(32)}-00000000000000000001-${'b'.repeat(64)}.pnrec`,
              metadata: {
                schema: 1,
                documentId: 'a'.repeat(32),
                name: 'retained.mdx',
                baseline: null,
                parent: null,
                generation: 1,
                createdAtMs: 1,
                sourceBytes: new TextEncoder().encode(source).length,
              },
            };
            if (args.action === 'list') {
              keys(args, ['action']);
              if (fixture.holdRecoveryList)
                await new Promise<void>((resolve) => {
                  host.__releaseRecoveryList = resolve;
                });
              if (fixture.failRecoveryList)
                throw Error('Synthetic recovery discovery unavailable.');
              return {
                snapshots: [null, retained],
                errors: [
                  {
                    file: 'damaged.pnrec',
                    message: 'synthetic corrupt version',
                  },
                ],
                capacityExceeded: true,
              };
            }
            if (
              args.action === 'restore-version' &&
              args.file === retained.file
            ) {
              keys(args, ['action', 'file']);
              if (fixture.holdRecoveryRead)
                await new Promise<void>((resolve) => {
                  host.__releaseRecovery = resolve;
                });
              return {
                name: retained.metadata.name,
                source,
                snapshot: retained,
              };
            }
            if (args.action === 'append') {
              keys(args, ['action', 'input']);
              const input = args.input as {
                documentId: string;
                name: string;
                baseline: string | null;
                parent: string | null;
                source: string;
              };
              keys(input as unknown as Record<string, unknown>, [
                'documentId',
                'name',
                'baseline',
                'parent',
                'source',
              ]);
              if (
                typeof input.source !== 'string' ||
                !Object.keys(fixture.files).some(
                  (path) => path.split('/').at(-1) === input.name,
                ) ||
                input.parent !== (heads.get(input.documentId) ?? null)
              )
                throw Error('Invalid recovery scope');
              const id = `snapshot-${++snapshotNumber}`,
                file = id + '.json';
              snapshots.set(file, {
                id,
                name: input.name,
                source: input.source,
              });
              heads.set(input.documentId, id);
              fixture.publishedRecovery++;
              if (fixture.holdRecoveryAppend)
                await new Promise<void>((resolve) => {
                  host.__releaseRecoveryAppend = resolve;
                });
              return {
                snapshot: {
                  file,
                  id,
                  metadata: {
                    schema: 1,
                    documentId: input.documentId,
                    name: input.name,
                    baseline: input.baseline,
                    parent: input.parent,
                    generation: snapshotNumber,
                    createdAtMs: Date.now(),
                    sourceBytes: new TextEncoder().encode(input.source).length,
                  },
                },
                durable: true,
                warning: null,
              };
            }
            if (args.action === 'restore-version') {
              keys(args, ['action', 'file']);
              const snapshot =
                typeof args.file === 'string' && snapshots.get(args.file);
              if (!snapshot) throw Error('Unknown recovery version');
              return { name: snapshot.name, source: snapshot.source };
            }
          }
          // Runtime, arbitrary file paths, legacy acquisition and updater calls are
          // intentionally not faked into success by this native-entry fixture.
          throw Error(`Unexpected native authority: ${command}`);
        },
      };
    },
    { source: original },
  );
  await page.goto('/');
  await expect(page.locator('html')).toHaveAttribute('data-runtime', 'native');
  await expect(
    page.getByRole('heading', { name: 'Your local vault' }),
  ).toBeVisible();
  await expect(page.locator('.native-workspace-shell')).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toHaveCount(
    0,
  );
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
async function mode(page: Page, name: 'Source' | 'Preview') {
  const { width, height } = page.viewportSize()!;
  const handle = page.getByRole('button', { name: 'Show document modes' });
  await page.mouse.move(width / 2, 1);
  await expect(handle).toHaveAttribute('aria-expanded', 'true');
  await page.getByRole('button', { name, exact: true }).click();
  await page.mouse.move(width * 0.65, height * 0.65);
  await expect(handle).toHaveAttribute('aria-expanded', 'false');
}
async function openNote(page: Page) {
  await page
    .getByRole('button', { name: 'Choose local vault', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open math/note.mdx', exact: true })
    .click();
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toBeVisible();
}
async function saved(page: Page, source: string) {
  await expect
    .poll(async () => (await fixture(page)).files['math/note.mdx'])
    .toBe(source);
  await expect(
    page.getByRole('status', { name: 'Document save status' }),
  ).toHaveText('Saved to file');
}
async function openSettings(page: Page) {
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search commands and notes' })
    .fill('Settings');
  await page
    .getByRole('button', { name: /Settings Appearance and core plugins/ })
    .click();
  return page.getByRole('dialog', { name: 'Settings' });
}

for (const profile of [
  { channel: 'DOM', version: 125 },
  { channel: 'editContext', version: 150 },
] as const) {
  test.describe(`Source composition through the ${profile.channel} browser channel`, () => {
    test.use({
      userAgent: `Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${profile.version}.0.0.0 Mobile Safari/537.36`,
    });
    test('keeps close dirty through composition, accepts exact Unicode and preserves separate keyboard undo', async ({
      page,
      browserName,
    }, info) => {
      await nativeEntry(page);
      await openNote(page);
      await page
        .getByRole('button', { name: 'Close navigation', exact: true })
        .click();
      const source = page.getByRole('textbox', { name: 'MDX source' });
      await source.focus();
      await page.keyboard.press('Control+End');
      await page.keyboard.insertText(' Before');
      const before = original + ' Before';
      await saved(page, before);
      const dirty = async () =>
        (await fixture(page)).commands
          .filter(({ command }) => command === 'set_documents_dirty')
          .at(-1)?.args.dirty;
      await expect.poll(dirty).toBe(false);
      const channel = await source.evaluate((node) => {
        const context = (
          node as HTMLElement & { editContext?: EventTarget | null }
        ).editContext;
        (context ?? node).dispatchEvent(
          new CompositionEvent('compositionstart', { bubbles: true }),
        );
        return context ? 'editContext' : 'DOM';
      });
      if (browserName === 'chromium') expect(channel).toBe(profile.channel);
      await expect.poll(dirty).toBe(true);
      await page.keyboard.insertText('確定🌱');
      const composed = before + '確定🌱';
      await expect
        .poll(async () => (await fixture(page)).files['math/note.mdx'])
        .toBe(composed);
      await expect.poll(dirty).toBe(true);
      await source.evaluate((node) => {
        const context = (
          node as HTMLElement & { editContext?: EventTarget | null }
        ).editContext;
        (context ?? node).dispatchEvent(
          new CompositionEvent('compositionend', {
            bubbles: true,
            data: '確定🌱',
          }),
        );
      });
      await expect.poll(dirty).toBe(false);
      await saved(page, composed);
      await capture(page, info, 'native-source-composition-settled');
      await page.keyboard.press('Control+z');
      await saved(page, before);
      await page.keyboard.press('Control+z');
      await saved(page, original);
      expect((await fixture(page)).browserStorageOpens).toBe(0);
    });
  });
}

test('actual native entry uses the shared editor, autosaves scoped grants and preserves history without browser persistence', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await capture(page, info, 'native-shared-empty-before');
  const initial = await fixture(page);
  expect(initial.browserStorageOpens).toBe(0);
  expect(initial.opens).toEqual([]);
  expect(initial.commands[0]).toEqual({
    command: 'enable_editor_close_guard',
    args: { version: 1 },
  });
  await openNote(page);
  await mode(page, 'Preview');
  const editor = page.getByRole('textbox', { name: 'Editable document' }),
    heading = editor.locator('h1');
  await expect(heading).toHaveText('First title');
  await expect(editor.locator('input,textarea,.cm-editor')).toHaveCount(0);
  await capture(page, info, 'native-shared-preview-before');
  await heading.click();
  await page.keyboard.press('End');
  await page.keyboard.insertText(' revised');
  const revised = original.replace('# First title', '# First title revised');
  await saved(page, revised);
  expect((await fixture(page)).saves[0]).toEqual({
    id: 'note-grant-1',
    revision: 'revision-1',
    source: revised,
  });
  await page.keyboard.press('Control+z');
  await saved(page, original);
  await page.keyboard.press('Control+Shift+z');
  await saved(page, revised);
  // Synthetic DOM key events do not authorize canonical changes. Real keyboard
  // history must still work when a trusted app control, rather than text, owns focus.
  const control = page.getByRole('button', {
    name: 'Open right panel',
    exact: true,
  });
  await control.focus();
  const beforeSynthetic = (await fixture(page)).saves.length;
  await control.evaluate((button) =>
    button.dispatchEvent(
      new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true }),
    ),
  );
  expect((await fixture(page)).files['math/note.mdx']).toBe(revised);
  expect((await fixture(page)).saves.length).toBe(beforeSynthetic);
  await page.keyboard.press('Control+z');
  await saved(page, original);
  await page.keyboard.press('Control+Shift+z');
  await saved(page, revised);
  // A real form field owns its native undo; the chrome fallback must not
  // interpret that shortcut as permission to change the note behind the dialog.
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search commands and notes' })
    .fill('New document');
  await page
    .getByRole('button', { name: /New document Create a real file/ })
    .click();
  const filename = page.getByRole('textbox', {
    name: 'Vault-relative filename',
  });
  await filename.press('Control+a');
  await page.keyboard.type('draft.mdx');
  const beforeFormUndo = await fixture(page);
  await page.keyboard.press('Control+z');
  await expect(filename).not.toHaveValue('draft.mdx');
  await page.keyboard.press('Escape');
  await expect(heading).toHaveText('First title revised');
  expect((await fixture(page)).files).toEqual(beforeFormUndo.files);
  expect((await fixture(page)).saves).toEqual(beforeFormUndo.saves);
  await page
    .getByRole('button', { name: 'Open other.mdx', exact: true })
    .click();
  await expect(editor.locator('h1')).toHaveText('Other title');
  await page
    .getByRole('button', { name: 'Open math/note.mdx', exact: true })
    .click();
  await expect(heading).toHaveText('First title revised');
  await mode(page, 'Source');
  const raw = page.getByRole('textbox', { name: 'MDX source' });
  await raw.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('Tail from Source.');
  const edited = revised + 'Tail from Source.';
  await saved(page, edited);
  await mode(page, 'Preview');
  await expect(editor).toContainText('Tail from Source.');
  await page.keyboard.press('Control+k');
  await page
    .getByRole('textbox', { name: 'Search commands and notes' })
    .fill('Close document');
  await page
    .getByRole('button', { name: /Close document Flush and close/ })
    .click();
  await expect
    .poll(async () => (await fixture(page)).closed)
    .toContain('note-grant-1');
  await page
    .getByRole('button', { name: 'Open math/note.mdx', exact: true })
    .click();
  await expect(editor.locator('h1')).toHaveText('First title revised');
  await expect(editor).toContainText('Tail from Source.');
  expect(
    (await fixture(page)).opens
      .filter(({ path }) => path === 'math/note.mdx')
      .map(({ id }) => id),
  ).toEqual(['note-grant-1', 'note-grant-2']);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
  for (const { command, args } of (await fixture(page)).commands) {
    if (command === 'save_document')
      expect(Object.keys(args).sort()).toEqual(['id', 'revision', 'source']);
    expect([
      'open_documents',
      'open_notes_folder',
      'start_preview',
      'stop_preview',
      'reopen_document',
    ]).not.toContain(command);
  }
  await capture(page, info, 'native-shared-preview-after');
});

test('native React stays unavailable without privileged fallbacks or a fake signed-update interface', async ({
  page,
}) => {
  await nativeEntry(page);
  await openNote(page);
  await mode(page, 'Preview');
  const editor = page.getByRole('textbox', { name: 'Editable document' });
  await expect(
    editor.getByText('React preview is unavailable.', { exact: true }),
  ).toBeVisible();
  await expect(
    editor.getByRole('button', { name: 'Count', exact: true }),
  ).toHaveCount(0);
  const settings = await openSettings(page);
  await expect(
    settings.getByRole('heading', { name: 'Core plugins' }),
  ).toBeVisible();
  await expect(
    settings.getByRole('button', { name: 'Check for updates', exact: true }),
  ).toHaveCount(0);
  await expect(
    settings.getByRole('button', { name: 'Download and install', exact: true }),
  ).toHaveCount(0);
  await settings
    .getByRole('button', { name: 'Close Settings', exact: true })
    .click();
  const before = await fixture(page);
  await page.evaluate(async () => {
    await new Promise<void>((resolve) => {
      window.addEventListener('message', () => resolve(), { once: true });
      window.postMessage(
        {
          type: 'save',
          path: '/outside-vault/forged.mdx',
          source: 'OVERWRITE ATTEMPT',
        },
        '*',
      );
    });
  });
  expect((await fixture(page)).files).toEqual(before.files);
  expect((await fixture(page)).saves).toEqual(before.saves);
  await expect(page.locator('iframe')).toHaveCount(0);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
  expect(
    (await fixture(page)).commands.some(
      ({ command }) =>
        command === 'start_preview' ||
        command === 'stop_preview' ||
        command.startsWith('plugin:fs|') ||
        command.startsWith('plugin:shell|') ||
        command.startsWith('plugin:updater|') ||
        command.startsWith('desktop_update_'),
    ),
  ).toBe(false);
});

test('shared native candidate keeps two document modes, autosave and navigation usable at tablet and mobile widths', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await openNote(page);
  for (const [name, width, height] of [
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    const close = page.getByRole('button', {
      name: 'Close navigation',
      exact: true,
    });
    if (await close.isVisible()) await close.click();
    await expect
      .poll(() =>
        page
          .locator('#notes-navigation')
          .evaluate((node) => node.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await mode(page, 'Preview');
    const editor = page.getByRole('textbox', { name: 'Editable document' });
    await expect(editor).toBeVisible();
    await expect(
      page.getByRole('status', { name: 'Document save status' }),
    ).toHaveText('Saved to file');
    await expect(
      page.getByRole('button', { name: 'Split', exact: true }),
    ).toHaveCount(0);
    await expect(page.locator('.mode-island-actions')).not.toContainText(
      'Split',
    );
    await expect(page.locator('.mode-island-actions button')).toHaveCount(2);
    await expect(editor.locator('input,textarea,.cm-editor')).toHaveCount(0);
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
    const main = await page
      .getByRole('main', { name: 'Document workspace' })
      .boundingBox();
    expect(main).not.toBeNull();
    expect(main!.height).toBeLessThanOrEqual(height + 1);
    await page
      .getByRole('button', { name: 'Open navigation', exact: true })
      .click();
    await expect(
      page.getByRole('button', { name: 'Open math/note.mdx', exact: true }),
    ).toBeVisible();
    await page
      .getByRole('button', { name: 'Close navigation', exact: true })
      .click();
    await page.mouse.move(width * 0.65, height * 0.7);
    await expect
      .poll(() =>
        page
          .locator('#notes-navigation')
          .evaluate((node) => node.getBoundingClientRect().right),
      )
      .toBeLessThanOrEqual(0);
    await capture(page, info, `native-shared-${name}-browser-adapter`);
  }
  expect((await fixture(page)).files['math/note.mdx']).toBe(original);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
});

test('native recovery explicitly creates a lossless new copy and preserves originals and versions', async ({
  page,
}, testInfo) => {
  await nativeEntry(page);
  await page
    .getByRole('button', { name: 'Choose local vault' })
    .first()
    .click();
  await page
    .getByRole('button', { name: 'Recover a copy', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Recover a copy' });
  await expect(dialog.getByRole('status')).toContainText(
    'Some recovery versions',
  );
  await dialog.getByLabel('Recovery version').selectOption({ index: 1 });
  await dialog.getByLabel('Recovered copy filename').fill('recovered.mdx');
  for (const [name, width, height] of [
    ['desktop', 1280, 720],
    ['tablet', 820, 1180],
    ['mobile', 390, 844],
  ] as const) {
    await page.setViewportSize({ width, height });
    await expect
      .poll(() =>
        dialog.evaluate((panel) => {
          const select = panel.querySelector('select')!;
          const input = panel.querySelector('input')!;
          const button = panel.querySelector('button[type="submit"]')!;
          const bounds = panel.getBoundingClientRect();
          const controls = [select, input, button].map((control) =>
            control.getBoundingClientRect(),
          );
          return (
            controls.every(
              (box) =>
                box.left >= bounds.left + 16 &&
                box.right <= bounds.right - 16 &&
                box.bottom <= bounds.bottom - 16,
            ) &&
            input.closest('label')!.getBoundingClientRect().top >=
              select.getBoundingClientRect().bottom + 8 &&
            panel.scrollWidth <= panel.clientWidth
          );
        }),
      )
      .toBe(true);
    await dialog.screenshot({
      path: testInfo.outputPath(`native-recovery-dialog-${name}.png`),
      animations: 'disabled',
    });
    expect(
      await page.evaluate(() => document.documentElement.scrollWidth),
    ).toBeLessThanOrEqual(width);
  }
  await page.setViewportSize({ width: 1280, height: 720 });
  await dialog.getByRole('button', { name: 'Create recovered copy' }).click();
  await expect(dialog).toBeHidden();
  await expect(page.getByRole('textbox', { name: 'MDX source' })).toBeVisible();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Recovered typing.');
  await expect
    .poll(async () => (await fixture(page)).files['recovered.mdx'])
    .toBe(original + 'Recovered typing.');
  const result = await page.evaluate(
    () =>
      (window as unknown as { __nativeFixture: NativeFixture }).__nativeFixture,
  );
  expect(result.files['recovered.mdx']).toBe(original + 'Recovered typing.');
  expect(result.files['math/note.mdx']).toBe(original);
  expect(
    result.commands.filter(
      ({ command, args }) =>
        command === 'recovery_draft' &&
        ['delete-version', 'migrate'].includes(String(args.action)),
    ),
  ).toEqual([]);
  expect(
    result.commands.filter(({ command }) => command === 'create_vault_source'),
  ).toHaveLength(1);
});

test('closing recovery during a held native read creates zero files', async ({
  page,
}) => {
  await nativeEntry(page);
  await page
    .getByRole('button', { name: 'Choose local vault' })
    .first()
    .click();
  await page.evaluate(() => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.holdRecoveryRead = true;
  });
  await page
    .getByRole('button', { name: 'Recover a copy', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Recover a copy' });
  await dialog.getByLabel('Recovery version').selectOption({ index: 1 });
  await dialog.getByLabel('Recovered copy filename').fill('cancelled.mdx');
  await dialog.getByRole('button', { name: 'Create recovered copy' }).click();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __releaseRecovery?: () => void })
            .__releaseRecovery,
      ),
    )
    .toBe('function');
  await dialog.getByRole('button', { name: 'Close Recover a copy' }).click();
  await page.evaluate(() =>
    (
      window as unknown as { __releaseRecovery?: () => void }
    ).__releaseRecovery?.(),
  );
  await expect(
    page.getByRole('button', { name: 'Recover a copy', exact: true }),
  ).toBeEnabled();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          (
            window as unknown as { __nativeFixture: NativeFixture }
          ).__nativeFixture.commands
            .filter(({ command }) => command === 'set_documents_dirty')
            .at(-1)?.args.busy,
      ),
    )
    .toBe(false);
  expect(
    await page.evaluate(
      () =>
        (
          window as unknown as { __nativeFixture: NativeFixture }
        ).__nativeFixture.commands.filter(
          ({ command }) => command === 'create_vault_source',
        ).length,
    ),
  ).toBe(0);
});

test('recovery modal owns shortcuts while filename native undo and the closed-modal palette still work', async ({
  page,
}) => {
  await nativeEntry(page);
  await openNote(page);
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.type('Modal history witness.');
  const revised = original + 'Modal history witness.';
  await saved(page, revised);
  await page
    .getByRole('button', { name: 'Recover a copy', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Recover a copy' });
  const filename = dialog.getByLabel('Recovered copy filename');
  await expect(filename).toBeEnabled();
  await filename.fill('copy.mdx');
  await filename.press('End');
  await page.keyboard.type('x');
  await page.keyboard.press('Control+z');
  await expect(filename).toHaveValue('copy.mdx');
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toBeHidden();
  await page.keyboard.press('Control+e');
  await expect(page.locator('[data-editor-mode]')).toHaveAttribute(
    'data-editor-mode',
    'source',
  );
  // Even a newer background control must not route canonical history while modal.
  await page
    .getByRole('button', { name: 'Open right panel', exact: true })
    .focus();
  await page.keyboard.press('Control+z');
  expect((await fixture(page)).files['math/note.mdx']).toBe(revised);
  await dialog.getByRole('button', { name: 'Close Recover a copy' }).click();
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toBeVisible();
  await page.keyboard.press('Control+k');
  await expect(
    page.getByRole('dialog', { name: 'Command palette' }),
  ).toBeHidden();
  await page
    .getByRole('button', { name: 'Open right panel', exact: true })
    .focus();
  await page.keyboard.press('Control+z');
  await saved(page, original);
});

test('recovery discovery shows pending and failure, preserves cached options, and retries explicitly', async ({
  page,
}, testInfo) => {
  await nativeEntry(page);
  await page
    .getByRole('button', { name: 'Choose local vault' })
    .first()
    .click();
  await page.evaluate(() => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.holdRecoveryList = true;
  });
  await page
    .getByRole('button', { name: 'Recover a copy', exact: true })
    .click();
  const dialog = page.getByRole('dialog', { name: 'Recover a copy' });
  await expect(dialog.getByText('Loading recovery versions…')).toBeVisible();
  await expect(
    dialog.getByText('No retained versions are available.'),
  ).toBeHidden();
  await expect(
    dialog.getByRole('button', { name: 'Close Recover a copy' }),
  ).toBeFocused();
  await expect
    .poll(() =>
      page.evaluate(
        () =>
          typeof (window as unknown as { __releaseRecoveryList?: () => void })
            .__releaseRecoveryList,
      ),
    )
    .toBe('function');
  await page.evaluate(() => {
    const host = window as unknown as {
      __nativeFixture: NativeFixture;
      __releaseRecoveryList?: () => void;
    };
    host.__nativeFixture.holdRecoveryList = false;
    host.__releaseRecoveryList?.();
  });
  const version = dialog.getByLabel('Recovery version');
  await expect(version).toBeEnabled();
  await version.selectOption({ index: 1 });
  const selected = await version.inputValue();
  await page.evaluate(() => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.failRecoveryList = true;
  });
  await dialog.getByRole('button', { name: 'Refresh versions' }).click();
  await expect(
    dialog.getByText('Recovery versions could not be refreshed.'),
  ).toBeVisible();
  await expect(
    dialog.getByText('No retained versions are available.'),
  ).toBeHidden();
  await expect(version).toHaveValue(selected);
  await expect(page.getByRole('alert')).toContainText(
    'The operation could not finish.',
  );
  await dialog.screenshot({
    path: testInfo.outputPath('native-recovery-discovery-failure.png'),
    animations: 'disabled',
  });
  await page.evaluate(() => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.failRecoveryList = false;
  });
  await dialog.getByRole('button', { name: 'Retry discovery' }).click();
  await expect(
    dialog.getByText('Recovery versions could not be refreshed.'),
  ).toBeHidden();
  await expect(version).toBeEnabled();
  await expect(version).toHaveValue(selected);
  const commands = (await fixture(page)).commands;
  expect(
    commands.filter(
      ({ command, args }) =>
        command === 'recovery_draft' && args.action === 'list',
    ),
  ).toHaveLength(3);
  expect(
    commands.filter(({ command }) => command === 'create_vault_source'),
  ).toHaveLength(0);
});

test('failed save confirms current recovery only after the published snapshot receives its durable acknowledgement', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await openNote(page);
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  await page.evaluate(() => {
    const host = window as unknown as { __nativeFixture: NativeFixture };
    host.__nativeFixture.failSaves = true;
    host.__nativeFixture.holdRecoveryAppend = true;
  });
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('Pending recovery.');
  const pending = original + 'Pending recovery.';
  const status = page.getByRole('status', { name: 'Document save status' });
  await expect(status).toHaveText('Not saved');
  await expect
    .poll(async () => (await fixture(page)).publishedRecovery)
    .toBeGreaterThan(0);
  await expect(status).not.toContainText('Recovery confirmed');
  expect((await fixture(page)).files['math/note.mdx']).toBe(original);
  await page.evaluate(() => {
    const host = window as unknown as {
      __nativeFixture: NativeFixture;
      __releaseRecoveryAppend?: () => void;
    };
    host.__nativeFixture.holdRecoveryAppend = false;
    host.__releaseRecoveryAppend?.();
  });
  await expect(status).toHaveText('Not saved · Recovery confirmed');
  await expect(editor).toBeFocused();
  const state = await fixture(page);
  expect(state.files['math/note.mdx']).toBe(original);
  expect(
    state.commands
      .filter(
        (entry) =>
          entry.command === 'recovery_draft' && entry.args.action === 'append',
      )
      .at(-1)?.args.input,
  ).toMatchObject({ source: pending });
  await expect(editor).toContainText('Pending recovery.');
  await capture(page, info, 'native-recovery-confirmed');
});

test('automatically observes external source and preserves keyboard history and the next exact save precondition', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await openNote(page);
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.click();
  await page.keyboard.press('Control+End');
  const external = original
    .replace('First title', 'External title')
    .replace(
      'A **bold** paragraph',
      'An externally changed **bold** paragraph',
    );
  await page.evaluate((source) => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.files['math/note.mdx'] = source;
  }, external);
  await expect(editor).toContainText('External title');
  await expect(editor).toBeFocused();
  expect((await fixture(page)).saves).toHaveLength(0);
  await page.keyboard.insertText('Typed after disk.');
  await saved(page, external + 'Typed after disk.');
  expect((await fixture(page)).saves[0]?.revision).toMatch(/^external-/);
  await page.keyboard.press('Control+z');
  await saved(page, external);
  await page.keyboard.press('Control+z');
  await saved(page, original);
  expect((await fixture(page)).browserStorageOpens).toBe(0);
  await capture(page, info, 'external-source-history');
});

test('keeps source visible and writing paused while the external file is missing, then confirms its return', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await openNote(page);
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  const editor = page.getByRole('textbox', { name: 'MDX source' });
  await page.evaluate(() => {
    delete (window as unknown as { __nativeFixture: NativeFixture })
      .__nativeFixture.files['math/note.mdx'];
  });
  await expect(
    page.getByRole('status', { name: 'Document save status' }),
  ).toHaveText('File unavailable · Saving paused');
  await expect(editor).toContainText('First title');
  expect((await fixture(page)).saves).toHaveLength(0);
  await capture(page, info, 'external-missing-source-retained');
  await page.evaluate((source) => {
    (
      window as unknown as { __nativeFixture: NativeFixture }
    ).__nativeFixture.files['math/note.mdx'] = source;
  }, original);
  await expect(
    page.getByRole('status', { name: 'Document save status' }),
  ).toHaveText('Saved to file');
  await expect(editor).toContainText('First title');
  expect((await fixture(page)).saves).toHaveLength(0);
});

test('keeps each background external revision and earlier typing as separate keyboard history', async ({
  page,
}, info) => {
  await nativeEntry(page);
  await openNote(page);
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  let editor = page.getByRole('textbox', { name: 'MDX source' });
  await editor.click();
  await page.keyboard.press('Control+End');
  await page.keyboard.insertText('Local before background.');
  const local = original + 'Local before background.';
  await saved(page, local);
  await page
    .getByRole('button', { name: 'Open navigation', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Open other.mdx', exact: true })
    .click();
  await expect(editor).toContainText('Other title');
  const one = local.replace('First title', 'External one');
  const two = one.replace('\r\n', '\n');
  const three = two.replace('External one', 'External three 🌱');
  for (const [index, source] of [one, two, three].entries()) {
    await page.evaluate((source) => {
      (
        window as unknown as { __nativeFixture: NativeFixture }
      ).__nativeFixture.files['math/note.mdx'] = source;
    }, source);
    // A later checked read with the adopted baseline proves the background
    // canonical transaction completed before the next independent publication.
    await expect
      .poll(async () =>
        (await fixture(page)).commands.some(
          ({ command, args }) =>
            command === 'observe_document' &&
            args.id === 'note-grant-1' &&
            args.revision === `external-${index + 1}`,
        ),
      )
      .toBe(true);
    await expect(editor).toContainText('Other title');
  }
  await page
    .getByRole('button', { name: 'Open math/note.mdx', exact: true })
    .click();
  await page
    .getByRole('button', { name: 'Close navigation', exact: true })
    .click();
  editor = page.getByRole('textbox', { name: 'MDX source' });
  await expect(editor).toContainText('External three 🌱');
  await editor.click();
  for (const source of [two, one, local, original]) {
    await page.keyboard.press('Control+z');
    await saved(page, source);
  }
  await page.evaluate(() => {
    const host = window as unknown as {
      __historyKeyEvents: {
        key: string;
        ctrl: boolean;
        shift: boolean;
        code: string;
      }[];
    };
    host.__historyKeyEvents = [];
    window.addEventListener(
      'keydown',
      (event) => {
        if (
          event.ctrlKey &&
          event.key.toLowerCase() === 'z' &&
          host.__historyKeyEvents.length < 16
        )
          host.__historyKeyEvents.push({
            key: event.key,
            ctrl: event.ctrlKey,
            shift: event.shiftKey,
            code: event.code,
          });
      },
      true,
    );
  });
  try {
    for (const source of [local, one, two, three]) {
      await page.keyboard.press('Control+Shift+Z');
      await saved(page, source);
    }
  } finally {
    const keys = await page.evaluate(
      () =>
        (window as unknown as { __historyKeyEvents: unknown[] })
          .__historyKeyEvents,
    );
    await info.attach('history-key-events', {
      body: Buffer.from(JSON.stringify(keys)),
      contentType: 'application/json',
    });
    expect(keys).toEqual(
      Array.from({ length: 4 }, () => ({
        key: 'Z',
        ctrl: true,
        shift: true,
        code: 'KeyZ',
      })),
    );
  }
  expect(
    (await fixture(page)).commands.filter(
      ({ command, args }) =>
        command === 'watch_document' && args.id === 'note-grant-1',
    ),
  ).toHaveLength(1);
});
