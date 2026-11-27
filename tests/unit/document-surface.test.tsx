import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { EditorView } from '@codemirror/view';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import ts from 'typescript';
import { DocumentSurface } from '../../src/workspace/DocumentSurface';
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
  const workspace = createNativeWorkspace(
    {
      chooseVault: async () => ({ vaultId: 'vault', displayPath: '/label' }),
      vaultInventory: async () => ({
        vaultId: 'vault',
        entries: [
          { logicalPath: 'a.mdx', bytes: original.length },
          { logicalPath: 'b.mdx', bytes: 1 },
        ],
      }),
      openVaultSources: async (vaultId, paths) => ({
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
  const draw = () => {
    const id = workspace.state().selectedSessionId!;
    const state = workspace.controller.state(id);
    const source = state.witness.source;
    return (
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
    );
  };
  return { workspace, a, b, commands, histories, legacyChange, save, draw };
}

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
  h.workspace.select(h.b);
  ui.rerender(h.draw());
  act(() => {
    expect(h.commands.current!.insertText('B edit')).toBe(true);
  });
  const bAccepted = h.workspace.session(h.b).witness.source;
  act(() => {
    expect(retiredCommands.insertText('Stale A command')).toBe(false);
  });
  pending.resolve({ revision: 'a-saved', durable: true });
  await h.workspace.controller.flush();
  expect(h.workspace.session(h.b).witness.source).toBe(bAccepted);
  h.workspace.select(h.a);
  ui.rerender(h.draw());
  act(() => h.commands.current!.undo());
  expect(h.workspace.session(h.a).witness.source).toBe(original);
  act(() => h.commands.current!.redo());
  expect(h.workspace.session(h.a).witness.source).toBe(accepted);
  await h.workspace.controller.flush();
  expect(h.legacyChange).not.toHaveBeenCalled();
  expect(h.histories.current.has(h.a)).toBe(true);
  expect(h.histories.current.has('a.mdx')).toBe(false);
  expect(ui.container.querySelector('iframe')).toBeNull();
});

it('keeps unapplied native-session text selected and prevents normal close', async () => {
  const h = await nativeHost();
  const ui = render(h.draw(), { wrapper: NotificationProvider });
  act(() => h.commands.current!.formatRendered!('link'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
    target: { value: 'https://example.invalid/retained' },
  });
  expect(h.workspace.controller.state(h.a).unapplied).toBe(true);
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
  session.retainFailure({ expected: session.witness, source: failed });
  ui.rerender(h.draw());
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
