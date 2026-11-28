import { StrictMode } from 'react';
import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import { createNativeProduct } from '../../src/application/nativeProduct';
import { ProductRoot } from '../../src/product/ProductRoot';
import type { NativeProductServices } from '../../src/product/productApplication';
import { NotificationProvider } from '../../src/ui/Notifications';

const original = '\uFEFF# Original\r\n\r\nBody.\r\n';
const rangeDescriptors = ['getClientRects', 'getBoundingClientRect'].map(
  (key) =>
    [key, Object.getOwnPropertyDescriptor(Range.prototype, key)] as const,
);
beforeEach(() => {
  vi.stubGlobal('matchMedia', () => ({
    matches: false,
    addListener() {},
    removeListener() {},
    addEventListener() {},
    removeEventListener() {},
  }));
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
});
afterEach(() => {
  vi.unstubAllGlobals();
  for (const [key, descriptor] of rangeDescriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

function fixture(
  options: {
    recovery?: NativeProductServices['recovery'];
    save?: NativeWorkspacePorts['save'];
    files?: Record<string, string>;
    preserveAttempt?: NativeProductServices['preserveAttempt'];
    createVaultSource?: NativeWorkspacePorts['createVaultSource'];
  } = {},
) {
  const files = options.files ?? {
    'note.md': original,
    'other.mdx': '# Other\n\nOther body.\n',
  };
  let inventoryPaths = Object.keys(files);
  let sequence = 0;
  const grants = new Map<string, number>();
  const save = vi.fn<NativeWorkspacePorts['save']>(
    options.save ??
      (async () => ({ revision: `disk-${++sequence}`, durable: true })),
  );
  const workspace = createNativeWorkspace(
    {
      chooseVault: async () => ({
        vaultId: 'vault',
        displayPath: '/label/Notes',
      }),
      vaultInventory: async () => ({
        vaultId: 'vault',
        entries: inventoryPaths.map((logicalPath) => ({
          logicalPath,
          bytes: files[logicalPath]!.length,
        })),
      }),
      openVaultSources: async (_vaultId, paths) => ({
        status: 'acquired',
        vaultId: 'vault',
        documents: paths.map((logicalPath) => {
          const count = (grants.get(logicalPath) ?? 0) + 1;
          grants.set(logicalPath, count);
          return {
            id: 'private-grant-' + logicalPath + (count > 1 ? '-' + count : ''),
            revision: 'disk-0',
            logicalPath,
            name: logicalPath,
            displayPath: '/label/Notes/' + logicalPath,
            source: files[logicalPath]!,
            durabilityWarning: false,
          };
        }),
      }),
      createVaultSource:
        options.createVaultSource ??
        (async (_vaultId, path, source) => ({
          status: 'acquired',
          vaultId: 'vault',
          document: {
            id: 'created-grant-' + path,
            revision: 'disk-0',
            logicalPath: path,
            name: path,
            displayPath: '/label/Notes/' + path,
            source,
            durabilityWarning: false,
          },
        })),
      save,
      close: async () => {},
    },
    () => 'session-' + ++sequence,
  );
  const application = createNativeProduct(workspace, {
    recovery: options.recovery,
    setCloseState: async () => {},
    preserveAttempt:
      options.preserveAttempt ?? (async () => ({ durable: true })),
  });
  const mounted = render(
    <NotificationProvider>
      <ProductRoot application={application} />
    </NotificationProvider>,
  );
  return {
    ...mounted,
    application,
    save,
    hideInventory: () => {
      inventoryPaths = [];
    },
  };
}
async function chooseAndOpen(path = 'note.md') {
  fireEvent.click(screen.getByRole('button', { name: 'Choose local vault' }));
  fireEvent.click(await screen.findByRole('button', { name: 'Open ' + path }));
  return await screen.findByRole('textbox', { name: 'MDX source' });
}
async function mode(value: 'Source' | 'Preview') {
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: value }));
}

