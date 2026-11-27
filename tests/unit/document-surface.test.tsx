import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, useEffect, useState } from 'react';
import { EditorView } from '@codemirror/view';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { FileText } from 'lucide-react';
import { DocumentSurface } from '../../src/workspace/DocumentSurface';
import { DocumentNavigationRow } from '../../src/workspace/DocumentNavigationRow';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';
import {
  DocumentRuntime,
  type DocumentRuntimeSession,
} from '../../src/preview/DocumentRuntime';
import type {
  EditorCommands,
  EditorHistory,
} from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';
import {
  createNativeWorkspace,
  type NativeWorkspacePorts,
} from '../../src/application/nativeWorkspace';
import { NotificationProvider } from '../../src/ui/Notifications';

const original = '\uFEFF# Heading\r\n\r\nBody.\r\n';
const runtime: DocumentRuntimeSession = {
  available: true,
  presentation: <button>Runtime presentation</button>,
  status: 'Preview ready',
  error: '',
  locations: [],
  stopped: false,
  stop: vi.fn(),
  rebuild: vi.fn(),
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
  vi.clearAllMocks();
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
  for (const [name, descriptor] of [
    ['getClientRects', originalRects],
    ['getBoundingClientRect', originalRect],
  ] as const) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});

it('preserves panel DOM/focus ref, the owning editor and exact history while Source/Preview hide panels', () => {
  let source = original;
  const commands = createRef<EditorCommands>();
  const panel = createRef<HTMLDivElement>();
  const histories: { current: EditorHistory } = { current: new Map() };
  const draw = (mode: 'source' | 'preview') => (
    <DocumentSurface
      documentId="legacy-note"
      mode={mode}
      fullDocument
      reactEnabled
      runtime={runtime}
      sourcePanelRef={panel}
      editor={{
        source,
        documentKey: 'note.mdx',
        histories,
        commandsRef: commands,
        sourceIsCurrent: (snapshot) => snapshot === source,
        onChange: (next) => {
          source = next;
        },
      }}
    />
  );
  const ui = render(draw('source'));
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  expect(panel.current).toBe(ui.container.querySelector('.web-source-panel'));
  expect(ui.container.querySelector('.web-preview-panel')).toHaveAttribute(
    'hidden',
  );
  act(() => {
    expect(commands.current!.insertText('First')).toBe(true);
  });
  const edited = source;
  ui.rerender(draw('preview'));
  expect(panel.current).toHaveAttribute('hidden');
  const presentation = screen.getByRole('button', {
    name: 'Runtime presentation',
  });
  ui.rerender(draw('source'));
  expect(ui.getByText('Runtime presentation')).toBe(presentation);
  expect(
    EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!),
  ).toBe(cm);
  act(() => commands.current!.undo());
  expect(source).toBe(original);
  act(() => commands.current!.redo());
  expect(source).toBe(edited);
  expect(rawSource(cm.state)).toBe(edited);
});

