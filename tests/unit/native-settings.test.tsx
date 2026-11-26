import {
  act,
  cleanup,
  fireEvent,
  render,
  screen,
  waitFor,
  within,
} from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { App } from '../../src/App';
import type { DesktopUpdateInstall } from '../../src/desktop/updates';
import { NotificationProvider } from '../../src/ui/Notifications';

const { invoke } = vi.hoisted(() => ({ invoke: vi.fn() }));
vi.mock('@tauri-apps/api/core', () => ({ isTauri: () => true, invoke }));
vi.mock('../../src/compiler/compiler.worker?worker&inline', () => ({
  default: class {
    postMessage() {}
    terminate() {}
  },
}));
vi.mock('../../src/documents/RecoveryHistory', () => ({
  RecoveryHistory: () => null,
}));

const initialSource =
  '\uFEFFimport Counter from "./Counter"\r\n\r\n# Area\r\n\r\nGiven $x^2$.\r\n\r\n<Counter />\r\n';
const folderNotes = [
  {
    id: 'note-grant',
    revision: 'a',
    name: 'note.mdx',
    logicalPath: 'math/note.mdx',
    displayPath: '/home/test/My Notes/math/note.mdx',
    source: initialSource,
    durabilityWarning: false,
  },
  {
    id: 'component-grant',
    revision: 'a',
    name: 'Counter.tsx',
    logicalPath: 'math/Counter.tsx',
    displayPath: '/home/test/My Notes/math/Counter.tsx',
    source:
      'export default function Counter() { return <button>Count</button>; }',
    durabilityWarning: false,
  },
];
const offer = {
  installedVersion: '0.1.0',
  state: 'available',
  availableVersion: '0.2.0',
  id: 'opaque-ticket',
};
const proto = HTMLDialogElement.prototype;
const dialogMethods = {
  showModal: Object.getOwnPropertyDescriptor(proto, 'showModal'),
  close: Object.getOwnPropertyDescriptor(proto, 'close'),
};
const originalRects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getClientRects',
);
const originalRect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
);

beforeEach(() => {
  invoke.mockReset().mockImplementation((command: string) => {
    if (command === 'open_notes_folder') return Promise.resolve(folderNotes);
    if (command === 'desktop_update_check') return Promise.resolve(offer);
    if (command === 'save_document')
      return Promise.resolve({ revision: 'b', durable: true });
    return Promise.resolve();
  });
  vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response()));
  vi.spyOn(WebAssembly, 'compileStreaming').mockResolvedValue(
    new WebAssembly.Module(new Uint8Array([0, 97, 115, 109, 1, 0, 0, 0])),
  );
  Object.defineProperty(proto, 'showModal', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = true;
    },
  });
  Object.defineProperty(proto, 'close', {
    configurable: true,
    value(this: HTMLDialogElement) {
      this.open = false;
      this.dispatchEvent(new Event('close'));
    },
  });
  // jsdom provides no Range layout. The tests assert source and IPC instead.
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
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  for (const key of ['showModal', 'close'] as const) {
    const value = dialogMethods[key];
    if (value) Object.defineProperty(proto, key, value);
    else Reflect.deleteProperty(proto, key);
  }
  if (originalRects)
    Object.defineProperty(Range.prototype, 'getClientRects', originalRects);
  else Reflect.deleteProperty(Range.prototype, 'getClientRects');
  if (originalRect)
    Object.defineProperty(
      Range.prototype,
      'getBoundingClientRect',
      originalRect,
    );
  else Reflect.deleteProperty(Range.prototype, 'getBoundingClientRect');
});

async function openSettings() {
  fireEvent.click(screen.getByRole('button', { name: 'Settings' }));
  return within(await screen.findByRole('dialog', { name: 'Settings' }));
}

async function mount() {
  const result = render(<App />, { wrapper: NotificationProvider });
  fireEvent.click(
    await screen.findByRole('button', { name: 'Show document modes' }),
  );
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));
  return result;
}

it('reports a disabled signed channel through a read-only Settings check', async () => {
  invoke.mockImplementation((command: string) =>
    Promise.resolve(
      command === 'desktop_update_check'
        ? {
            installedVersion: '0.1.0',
            state: 'disabled',
            message: 'This build has no signed update channel.',
          }
        : undefined,
    ),
  );
  await mount();
  const panel = await openSettings();
  expect(invoke).not.toHaveBeenCalledWith('desktop_update_check');
  fireEvent.click(panel.getByRole('button', { name: 'Check for updates' }));
  expect(await panel.findByText('Running version 0.1.0')).toBeVisible();
  expect(panel.getByRole('status')).toHaveTextContent(
    'no signed update channel',
  );
  expect(
    panel.queryByRole('button', { name: 'Download and install' }),
  ).toBeNull();
  expect(invoke.mock.calls.map(([command]) => command)).toEqual([
    'set_documents_dirty',
    'desktop_update_check',
  ]);
});