it('hands a confirmed new native document to the source editor for immediate typing', async () => {
  const mounted = fixture();
  await chooseAndOpen();
  const create = screen.getByRole('button', { name: 'New document' });
  create.focus();
  fireEvent.click(create);
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Vault-relative filename' }),
    {
      target: { value: 'new.mdx' },
    },
  );
  fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'MDX source' })).toHaveFocus(),
  );
  const id = mounted.application.snapshot().selectedSessionId!;
  expect(mounted.application.loadedDocument(id).logicalPath).toBe('new.mdx');
  const editor = EditorView.findFromDOM(
    screen.getByRole('textbox', { name: 'MDX source' }),
  )!;
  act(() =>
    editor.dispatch({
      changes: { from: 0, insert: 'Immediate native input' },
      userEvent: 'input.type',
    }),
  );
  expect(mounted.application.documents.state(id)?.witness.source).toBe(
    'Immediate native input',
  );
});

it.each(['cancelled', 'replaced', 'newer focus'] as const)(
  'does not focus a native creation after its owner was %s',
  async (outcome) => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const mounted = fixture({
      createVaultSource: async (_vaultId, path, source) => {
        await held;
        return {
          status: 'acquired',
          vaultId: 'vault',
          document: {
            id: 'created-grant-' + path,
            revision: 'disk-0',
            logicalPath: path,
            name: path,
            displayPath: '/label/Notes/' + path,
            source,
            durabilityWarning: false,
          },
        };
      },
    });
    await chooseAndOpen();
    const create = screen.getByRole('button', { name: 'New document' });
    create.focus();
    fireEvent.click(create);
    fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
    await waitFor(() =>
      expect(mounted.application.snapshot().operation).toBe('create'),
    );
    const newerControl = screen.getByRole('textbox', {
      name: 'Search documents',
    });
    if (outcome === 'newer focus') newerControl.focus();
    else
      fireEvent.click(
        screen.getByRole('button', { name: 'Close New document' }),
      );
    if (outcome === 'replaced') {
      const replacement = fixture();
      replacement.unmount();
      mounted.rerender(
        <NotificationProvider>
          <ProductRoot application={replacement.application} />
        </NotificationProvider>,
      );
      fireEvent.click(
        screen.getAllByRole('button', { name: 'Choose local vault' })[0]!,
      );
      fireEvent.click(
        await screen.findByRole('button', { name: 'Open note.md' }),
      );
      await screen.findByRole('textbox', { name: 'MDX source' });
      fireEvent.click(screen.getByRole('button', { name: 'New document' }));
    }
    await act(async () => {
      finish();
      await held;
    });
    await waitFor(() =>
      expect(mounted.application.snapshot().operation).toBeNull(),
    );
    if (outcome === 'cancelled' || outcome === 'newer focus') {
      expect(
        screen.queryByRole('dialog', { name: 'New document' }),
      ).not.toBeInTheDocument();
      if (outcome === 'newer focus') expect(newerControl).toHaveFocus();
    } else {
      expect(
        screen.getByRole('textbox', { name: 'Vault-relative filename' }),
      ).toHaveFocus();
    }
    expect(
      screen.getByRole('textbox', { name: 'MDX source' }),
    ).not.toHaveFocus();
  },
);

it('keeps a refused native creation dialog and source ownership intact', async () => {
  const mounted = fixture({
    createVaultSource: async () => {
      throw Error('refused');
    },
  });
  const oldEditor = await chooseAndOpen();
  const oldId = mounted.application.snapshot().selectedSessionId;
  fireEvent.click(screen.getByRole('button', { name: 'New document' }));
  fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
  await waitFor(() =>
    expect(mounted.application.snapshot().operation).toBeNull(),
  );
  expect(
    screen.getByRole('dialog', { name: 'New document' }),
  ).toBeInTheDocument();
  expect(
    screen.getByRole('textbox', { name: 'Vault-relative filename' }),
  ).toHaveFocus();
  expect(mounted.application.snapshot().selectedSessionId).toBe(oldId);
  expect(screen.getByRole('textbox', { name: 'MDX source' })).toBe(oldEditor);
});