it('keeps existing preparing/paused/error branches and resume availability without publishing source', () => {
  const changed = vi.fn();
  const draw = (session: DocumentRuntimeSession) => (
    <DocumentSurface
      documentId="note"
      mode="preview"
      fullDocument
      reactEnabled
      runtime={session}
      editor={{ source: original, onChange: changed }}
    />
  );
  const ui = render(
    draw({ ...runtime, presentation: null, stopped: true, available: false }),
  );
  expect(screen.getByText('Preview is paused.')).toBeVisible();
  expect(screen.getByRole('button', { name: 'Resume preview' })).toBeDisabled();
  ui.rerender(draw({ ...runtime, presentation: null, stopped: true }));
  fireEvent.click(screen.getByRole('button', { name: 'Resume preview' }));
  expect(runtime.rebuild).toHaveBeenCalledOnce();
  ui.rerender(draw({ ...runtime, presentation: null }));
  expect(screen.getByText('Preparing preview…')).toBeVisible();
  ui.rerender(
    draw({ ...runtime, presentation: null, error: 'Compile failure' }),
  );
  expect(screen.queryByText('Preparing preview…')).toBeNull();
  expect(changed).not.toHaveBeenCalled();
});

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((yes) => {
    resolve = yes;
  });
  return { promise, resolve };
}
async function nativeHost() {
  let sequence = 0;
  const save = vi.fn<NativeWorkspacePorts['save']>(async () => ({
    revision: 'saved',
    durable: true,
  }));
  const openSources = vi.fn<NativeWorkspacePorts['openVaultSources']>(
    async (vaultId, paths) => ({
      status: 'acquired',
      vaultId,
      documents: paths.map((path) => ({
        id: `grant-${path}`,
        revision: 'disk-0',
        name: path,
        logicalPath: path,
        displayPath: `/label/${path}`,
        source: path === 'a.mdx' ? original : 'Other.',
        durabilityWarning: false,
      })),
    }),
  );
  const workspace = createNativeWorkspace(
    {
      chooseVault: async () => ({ vaultId: 'vault', displayPath: '/label' }),
      vaultInventory: async () => ({
        vaultId: 'vault',
        entries: [
          { logicalPath: 'a.mdx', bytes: original.length },
          { logicalPath: 'b.mdx', bytes: 1 },
          { logicalPath: 'c.mdx', bytes: 1 },
        ],
      }),
      openVaultSources: openSources,
      createVaultSource: async () => {
        throw Error('not exercised');
      },
      save,
      close: async () => {},
    },
    () => `session-${++sequence}`,
  );
  await workspace.choose();
  const a = await workspace.open('a.mdx');
  const b = await workspace.open('b.mdx');
  workspace.select(a);
  const commands = createRef<EditorCommands>();
  const histories: { current: EditorHistory } = { current: new Map() };
  const legacyChange = vi.fn();
  function InventoryRow({
    path,
    sessionId,
    selected,
  }: {
    path: string;
    sessionId: string | null;
    selected: boolean;
  }) {
    const document = useDocumentSession(workspace.controller, sessionId);
    return (
      <>
        <DocumentNavigationRow
          title={path}
          selected={selected}
          depth={path.split('/').length - 1}
          icon={FileText}
          onOpen={() => {
            void workspace.open(path).catch(() => {});
          }}
        />
        <output aria-label={`Status ${path}`}>
          {document?.autosave.status ?? 'not loaded'}
        </output>
      </>
    );
  }
  function ObservedSurface() {
    const [navigation, setNavigation] = useState(workspace.state());
    useEffect(() => {
      const unsubscribe = workspace.subscribe(setNavigation);
      setNavigation(workspace.state());
      return unsubscribe;
    }, []);
    const id = navigation.selectedSessionId;
    const state = useDocumentSession(workspace.controller, id);
    if (!state || !id) return null;
    const source = state.witness.source;
    return (
      <>
        <nav aria-label="Native inventory with injected OS ports">
          {navigation.inventory?.entries.map(({ logicalPath }) => {
            const loaded = navigation.sessions.find(
              (entry) => entry.logicalPath === logicalPath,
            );
            return (
              <InventoryRow
                key={logicalPath}
                path={logicalPath}
                sessionId={loaded?.sessionId ?? null}
                selected={loaded?.sessionId === id}
              />
            );
          })}
        </nav>
        <output data-testid="session-status">{state.autosave.status}</output>
        <output data-testid="session-revision">
          {state.witness.editorRevision}
        </output>
        <output data-testid="session-source">{source}</output>
        <output data-testid="session-unapplied">
          {String(state.unapplied)}
        </output>
        <output data-testid="session-retained">
          {state.retainedFailures[0]?.source}
        </output>
        <DocumentRuntime
          input={{
            files: { [state.logicalPath]: source },
            entry: state.logicalPath,
            theme: 'light',
            images: [],
            enabled: true,
          }}
        >
          {(runtime) => (
            <DocumentSurface
              documentId={id}
              mode="preview"
              fullDocument={false}
              reactEnabled
              runtime={runtime}
              editor={{
                source,
                session: workspace.session(id),
                documentKey: state.logicalPath,
                commandsRef: commands,
                histories,
                onChange: legacyChange,
                onPendingChange: (pending) =>
                  workspace.controller.setUnapplied(id, pending),
                rendered: {
                  active: true,
                  files: { [state.logicalPath]: source },
                  entry: state.logicalPath,
                  theme: 'light',
                  images: [],
                  stopped: runtime.stopped,
                },
              }}
            />
          )}
        </DocumentRuntime>
      </>
    );
  }
  const draw = () => <ObservedSurface />;
  return {
    workspace,
    a,
    b,
    commands,
    histories,
    legacyChange,
    save,
    openSources,
    draw,
  };
}

