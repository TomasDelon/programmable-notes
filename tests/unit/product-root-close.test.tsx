import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { StrictMode } from 'react';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import { createNativeProduct } from '../../src/application/nativeProduct';
import type {
  ProductCloseGuard,
  ProductCloseResolution,
  ProductCloseState,
} from '../../src/product/productApplication';
import { ProductRoot } from '../../src/product/ProductRoot';
import { NotificationProvider } from '../../src/ui/Notifications';

const original = '\uFEFF# Note\r\n\r\nBody.\r\n';
const descriptors = ['getClientRects', 'getBoundingClientRect'].map(
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
  for (const [key, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

let instance = 0;
async function fixture(
  options: {
    empty?: boolean;
    choose?: NativeWorkspacePorts['chooseVault'];
    create?: NativeWorkspacePorts['createVaultSource'];
    save?: NativeWorkspacePorts['save'];
    resolve?: ProductCloseGuard['resolve'];
  } = {},
) {
  const prefix = `app-${++instance}`;
  let sequence = 0;
  let notify: ((state: ProductCloseState) => void) | undefined;
  const guard: ProductCloseGuard = {
    observe(changed) {
      notify = changed;
      return () => {
        notify = undefined;
      };
    },
    resolve: vi.fn(
      options.resolve ??
        (async (request, action) => ({
          status: action === 'cancel' ? 'cancelled' : 'committing',
          request,
          reason: null,
          state: {
            phase: action === 'cancel' ? 'idle' : 'committing',
            request: action === 'cancel' ? null : request,
          },
        })),
    ),
  };
  const save = vi.fn<NativeWorkspacePorts['save']>(
    options.save ??
      (async () => ({ revision: `disk-${++sequence}`, durable: true })),
  );
  const workspace = createNativeWorkspace(
    {
      chooseVault:
        options.choose ??
        (async () => ({
          vaultId: prefix,
          displayPath: '/synthetic/Notes',
        })),
      vaultInventory: async () => ({
        vaultId: prefix,
        entries: [{ logicalPath: 'note.mdx', bytes: original.length }],
      }),
      openVaultSources: async () => ({
        status: 'acquired',
        vaultId: prefix,
        documents: [
          {
            id: prefix + '-grant',
            revision: 'disk-0',
            logicalPath: 'note.mdx',
            name: 'note.mdx',
            displayPath: '/synthetic/Notes/note.mdx',
            source: original,
            durabilityWarning: false,
          },
        ],
      }),
      createVaultSource:
        options.create ??
        (async (_vault, path, source) => ({
          status: 'acquired',
          vaultId: prefix,
          document: {
            id: prefix + '-created',
            revision: 'disk-0',
            logicalPath: path,
            name: path,
            displayPath: '/synthetic/Notes/' + path,
            source,
            durabilityWarning: false,
          },
        })),
      save,
      close: async () => {},
    },
    () => `${prefix}-session-${++sequence}`,
  );
  const application = createNativeProduct(workspace, {
    closeGuard: guard,
    setCloseState: async () => {},
    preserveAttempt: async () => ({ durable: true }),
  });
  if (!options.empty) {
    await application.chooseVault();
    await application.open('note.mdx');
  }
  let requests = 0;
  return {
    application,
    guard,
    save,
    prefix,
    request() {
      const request = `${prefix}-close-${++requests}`;
      if (!notify)
        throw Error('Real product close observer is not subscribed.');
      notify({ phase: 'requested', request });
      return request;
    },
  };
}
const root = (
  application: Awaited<ReturnType<typeof fixture>>['application'],
  strict = false,
) => {
  const content = (
    <NotificationProvider>
      <ProductRoot application={application} />
    </NotificationProvider>
  );
  return strict ? <StrictMode>{content}</StrictMode> : content;
};
function sourceView(container: HTMLElement) {
  return EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
}

it('handles one native request in StrictMode, detaches actual input and holds it through commit acknowledgement', async () => {
  let release!: (value: ProductCloseResolution) => void;
  const f = await fixture({
    resolve: (request, action) => {
      expect(action).toBe('commit');
      return new Promise((resolve) => {
        release = (value) => resolve({ ...value, request });
      });
    },
  });
  const ui = render(root(f.application, true));
  await act(async () => {});
  const editor = sourceView(ui.container);
  const accepted = f.application.session(
    f.application.snapshot().selectedSessionId!,
  ).witness;
  let request!: string;
  act(() => {
    request = f.request();
  });
  await waitFor(() => expect(f.guard.resolve).toHaveBeenCalledOnce());
  expect(editor.contentDOM.isConnected).toBe(false);
  expect(ui.container.querySelector('.cm-editor')).toBeNull();
  expect(f.application.session(accepted.sessionId).witness).toEqual(accepted);
  await act(async () =>
    release({
      status: 'committing',
      request,
      reason: null,
      state: { phase: 'committing', request },
    }),
  );
  expect(f.application.snapshot().closing).toBe(true);
  expect(ui.container.querySelector('.cm-editor')).toBeNull();
  expect(f.guard.resolve).toHaveBeenCalledOnce();
});

it('refuses native close during actual Preview composition without destroying the pending DOM', async () => {
  const f = await fixture();
  const ui = render(root(f.application));
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  fireEvent.compositionStart(editor);
  const paragraph = editor.querySelector('p')!;
  act(() => {
    paragraph.firstChild!.textContent = 'IME attempt';
    f.request();
  });
  await waitFor(() =>
    expect(f.guard.resolve).toHaveBeenCalledWith(expect.any(String), 'cancel'),
  );
  expect(editor.isConnected).toBe(true);
  expect(paragraph.textContent).toBe('IME attempt');
  expect(ui.container.querySelector('.cm-editor')).not.toBeNull();
  expect(f.application.snapshot().closing).toBe(false);
});

it('remounts the same source/history only after a proved precommit refusal is cancelled', async () => {
  let calls = 0;
  const f = await fixture({
    resolve: async (request, action) => {
      calls++;
      return action === 'commit'
        ? {
            status: 'refused',
            request,
            reason: 'operation active',
            state: { phase: 'requested', request },
          }
        : {
            status: 'cancelled',
            request,
            reason: null,
            state: { phase: 'idle', request: null },
          };
    },
  });
  const ui = render(root(f.application));
  const before = sourceView(ui.container);
  act(() =>
    before.dispatch({
      changes: { from: before.state.doc.length, insert: 'More.' },
      userEvent: 'input',
    }),
  );
  await waitFor(() =>
    expect(
      screen.getByRole('status', { name: 'Document save status' }),
    ).toHaveTextContent('Saved to file'),
  );
  await act(async () => {});
  const id = f.application.snapshot().selectedSessionId!;
  const edited = f.application.session(id).witness.source;
  act(() => {
    f.request();
  });
  await waitFor(() => expect(calls).toBe(2));
  await waitFor(() =>
    expect(ui.container.querySelector('.cm-editor')).not.toBeNull(),
  );
  const after = sourceView(ui.container);
  expect(after).not.toBe(before);
  expect(f.application.snapshot().selectedSessionId).toBe(id);
  expect(f.application.session(id).witness.source).toBe(edited);
  act(() => {
    after.focus();
    fireEvent.keyDown(after.contentDOM, { key: 'z', ctrlKey: true });
  });
  expect(f.application.session(id).witness.source).toBe(original);
});

it('keeps detached input held after a lost commit reply instead of remounting or inventing success', async () => {
  const f = await fixture({
    resolve: async () => {
      throw Error('Lost synthetic acknowledgement.');
    },
  });
  const ui = render(root(f.application));
  await act(async () => {});
  act(() => {
    f.request();
  });
  await waitFor(() =>
    expect(f.application.snapshot().closeUncertain).toBe(true),
  );
  expect(ui.container.querySelector('.cm-editor')).toBeNull();
  expect(f.application.snapshot().closing).toBe(true);
  expect(f.guard.resolve).toHaveBeenCalledOnce();
});

it('closes an empty application only after confirming no selected editor exists', async () => {
  const f = await fixture({ empty: true });
  render(root(f.application));
  act(() => {
    f.request();
  });
  await waitFor(() =>
    expect(f.guard.resolve).toHaveBeenCalledWith(expect.any(String), 'commit'),
  );
  expect(f.application.snapshot().selectedSessionId).toBeNull();
});

it('does not remount or mutate a replacement application when the retired close cancellation arrives', async () => {
  let cancel!: (value: ProductCloseResolution) => void;
  const old = await fixture({
    resolve: (request, action) =>
      action === 'commit'
        ? Promise.resolve({
            status: 'refused',
            request,
            reason: 'native busy',
            state: { phase: 'requested', request },
          })
        : new Promise((resolve) => {
            cancel = (value) => resolve({ ...value, request });
          }),
  });
  const replacement = await fixture();
  const ui = render(root(old.application));
  await act(async () => {});
  let request!: string;
  act(() => {
    request = old.request();
  });
  await waitFor(() => expect(cancel).toBeTypeOf('function'));
  ui.rerender(root(replacement.application));
  const editor = sourceView(ui.container);
  const id = replacement.application.snapshot().selectedSessionId!;
  await act(async () =>
    cancel({
      status: 'cancelled',
      request,
      reason: null,
      state: { phase: 'idle', request: null },
    }),
  );
  expect(sourceView(ui.container)).toBe(editor);
  expect(replacement.application.snapshot().selectedSessionId).toBe(id);
  expect(replacement.application.session(id).witness.source).toBe(original);
  expect(replacement.guard.resolve).not.toHaveBeenCalled();
});

it('keeps accepted in-flight source detached until the real autosave coordinator acknowledges it', async () => {
  let release!: (receipt: { revision: string; durable: boolean }) => void;
  const f = await fixture({
    save: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const ui = render(root(f.application));
  const editor = sourceView(ui.container);
  act(() =>
    editor.dispatch({
      changes: { from: editor.state.doc.length, insert: 'Pending.' },
    }),
  );
  await waitFor(() => expect(f.save).toHaveBeenCalledOnce());
  await act(async () => {});
  const id = f.application.snapshot().selectedSessionId!;
  const accepted = f.application.session(id).witness.source;
  act(() => {
    f.request();
  });
  await waitFor(() => expect(editor.contentDOM.isConnected).toBe(false));
  expect(f.guard.resolve).not.toHaveBeenCalled();
  expect(f.application.session(id).witness.source).toBe(accepted);
  await act(async () => release({ revision: 'disk-confirmed', durable: true }));
  await waitFor(() =>
    expect(f.guard.resolve).toHaveBeenCalledWith(expect.any(String), 'commit'),
  );
  expect(f.application.documents.state(id).autosave.persisted.source).toBe(
    accepted,
  );
});

it('does not reopen replacement navigation when a retired vault chooser completes', async () => {
  let release!: (
    selection: { vaultId: string; displayPath: string } | null,
  ) => void;
  const old = await fixture({
    empty: true,
    choose: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const replacement = await fixture();
  const ui = render(root(old.application));
  fireEvent.click(screen.getByRole('button', { name: 'Choose local vault' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  ui.rerender(root(replacement.application));
  const navigation = ui.container.querySelector('#notes-navigation')!;
  expect(navigation).toHaveAttribute('aria-hidden', 'true');
  await act(async () =>
    release({ vaultId: old.prefix, displayPath: '/synthetic/Old' }),
  );
  await waitFor(() => expect(old.application.snapshot().operation).toBeNull());
  expect(navigation).toHaveAttribute('aria-hidden', 'true');
  expect(replacement.application.snapshot().vaultLabel).toBe(
    '/synthetic/Notes',
  );
});

it('does not close a replacement create dialog or reset its Preview mode after retired creation', async () => {
  let release!: (
    value: Awaited<ReturnType<NativeWorkspacePorts['createVaultSource']>>,
  ) => void;
  const old = await fixture({
    create: () =>
      new Promise((resolve) => {
        release = resolve;
      }),
  });
  const replacement = await fixture();
  const ui = render(root(old.application));
  const openCreate = () => {
    fireEvent.keyDown(window, { key: 'k', ctrlKey: true });
    fireEvent.change(
      screen.getByRole('textbox', { name: 'Search commands and notes' }),
      { target: { value: 'New document' } },
    );
    fireEvent.click(screen.getByRole('button', { name: /New document/ }));
  };
  openCreate();
  fireEvent.click(screen.getByRole('button', { name: 'Create document' }));
  await waitFor(() => expect(release).toBeTypeOf('function'));
  ui.rerender(root(replacement.application));
  fireEvent.click(screen.getByRole('button', { name: 'Close New document' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  openCreate();
  const dialog = screen.getByRole('dialog', { name: 'New document' });
  const owningEditor = screen.getByRole('textbox', {
    name: 'Editable document',
  });
  await act(async () =>
    release({
      status: 'acquired',
      vaultId: old.prefix,
      document: {
        id: old.prefix + '-created',
        revision: 'disk-created',
        logicalPath: 'Untitled.md',
        name: 'Untitled.md',
        displayPath: '/synthetic/Old/Untitled.md',
        source: '',
        durabilityWarning: false,
      },
    }),
  );
  await waitFor(() => expect(old.application.snapshot().operation).toBeNull());
  expect(dialog.isConnected).toBe(true);
  expect(owningEditor.isConnected).toBe(true);
  expect(ui.container.querySelector('.shell')).toHaveAttribute(
    'data-editor-mode',
    'preview',
  );
  expect(
    replacement.application.loadedDocument(
      replacement.application.snapshot().selectedSessionId!,
    ).logicalPath,
  ).toBe('note.mdx');
});

it('does not recreate detached input when a request predates StrictMode effect replay', async () => {
  let release!: (value: ProductCloseResolution) => void;
  const f = await fixture({
    resolve: (request) =>
      new Promise((resolve) => {
        release = (value) => resolve({ ...value, request });
      }),
  });
  const stop = f.application.subscribe(() => {});
  const request = f.request();
  const ui = render(root(f.application, true));
  await waitFor(() => expect(f.guard.resolve).toHaveBeenCalledOnce());
  expect(ui.container.querySelector('.cm-editor')).toBeNull();
  expect(
    ui.container.querySelector('[aria-label="Editable document"]'),
  ).toBeNull();
  await act(async () =>
    release({
      status: 'committing',
      request,
      reason: null,
      state: { phase: 'committing', request },
    }),
  );
  stop();
});

it('cancels a retired request when application replacement precedes queued editor admission', async () => {
  const old = await fixture();
  const replacement = await fixture();
  const ui = render(root(old.application));
  act(() => {
    old.request();
  });
  ui.rerender(root(replacement.application));
  const editor = sourceView(ui.container);
  await waitFor(() =>
    expect(old.guard.resolve).toHaveBeenCalledWith(
      expect.any(String),
      'cancel',
    ),
  );
  expect(old.guard.resolve).not.toHaveBeenCalledWith(
    expect.any(String),
    'commit',
  );
  expect(sourceView(ui.container)).toBe(editor);
  expect(editor.contentDOM.isConnected).toBe(true);
  expect(replacement.guard.resolve).not.toHaveBeenCalled();
});