it('chooses a controller vault, opens a session and autosaves editor receipts through a held writer', async () => {
  let release!: (value: { revision: string; durable: boolean }) => void;
  const mounted = fixture({
    save: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const text = await chooseAndOpen();
  const editor = EditorView.findFromDOM(text)!;
  act(() =>
    editor.dispatch({
      changes: { from: editor.state.doc.length, insert: 'Accepted.' },
      userEvent: 'input.type',
    }),
  );
  await waitFor(() => expect(mounted.save).toHaveBeenCalledTimes(1));
  expect(mounted.save).toHaveBeenCalledWith(
    'private-grant-note.md',
    'disk-0',
    original + 'Accepted.',
  );
  const id = mounted.application.snapshot().selectedSessionId!;
  expect(mounted.application.session(id).witness.source).toBe(
    original + 'Accepted.',
  );
  expect(
    screen.getByRole('status', { name: 'Document save status' }),
  ).toHaveTextContent('Saving');
  expect(document.querySelector('iframe')).toBeNull();
  expect(
    screen.queryByRole('button', { name: /Rename|Move document|Trash/ }),
  ).toBeNull();
  await act(async () => {
    release({ revision: 'disk-1', durable: true });
  });
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Document save status' }),
    ).toHaveTextContent('Saved'),
  );
});