it('uses the shared row with injected OS ports: an asynchronous inventory open retains the old real editor until acknowledgement', async () => {
  const h = await nativeHost();
  const pending =
    deferred<Awaited<ReturnType<NativeWorkspacePorts['openVaultSources']>>>();
  h.openSources.mockReturnValueOnce(pending.promise);
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  const editor = EditorView.findFromDOM(
    ui.container.querySelector('.cm-editor')!,
  )!;
  const before = h.workspace.session(h.a).witness;
  fireEvent.click(screen.getByRole('button', { name: 'Open c.mdx' }));
  expect(h.openSources).toHaveBeenLastCalledWith('vault', ['c.mdx']);
  expect(h.workspace.state().selectedSessionId).toBe(h.a);
  expect(screen.getByRole('button', { name: 'Open a.mdx' })).toHaveAttribute(
    'aria-current',
    'page',
  );
  expect(
    screen.getByRole('button', { name: 'Open c.mdx' }),
  ).not.toHaveAttribute('aria-current');
  expect(
    EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!),
  ).toBe(editor);
  expect(rawSource(editor.state)).toBe(original);
  expect(screen.getByTestId('session-source').textContent).toBe(original);
  expect(h.workspace.session(h.a).witness).toEqual(before);
  const third = '\uFEFF# Third\r\n\r\nOpaque <Widget';
  await act(async () =>
    pending.resolve({
      status: 'acquired',
      vaultId: 'vault',
      documents: [
        {
          id: 'grant-c.mdx',
          revision: 'disk-c',
          name: 'c.mdx',
          logicalPath: 'c.mdx',
          displayPath: '/label/c.mdx',
          source: third,
          durabilityWarning: false,
        },
      ],
    }),
  );
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open c.mdx' })).toHaveAttribute(
      'aria-current',
      'page',
    ),
  );
  expect(screen.getByTestId('session-source').textContent).toBe(third);
  expect(
    rawSource(
      EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!.state,
    ),
  ).toBe(third);
  expect(h.workspace.session(h.a).witness).toEqual(before);
  expect(h.legacyChange).not.toHaveBeenCalled();
});

it('reuses loaded grants through the shared row while preserving independent real SourceEditor histories', async () => {
  const h = await nativeHost();
  render(h.draw(), { wrapper: NotificationProvider });
  act(() => {
    expect(h.commands.current!.insertText('A row edit')).toBe(true);
  });
  const aSource = h.workspace.session(h.a).witness.source;
  fireEvent.click(screen.getByRole('button', { name: 'Open b.mdx' }));
  await waitFor(() =>
    expect(screen.getByTestId('session-source').textContent).toBe('Other.'),
  );
  act(() => {
    expect(h.commands.current!.insertText('B row edit')).toBe(true);
  });
  const bSource = h.workspace.session(h.b).witness.source;
  fireEvent.click(screen.getByRole('button', { name: 'Open a.mdx' }));
  await waitFor(() =>
    expect(screen.getByTestId('session-source').textContent).toBe(aSource),
  );
  act(() => h.commands.current!.undo());
  expect(h.workspace.session(h.a).witness.source).toBe(original);
  act(() => h.commands.current!.redo());
  expect(h.workspace.session(h.a).witness.source).toBe(aSource);
  fireEvent.click(screen.getByRole('button', { name: 'Open b.mdx' }));
  await waitFor(() =>
    expect(screen.getByTestId('session-source').textContent).toBe(bSource),
  );
  act(() => h.commands.current!.undo());
  expect(h.workspace.session(h.b).witness.source).toBe('Other.');
  act(() => h.commands.current!.redo());
  expect(h.workspace.session(h.b).witness.source).toBe(bSource);
  await act(() => h.workspace.controller.flush());
  expect(h.openSources).toHaveBeenCalledTimes(2);
  expect(h.workspace.state().sessions.map((entry) => entry.sessionId)).toEqual([
    h.a,
    h.b,
  ]);
  expect(h.histories.current.has(h.a)).toBe(true);
  expect(h.histories.current.has(h.b)).toBe(true);
  expect(h.histories.current.has('a.mdx')).toBe(false);
  expect(h.legacyChange).not.toHaveBeenCalled();
});