it.each([
  ['installed', /Update installed/],
  ['unconfirmed', /result is unconfirmed/],
  ['cancelled', /Update cancelled/],
] as const)(
  'syncs locked editor state before passing an opaque ticket, then handles %s',
  async (state, notice) => {
    await mount();
    const panel = await openSettings();
    fireEvent.click(panel.getByRole('button', { name: 'Check for updates' }));
    const install = await panel.findByRole('button', {
      name: 'Download and install',
    });
    let ready!: () => void;
    let complete!: (result: DesktopUpdateInstall) => void;
    invoke.mockImplementation((command: string) => {
      if (command === 'set_documents_dirty')
        return new Promise<void>((resolve) => {
          ready = resolve;
        });
      if (command === 'desktop_update_install')
        return new Promise((resolve) => {
          complete = resolve;
        });
      return Promise.resolve();
    });
    fireEvent.click(install);
    expect(document.querySelector('.cm-content')).toHaveAttribute(
      'contenteditable',
      'false',
    );
    expect(panel.getByRole('button', { name: 'Close' })).toBeDisabled();
    expect(invoke).not.toHaveBeenCalledWith(
      'desktop_update_install',
      expect.anything(),
    );
    expect(invoke).toHaveBeenLastCalledWith('set_documents_dirty', {
      dirty: false,
      busy: false,
    });
    await act(async () => ready());
    expect(invoke).toHaveBeenLastCalledWith('desktop_update_install', {
      id: 'opaque-ticket',
    });
    await act(async () => complete({ state }));
    expect(panel.getByRole('status')).toHaveTextContent(notice);
    expect(document.querySelector('.cm-content')).toHaveAttribute(
      'contenteditable',
      state === 'cancelled' ? 'true' : 'false',
    );
    expect(
      panel.queryByRole('button', { name: 'Download and install' }),
    ).toBeNull();
    fireEvent.click(panel.getByRole('button', { name: 'Close' }));
    const save = screen.getByRole('button', { name: 'Save source' });
    const rebuild = screen.getByRole('button', { name: 'Rebuild preview' });
    if (state === 'cancelled') {
      expect(save).toBeEnabled();
      expect(rebuild).toBeEnabled();
    } else {
      expect(save).toBeDisabled();
      expect(rebuild).toBeDisabled();
    }
  },
);

it('allows read-only update checks but refuses installation with an unsaved note', async () => {
  await mount();
  const editor = EditorView.findFromDOM(document.querySelector('.cm-editor')!)!;
  act(() => editor.dispatch({ changes: { from: 0, insert: '# Unsaved\n' } }));
  expect(screen.getByLabelText('Document status')).toHaveTextContent(
    'Unsaved changes',
  );
  const panel = await openSettings();
  fireEvent.click(panel.getByRole('button', { name: 'Check for updates' }));
  const install = await panel.findByRole('button', {
    name: 'Download and install',
  });
  expect(install).toBeDisabled();
  fireEvent.click(install);
  expect(invoke).not.toHaveBeenCalledWith(
    'desktop_update_install',
    expect.anything(),
  );
});

it('shows folder context and edits literal maths without mounting an iframe', async () => {
  const { container } = await mount();
  fireEvent.click(screen.getByRole('button', { name: 'Open notes folder' }));
  fireEvent.click(screen.getByRole('button', { name: 'Open left panel' }));
  await waitFor(() =>
    expect(screen.getByTitle('opened-1/math/note.mdx')).toHaveAttribute(
      'aria-current',
      'page',
    ),
  );
  expect(
    screen.getByRole('button', { name: 'Open Counter.tsx' }),
  ).toBeVisible();
  const panel = await openSettings();
  expect(panel.getByText('/home/test/My Notes')).toBeVisible();
  fireEvent.click(panel.getByRole('button', { name: 'Close' }));
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Preview' }));
  const documentEditor = screen.getByRole('textbox', {
    name: 'Editable document',
  });
  expect(documentEditor.querySelector('.katex')).toBeVisible();
  expect(documentEditor.querySelector('[contenteditable="true"]')).toBeNull();
  expect(container.querySelector('iframe')).toBeNull();
  expect(screen.queryByRole('button', { name: 'Count' })).toBeNull();

  const heading = documentEditor.querySelector('h1')!.firstChild!;
  act(() => {
    documentEditor.focus();
    const end = heading.textContent!.length;
    document.getSelection()!.setBaseAndExtent(heading, end, heading, end);
    document.dispatchEvent(new Event('selectionchange'));
  });
  fireEvent.paste(documentEditor, {
    clipboardData: { files: [], getData: () => ' expanded' },
  });
  expect(documentEditor.querySelector('h1')).toHaveTextContent('Area expanded');
  const save = screen.getByRole('button', { name: 'Save source' });
  fireEvent.click(save);
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('save_document', {
      id: 'note-grant',
      revision: 'a',
      source: initialSource.replace('# Area', '# Area expanded'),
    }),
  );
  await waitFor(() => expect(save).toBeEnabled());
  fireEvent.click(screen.getByRole('button', { name: 'Undo' }));
  await waitFor(() =>
    expect(documentEditor.querySelector('h1')).toHaveTextContent(/^Area$/),
  );
  fireEvent.click(save);
  await waitFor(() =>
    expect(invoke).toHaveBeenCalledWith('save_document', {
      id: 'note-grant',
      revision: 'b',
      source: initialSource,
    }),
  );
  expect(invoke.mock.calls.map(([command]) => command)).not.toContain(
    'start_preview',
  );
});