it('retains loaded syntax identity, selected text and navigation when refreshed inventory loses its row', async () => {
  const source = '\uFEFF# Plain\r\n\r\nA set {x}.\r\n';
  const mounted = fixture({ files: { 'plain.md': source } });
  await chooseAndOpen('plain.md');
  const id = mounted.application.snapshot().selectedSessionId!;
  mounted.hideInventory();
  await act(async () => {
    await mounted.application.refreshInventory();
  });
  expect(mounted.application.loadedDocument(id).logicalPath).toBe('plain.md');
  expect(screen.getByRole('button', { name: 'Open plain.md' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  await mode('Preview');
  expect(
    screen.getByRole('textbox', { name: 'Editable document' }),
  ).toHaveTextContent('A set {x}.');
  expect(
    screen.getByRole('heading', { name: 'Document title' }),
  ).toHaveTextContent('plain.md');
  expect(mounted.application.session(id).witness.source).toBe(source);
  expect(mounted.save).not.toHaveBeenCalled();
});

it('blocks changing notes synchronously while the document owns an IME draft', async () => {
  const mounted = fixture();
  await chooseAndOpen();
  await mode('Preview');
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  const id = mounted.application.snapshot().selectedSessionId!;
  fireEvent.compositionStart(editor);
  expect(mounted.application.documents.state(id).unapplied).toBe(true);
  fireEvent.click(screen.getByRole('button', { name: 'Open other.mdx' }));
  expect(mounted.application.snapshot().selectedSessionId).toBe(id);
  fireEvent.compositionEnd(editor);
  await waitFor(() =>
    expect(mounted.application.documents.state(id).unapplied).toBe(false),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open other.mdx' }));
  await waitFor(() =>
    expect(
      mounted.application.loadedDocument(
        mounted.application.snapshot().selectedSessionId!,
      ).logicalPath,
    ).toBe('other.mdx'),
  );
});

it('retains the owning editor and exact canonical undo across Source and Preview', async () => {
  const mounted = fixture();
  const text = await chooseAndOpen();
  const editor = EditorView.findFromDOM(text)!;
  act(() =>
    editor.dispatch({
      changes: { from: editor.state.doc.length, insert: 'Accepted.' },
      userEvent: 'input.type',
    }),
  );
  const id = mounted.application.snapshot().selectedSessionId!;
  await waitFor(() =>
    expect(mounted.application.documents.state(id).autosave.status).toBe(
      'saved',
    ),
  );
  await mode('Preview');
  expect(
    EditorView.findFromDOM(mounted.container.querySelector('.cm-editor')!),
  ).toBe(editor);
  fireEvent.keyDown(
    screen.getByRole('textbox', { name: 'Editable document' }),
    { key: 'z', ctrlKey: true, code: 'KeyZ' },
  );
  await waitFor(() =>
    expect(mounted.application.session(id).witness.source).toBe(original),
  );
  expect(mounted.save).toHaveBeenLastCalledWith(
    'private-grant-note.md',
    expect.any(String),
    original,
  );
});

it('publishes direct Preview document text through the same canonical autosave session', async () => {
  const mounted = fixture();
  await chooseAndOpen();
  await mode('Preview');
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  const paragraph = editor.querySelector('p')!;
  await act(async () => {
    paragraph.textContent = 'Body. Edited.';
    document
      .getSelection()!
      .collapse(paragraph.firstChild, paragraph.textContent.length);
    fireEvent.input(editor, { inputType: 'insertText', data: ' Edited.' });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(mounted.save).toHaveBeenCalledWith(
      'private-grant-note.md',
      'disk-0',
      original.replace('Body.', 'Body. Edited.'),
    ),
  );
  expect(
    mounted.application.session(
      mounted.application.snapshot().selectedSessionId!,
    ).witness.source,
  ).toBe(original.replace('Body.', 'Body. Edited.'));
  expect(editor.querySelector('textarea, input, .cm-editor')).toBeNull();
});

it('navigates an inventory larger than the bounded loaded-source graph', async () => {
  const files = Object.fromEntries(
    Array.from({ length: 40 }, (_, index) => [
      `notes/${index}.md`,
      `# Note ${index}\n`,
    ]),
  );
  const mounted = fixture({ files });
  await chooseAndOpen('notes/39.md');
  expect(mounted.application.snapshot().entries).toHaveLength(40);
  expect(mounted.application.snapshot().loadedDocuments).toHaveLength(1);
  expect(
    screen.getByRole('heading', { name: 'Document title' }),
  ).toHaveTextContent('39.md');
});

it('closes a saved session through the supported command and reopens a fresh identity', async () => {
  const mounted = fixture();
  await chooseAndOpen();
  const first = mounted.application.snapshot().selectedSessionId!;
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  fireEvent.change(
    screen.getByRole('textbox', { name: 'Search commands and notes' }),
    { target: { value: 'Close document' } },
  );
  fireEvent.click(screen.getByRole('button', { name: /Close document/ }));
  await waitFor(() =>
    expect(mounted.application.snapshot().selectedSessionId).toBeNull(),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open note.md' }));
  await waitFor(() =>
    expect(mounted.application.snapshot().selectedSessionId).not.toBeNull(),
  );
  expect(mounted.application.snapshot().selectedSessionId).not.toBe(first);
});

it('waits for a durable recovery receipt before claiming a refused Preview attempt is saved', async () => {
  const source = '\uFEFF# Before\r\n\r\n{/* hidden */}\r\n\r\nAfter.\r\n';
  let release!: (receipt: { durable: boolean }) => void;
  const preserve = vi.fn<NativeProductServices['preserveAttempt']>(
    () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  );
  const mounted = fixture({
    files: { 'retained.mdx': source },
    preserveAttempt: preserve,
  });
  await chooseAndOpen('retained.mdx');
  await mode('Preview');
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true, code: 'KeyA' });
  fireEvent(
    editor,
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Unapplied replacement.',
    }),
  );
  await waitFor(() => expect(preserve).toHaveBeenCalledOnce());
  const id = mounted.application.snapshot().selectedSessionId!;
  expect(preserve).toHaveBeenCalledWith(
    expect.objectContaining({
      sessionId: id,
      logicalPath: 'retained.mdx',
      batch: expect.objectContaining({
        source: expect.stringContaining('Unapplied replacement.'),
      }),
    }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
  expect(screen.getByText('Saving recovery copy…')).toBeVisible();
  expect(screen.queryByText('Recovery copy saved.')).toBeNull();
  expect(mounted.application.session(id).witness.source).toBe(source);
  expect(mounted.save).not.toHaveBeenCalled();
  await act(async () => {
    release({ durable: false });
  });
  expect(
    await screen.findByText(/Recovery copy could not be saved/),
  ).toBeVisible();
  expect(mounted.application.documents.state(id).retainedFailures).toHaveLength(
    1,
  );
  expect(mounted.application.documents.state(id).unapplied).toBe(true);
});

const retainedVersion = {
  file: 'retained-version',
  id: 'retained-id',
  metadata: {
    schema: 1,
    documentId: 'retained-document',
    name: 'original.md',
    baseline: null,
    parent: null,
    generation: 1,
    createdAtMs: 1,
    sourceBytes: new TextEncoder().encode(original).length,
  },
};
it('recovery dialog creates a saved independent copy through the actual native product model', async () => {
  const create = vi.fn<NativeWorkspacePorts['createVaultSource']>(
    async (_vault, path, source) => ({
      status: 'acquired',
      vaultId: 'vault',
      document: {
        id: 'copy-grant',
        revision: 'disk-copy',
        name: path,
        logicalPath: path,
        displayPath: path,
        source,
        durabilityWarning: false,
      },
    }),
  );
  const h = fixture({
    createVaultSource: create,
    recovery: {
      list: async () => ({ versions: [retainedVersion], warning: true }),
      read: async () => original,
    },
  });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  fireEvent.change(screen.getByLabelText('Recovery version'), {
    target: { value: retainedVersion.file },
  });
  fireEvent.change(screen.getByLabelText('Recovered copy filename'), {
    target: { value: 'recovered.md' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create recovered copy' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Recover a copy' })).toBeNull(),
  );
  await waitFor(() =>
    expect(screen.getByRole('textbox', { name: 'MDX source' })).toHaveFocus(),
  );
  expect(create).toHaveBeenCalledExactlyOnceWith(
    'vault',
    'recovered.md',
    original,
  );
  expect(
    h.application.session(h.application.snapshot().selectedSessionId!).witness
      .source,
  ).toBe(original);
});
it.each(['close', 'replacement'] as const)(
  'recovery dialog lifetime cancels held reads before create: %s',
  async (kind) => {
    let release!: (source: string) => void;
    const read = vi.fn(
      () =>
        new Promise<string>((resolve) => {
          release = resolve;
        }),
    );
    const create = vi.fn<NativeWorkspacePorts['createVaultSource']>();
    const h = fixture({
      createVaultSource: create,
      recovery: {
        list: async () => ({ versions: [retainedVersion], warning: false }),
        read,
      },
    });
    await act(async () => {
      await h.application.chooseVault();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
    await screen.findByRole('option', { name: /original.md/ });
    fireEvent.change(screen.getByLabelText('Recovery version'), {
      target: { value: retainedVersion.file },
    });
    fireEvent.change(screen.getByLabelText('Recovered copy filename'), {
      target: { value: 'cancelled.md' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Create recovered copy' }),
    );
    await waitFor(() => expect(read).toHaveBeenCalledOnce());
    if (kind === 'close')
      fireEvent.click(
        screen.getByRole('button', { name: 'Close Recover a copy' }),
      );
    else {
      const next = fixture();
      next.unmount();
      h.rerender(
        <NotificationProvider>
          <ProductRoot application={next.application} />
        </NotificationProvider>,
      );
    }
    await act(async () => {
      release(original);
    });
    expect(create).not.toHaveBeenCalled();
  },
);

it('reopening an uncertain recovery copy keeps its exact destination and version visible and blocks retry', async () => {
  const create = vi
    .fn<NativeWorkspacePorts['createVaultSource']>()
    .mockRejectedValue(Error('lost acknowledgement'));
  const h = fixture({
    createVaultSource: create,
    recovery: {
      list: async () => ({ versions: [retainedVersion], warning: false }),
      read: async () => original,
    },
  });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  fireEvent.change(screen.getByLabelText('Recovery version'), {
    target: { value: retainedVersion.file },
  });
  fireEvent.change(screen.getByLabelText('Recovered copy filename'), {
    target: { value: 'uncertain.md' },
  });
  fireEvent.click(
    screen.getByRole('button', { name: 'Create recovered copy' }),
  );
  await screen.findByText(/Creation could not be confirmed/);
  fireEvent.click(screen.getByRole('button', { name: 'Close Recover a copy' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  expect(screen.getByLabelText('Recovered copy filename')).toHaveValue(
    'uncertain.md',
  );
  expect(screen.getByLabelText('Recovery version')).toHaveValue(
    retainedVersion.file,
  );
  expect(
    screen.getByRole('button', { name: 'Create recovered copy' }),
  ).toBeDisabled();
  expect(create).toHaveBeenCalledOnce();
});

it.each(['cancelled', 'newer focus'] as const)(
  'recovery creation preserves focus after %s while native creation is pending',
  async (outcome) => {
    let finish!: () => void;
    const held = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const h = fixture({
      createVaultSource: async (_vault, path, source) => {
        await held;
        return {
          status: 'acquired',
          vaultId: 'vault',
          document: {
            id: 'delayed-copy-grant',
            revision: 'disk-copy',
            name: path,
            logicalPath: path,
            displayPath: path,
            source,
            durabilityWarning: false,
          },
        };
      },
      recovery: {
        list: async () => ({ versions: [retainedVersion], warning: false }),
        read: async () => original,
      },
    });
    await act(async () => {
      await h.application.chooseVault();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    const trigger = screen.getByRole('button', { name: 'Recover a copy' });
    trigger.focus();
    fireEvent.click(trigger);
    await screen.findByRole('option', { name: /original.md/ });
    fireEvent.change(screen.getByLabelText('Recovery version'), {
      target: { value: retainedVersion.file },
    });
    fireEvent.change(screen.getByLabelText('Recovered copy filename'), {
      target: { value: 'pending-copy.md' },
    });
    const submit = screen.getByRole('button', {
      name: 'Create recovered copy',
    });
    submit.focus();
    fireEvent.click(submit);
    await waitFor(() =>
      expect(h.application.snapshot().operation).toBe('create'),
    );
    const search = screen.getByRole('textbox', { name: 'Search documents' });
    if (outcome === 'newer focus') search.focus();
    else
      fireEvent.click(
        screen.getByRole('button', { name: 'Close Recover a copy' }),
      );
    await act(async () => {
      finish();
      await held;
    });
    await waitFor(() => expect(h.application.snapshot().operation).toBeNull());
    expect(screen.queryByRole('dialog', { name: 'Recover a copy' })).toBeNull();
    expect(
      screen.getByRole('textbox', { name: 'MDX source' }),
    ).not.toHaveFocus();
    if (outcome === 'newer focus') expect(search).toHaveFocus();
  },
);

it('shows pending then failed discovery without claiming no retained versions, and retries explicitly', async () => {
  let fail!: (reason: Error) => void;
  const list = vi
    .fn<NonNullable<NativeProductServices['recovery']>['list']>()
    .mockImplementationOnce(
      () =>
        new Promise((_resolve, reject) => {
          fail = reject;
        }),
    )
    .mockResolvedValue({ versions: [], warning: false });
  const h = fixture({ recovery: { list, read: async () => original } });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const trigger = screen.getByRole('button', { name: 'Recover a copy' });
  trigger.focus();
  fireEvent.click(trigger);
  expect(screen.getByText('Loading recovery versions…')).toBeInTheDocument();
  expect(screen.queryByText('No retained versions are available.')).toBeNull();
  await waitFor(() => expect(list).toHaveBeenCalledOnce());
  await act(async () => {
    fail(Error('Recovery discovery unavailable.'));
  });
  expect(
    screen.getByText('Recovery versions could not be refreshed.'),
  ).toBeInTheDocument();
  expect(screen.queryByText('No retained versions are available.')).toBeNull();
  expect(screen.getByRole('alert')).toHaveTextContent(
    'The operation could not finish.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry discovery' }));
  await screen.findByText('No retained versions are available.');
  expect(list).toHaveBeenCalledTimes(2);
});

it('retains cached recovery options on a failed refresh and retries without discarding selection', async () => {
  const list = vi
    .fn<NonNullable<NativeProductServices['recovery']>['list']>()
    .mockResolvedValueOnce({ versions: [retainedVersion], warning: false })
    .mockRejectedValueOnce(Error('Refresh unavailable.'))
    .mockResolvedValue({ versions: [retainedVersion], warning: false });
  const h = fixture({ recovery: { list, read: async () => original } });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  fireEvent.change(screen.getByLabelText('Recovery version'), {
    target: { value: retainedVersion.file },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh versions' }));
  await screen.findByText('Recovery versions could not be refreshed.');
  expect(
    screen.getByRole('option', { name: /original.md/ }),
  ).toBeInTheDocument();
  expect(screen.getByLabelText('Recovery version')).toHaveValue(
    retainedVersion.file,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Retry discovery' }));
  await waitFor(() =>
    expect(
      screen.queryByText('Recovery versions could not be refreshed.'),
    ).toBeNull(),
  );
  expect(screen.getByLabelText('Recovery version')).toHaveValue(
    retainedVersion.file,
  );
  expect(list).toHaveBeenCalledTimes(3);
});

it('focuses an enabled modal control while initial recovery discovery is pending', async () => {
  let finish!: (catalog: {
    versions: (typeof retainedVersion)[];
    warning: boolean;
  }) => void;
  const h = fixture({
    recovery: {
      list: () =>
        new Promise((resolve) => {
          finish = resolve;
        }),
      read: async () => original,
    },
  });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  const trigger = screen.getByRole('button', { name: 'Recover a copy' });
  trigger.focus();
  fireEvent.click(trigger);
  const close = screen.getByRole('button', { name: 'Close Recover a copy' });
  expect(close).toHaveFocus();
  await waitFor(() => expect(typeof finish).toBe('function'));
  await act(async () => {
    finish({ versions: [], warning: false });
  });
});

it('can explicitly create a cached recovered copy while discovery remains failed', async () => {
  const list = vi
    .fn<NonNullable<NativeProductServices['recovery']>['list']>()
    .mockResolvedValueOnce({ versions: [retainedVersion], warning: false })
    .mockRejectedValueOnce(Error('Refresh unavailable.'));
  const h = fixture({ recovery: { list, read: async () => original } });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  fireEvent.change(screen.getByLabelText('Recovery version'), {
    target: { value: retainedVersion.file },
  });
  fireEvent.change(screen.getByLabelText('Recovered copy filename'), {
    target: { value: 'cached-copy.md' },
  });
  fireEvent.click(screen.getByRole('button', { name: 'Refresh versions' }));
  await screen.findByText('Recovery versions could not be refreshed.');
  expect(
    screen.getByRole('button', { name: 'Create recovered copy' }),
  ).toBeEnabled();
  fireEvent.click(
    screen.getByRole('button', { name: 'Create recovered copy' }),
  );
  await waitFor(() =>
    expect(screen.queryByRole('dialog', { name: 'Recover a copy' })).toBeNull(),
  );
  const selected = h.application.snapshot().selectedSessionId!;
  expect(h.application.loadedDocument(selected).logicalPath).toBe(
    'cached-copy.md',
  );
  expect(h.application.session(selected).witness.source).toBe(original);
  expect(list).toHaveBeenCalledTimes(2);
});

it.each(['resolve', 'reject'] as const)(
  'ignores an old discovery %s after replacement by a recovery-capable application',
  async (outcome) => {
    let resolve!: (catalog: {
      versions: (typeof retainedVersion)[];
      warning: boolean;
    }) => void;
    let reject!: (reason: Error) => void;
    const list = vi.fn(
      () =>
        new Promise<{ versions: (typeof retainedVersion)[]; warning: boolean }>(
          (accept, refuse) => {
            resolve = accept;
            reject = refuse;
          },
        ),
    );
    const h = fixture({ recovery: { list, read: async () => original } });
    await act(async () => {
      await h.application.chooseVault();
    });
    fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
    fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
    await waitFor(() => expect(list).toHaveBeenCalledOnce());
    const nextVersion = {
      ...retainedVersion,
      file: 'next-version',
      metadata: { ...retainedVersion.metadata, name: 'next.md' },
    };
    const next = fixture({
      recovery: {
        list: async () => ({ versions: [nextVersion], warning: false }),
        read: async () => 'next',
      },
    });
    next.unmount();
    h.rerender(
      <NotificationProvider>
        <ProductRoot application={next.application} />
      </NotificationProvider>,
    );
    await screen.findByRole('option', { name: /next.md/ });
    await act(async () => {
      if (outcome === 'resolve')
        resolve({ versions: [retainedVersion], warning: true });
      else reject(Error('Old discovery failed.'));
    });
    expect(screen.getByRole('option', { name: /next.md/ })).toBeInTheDocument();
    expect(screen.queryByRole('option', { name: /original.md/ })).toBeNull();
    expect(
      screen.queryByText('Recovery versions could not be refreshed.'),
    ).toBeNull();
    expect(screen.queryByRole('alert')).toBeNull();
  },
);

it('completes recovery discovery after strict effect replay without a false failure or stuck loading state', async () => {
  const list = vi
    .fn<NonNullable<NativeProductServices['recovery']>['list']>()
    .mockResolvedValue({ versions: [retainedVersion], warning: false });
  const h = fixture({ recovery: { list, read: async () => original } });
  await act(async () => {
    await h.application.chooseVault();
  });
  h.rerender(
    <StrictMode>
      <NotificationProvider>
        <ProductRoot application={h.application} />
      </NotificationProvider>
    </StrictMode>,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  await waitFor(() =>
    expect(screen.queryByText('Loading recovery versions…')).toBeNull(),
  );
  expect(
    screen.queryByText('Recovery versions could not be refreshed.'),
  ).toBeNull();
  expect(screen.queryByRole('alert')).toBeNull();
});

it('does not keep modal shortcuts blocked after replacement removes recovery support', async () => {
  const h = fixture({
    recovery: {
      list: async () => ({ versions: [retainedVersion], warning: false }),
      read: async () => original,
    },
  });
  await act(async () => {
    await h.application.chooseVault();
  });
  fireEvent.click(screen.getByRole('button', { name: 'Open navigation' }));
  fireEvent.click(screen.getByRole('button', { name: 'Recover a copy' }));
  await screen.findByRole('option', { name: /original.md/ });
  const next = fixture();
  next.unmount();
  h.rerender(
    <NotificationProvider>
      <ProductRoot application={next.application} />
    </NotificationProvider>,
  );
  expect(screen.queryByRole('dialog', { name: 'Recover a copy' })).toBeNull();
  fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
  expect(
    screen.getByRole('dialog', { name: 'Command palette' }),
  ).toBeInTheDocument();
});

it('shows recovery confirmation beside a failed save only after the real service acknowledgement', async () => {
  let release!: (receipt: { durable: boolean }) => void;
  const held = new Promise<{ durable: boolean }>((resolve) => {
    release = resolve;
  });
  const mounted = fixture({
    save: async () => {
      throw Error('synthetic save refusal');
    },
    preserveAttempt: () => held,
  });
  const field = await chooseAndOpen();
  const editor = EditorView.findFromDOM(field)!;
  act(() =>
    editor.dispatch({
      changes: { from: editor.state.doc.length, insert: 'Pending.' },
      userEvent: 'input.type',
    }),
  );
  const status = screen.getByRole('status', { name: 'Document save status' });
  await waitFor(() => expect(status).toHaveTextContent('Not saved'));
  expect(status).not.toHaveTextContent('Recovery confirmed');
  await act(async () => release({ durable: true }));
  await waitFor(() =>
    expect(status).toHaveTextContent('Not saved · Recovery confirmed'),
  );
  expect(EditorView.findFromDOM(field)).toBe(editor);
  const id = mounted.application.snapshot().selectedSessionId!;
  expect(mounted.application.session(id).witness.source).toBe(
    original + 'Pending.',
  );
});