it('projects an old held save only into its originating row status after shared navigation selects another source', async () => {
  const h = await nativeHost();
  const pending = deferred<{ revision: string; durable: boolean }>();
  h.save.mockReturnValueOnce(pending.promise);
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  act(() => {
    expect(h.commands.current!.insertText('Held A row edit')).toBe(true);
  });
  const accepted = h.workspace.session(h.a).witness.source;
  await waitFor(() =>
    expect(screen.getByLabelText('Status a.mdx')).toHaveTextContent('writing'),
  );
  expect(h.save).toHaveBeenCalledWith('grant-a.mdx', 'disk-0', accepted);
  fireEvent.click(screen.getByRole('button', { name: 'Open b.mdx' }));
  await waitFor(() =>
    expect(screen.getByRole('button', { name: 'Open b.mdx' })).toHaveAttribute(
      'aria-current',
      'page',
    ),
  );
  await waitFor(() => expect(h.workspace.state().operation).toBeNull());
  const bState = h.workspace.controller.state(h.b);
  const bEditor = EditorView.findFromDOM(
    ui.container.querySelector('.cm-editor')!,
  )!;
  const bCommands = h.commands.current;
  expect(screen.getByTestId('session-status')).toHaveTextContent('saved');
  await act(async () => {
    pending.resolve({ revision: 'a-row-saved', durable: true });
    await h.workspace.controller.flush();
  });
  expect(screen.getByLabelText('Status a.mdx')).toHaveTextContent('saved');
  expect(screen.getByLabelText('Status b.mdx')).toHaveTextContent('saved');
  expect(screen.getByTestId('session-status')).toHaveTextContent('saved');
  expect(screen.getByTestId('session-source').textContent).toBe('Other.');
  expect(h.workspace.controller.state(h.b)).toEqual(bState);
  expect(
    EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!),
  ).toBe(bEditor);
  expect(h.commands.current).toBe(bCommands);
  expect(h.workspace.state().selectedSessionId).toBe(h.b);
  expect(h.openSources).toHaveBeenCalledTimes(2);
  expect(h.legacyChange).not.toHaveBeenCalled();
});

it('binds the same surface to native sessions: delayed writes stay with their origin and per-session undo survives switching', async () => {
  const h = await nativeHost();
  const pending = deferred<{ revision: string; durable: boolean }>();
  h.save.mockReturnValueOnce(pending.promise);
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  act(() => {
    expect(h.commands.current!.insertText('Added')).toBe(true);
  });
  const accepted = h.workspace.session(h.a).witness.source;
  const retiredCommands = h.commands.current!;
  await Promise.resolve();
  expect(h.save).toHaveBeenCalledWith('grant-a.mdx', 'disk-0', accepted);
  await act(async () => h.workspace.select(h.b));
  act(() => {
    expect(h.commands.current!.insertText('B edit')).toBe(true);
  });
  const bAccepted = h.workspace.session(h.b).witness.source;
  act(() => {
    expect(retiredCommands.insertText('Stale A command')).toBe(false);
  });
  await act(async () => {
    pending.resolve({ revision: 'a-saved', durable: true });
    await h.workspace.controller.flush();
  });
  expect(h.workspace.session(h.b).witness.source).toBe(bAccepted);
  await act(async () => h.workspace.select(h.a));
  act(() => h.commands.current!.undo());
  expect(h.workspace.session(h.a).witness.source).toBe(original);
  act(() => h.commands.current!.redo());
  expect(h.workspace.session(h.a).witness.source).toBe(accepted);
  await act(() => h.workspace.controller.flush());
  expect(h.legacyChange).not.toHaveBeenCalled();
  expect(h.histories.current.has(h.a)).toBe(true);
  expect(h.histories.current.has('a.mdx')).toBe(false);
  expect(ui.container.querySelector('iframe')).toBeNull();
});

it('observes writing to saved and exact canonical bytes without another edit or manual rerender', async () => {
  const h = await nativeHost();
  const pending = deferred<{ revision: string; durable: boolean }>();
  h.save.mockReturnValueOnce(pending.promise);
  render(h.draw(), { wrapper: NotificationProvider });
  act(() => {
    expect(h.commands.current!.insertText('First')).toBe(true);
    expect(h.commands.current!.insertText('Second')).toBe(true);
  });
  const witness = h.workspace.session(h.a).witness;
  await waitFor(() =>
    expect(screen.getByTestId('session-status')).toHaveTextContent('writing'),
  );
  expect(screen.getByTestId('session-revision')).toHaveTextContent(
    String(witness.editorRevision),
  );
  expect(screen.getByTestId('session-source').textContent).toBe(witness.source);
  await act(async () => {
    pending.resolve({ revision: 'written', durable: true });
    await h.workspace.controller.flush();
  });
  expect(screen.getByTestId('session-status')).toHaveTextContent('saved');
  expect(h.workspace.session(h.a).witness).toEqual(witness);
  expect(h.legacyChange).not.toHaveBeenCalled();
});

it('keeps unapplied native-session text selected and prevents normal close', async () => {
  const h = await nativeHost();
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  act(() => h.commands.current!.formatRendered!('link'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
    target: { value: 'https://example.invalid/retained' },
  });
  expect(h.workspace.controller.state(h.a).unapplied).toBe(true);
  await waitFor(() =>
    expect(screen.getByTestId('session-unapplied')).toHaveTextContent('true'),
  );
  expect(() => h.workspace.select(h.b)).toThrow();
  await expect(h.workspace.close(h.a)).rejects.toThrow();
  expect(h.workspace.state().selectedSessionId).toBe(h.a);
  expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
    'https://example.invalid/retained',
  );
  expect(ui.container.querySelector('.ProseMirror')).not.toBeNull();
});

it('retains a failed native-session publication separately from accepted source and blocks switching or close', async () => {
  const h = await nativeHost();
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  const session = h.workspace.session(h.a);
  const failed = '\uFEFFUnpublished attempt.\r\n';
  await act(async () =>
    session.retainFailure({ expected: session.witness, source: failed }),
  );
  expect(screen.getByTestId('session-retained').textContent).toBe(failed);
  expect(() => h.workspace.select(h.b)).toThrow();
  await expect(h.workspace.close(h.a)).rejects.toThrow();
  const state = h.workspace.controller.state(h.a);
  expect(state.retainedFailures[0]?.source).toBe(failed);
  expect(state.witness.source).toBe(original);
  expect(h.workspace.state().selectedSessionId).toBe(h.a);
  expect(h.save).not.toHaveBeenCalled();
  expect(ui.container.querySelector('.ProseMirror')).not.toBeNull();
});

it('uses the unavailable default for an opaque MDX island without importing browser persistence or native invoke into the surface', () => {
  const source = 'export const Counter = () => 1\n\nText\n\n<Counter />';
  const ui = render(
    <DocumentRuntime
      input={{
        files: { 'note.mdx': source },
        entry: 'note.mdx',
        theme: 'light',
        images: [],
        enabled: true,
      }}
    >
      {(runtime) => (
        <DocumentSurface
          documentId="fixture"
          mode="preview"
          fullDocument={false}
          reactEnabled
          runtime={runtime}
          editor={{
            source,
            onChange: vi.fn(),
            rendered: {
              active: true,
              files: { 'note.mdx': source },
              entry: 'note.mdx',
              theme: 'light',
              images: [],
              stopped: runtime.stopped,
            },
          }}
        />
      )}
    </DocumentRuntime>,
    { wrapper: NotificationProvider },
  );
  expect(screen.getByText('React preview is unavailable.')).toBeVisible();
  expect(ui.container.querySelector('iframe')).toBeNull();
  const code = readFileSync('src/workspace/DocumentSurface.tsx', 'utf8');
  const tree = ts.createSourceFile(
    'DocumentSurface.tsx',
    code,
    ts.ScriptTarget.Latest,
    true,
    ts.ScriptKind.TSX,
  );
  const imports = tree.statements
    .filter(ts.isImportDeclaration)
    .filter((node) => !node.importClause?.isTypeOnly)
    .map((node) => (node.moduleSpecifier as ts.StringLiteral).text);
  expect(imports).toEqual(['../editor/SourceEditor', 'lucide-react']);
  expect(readFileSync('src/web/WebApp.tsx', 'utf8')).toContain(
    '<DocumentSurface',
  );
});
