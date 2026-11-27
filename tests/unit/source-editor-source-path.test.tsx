import { act, render, screen, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { isolateHistory, undoDepth } from '@codemirror/commands';
import { createRef, type RefObject } from 'react';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import {
  SourceEditor,
  type EditorCommands,
  type EditorHistory,
} from '../../src/editor/SourceEditor';
import type { SourceSession } from '../../src/editor/sourceWitness';
import { rawSource } from '../../src/editor/live/rawSource';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';
import { NotificationProvider } from '../../src/ui/Notifications';

const rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getClientRects',
);
const rect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
);
beforeEach(() => {
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
  for (const [key, descriptor] of [
    ['getClientRects', rects],
    ['getBoundingClientRect', rect],
  ] as const) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

function controller() {
  let revision = 0;
  return new DocumentSessions(
    async () => ({ diskRevision: `disk-${++revision}`, durable: true }),
    async () => {},
  );
}
function attach(
  documents: DocumentSessions,
  id: string,
  source: string,
  logicalPath = 'notes/plain.md',
) {
  return documents.attach({
    witness: { sessionId: id, editorRevision: 0, source },
    logicalPath,
    diskRevision: 'disk-0',
  });
}
function ConnectedEditor({
  documents,
  session,
  documentKey,
  sourcePath,
  active = true,
  commands,
  histories,
}: {
  documents: DocumentSessions;
  session: SourceSession;
  documentKey?: string;
  sourcePath?: string;
  active?: boolean;
  commands?: RefObject<EditorCommands>;
  histories?: RefObject<EditorHistory>;
}) {
  const state = useDocumentSession(documents, session.witness.sessionId)!;
  const path = sourcePath ?? documentKey ?? 'note.mdx';
  return (
    <SourceEditor
      source={state.witness.source}
      session={session}
      documentKey={documentKey}
      sourcePath={sourcePath}
      commandsRef={commands}
      histories={histories}
      onChange={() => {}}
      rendered={{
        active,
        files: { [path]: state.witness.source },
        entry: path,
        theme: 'light',
        images: [],
        stopped: true,
        corePlugins: { react: false },
        showComponentSource: true,
      }}
    />
  );
}

for (const { documentKey, sourcePath, mdx } of [
  {
    documentKey: 'opaque-session-41',
    sourcePath: 'notes/plain.md',
    mdx: false,
  },
  {
    documentKey: 'misleading.md',
    sourcePath: 'notes/component.mdx',
    mdx: true,
  },
  { documentKey: 'legacy/plain.md', sourcePath: undefined, mdx: false },
  { documentKey: 'legacy/component.mdx', sourcePath: undefined, mdx: true },
  { documentKey: undefined, sourcePath: undefined, mdx: true },
]) {
  it(`uses ${sourcePath ?? documentKey ?? 'note.mdx'} for syntax independently of history identity`, () => {
    const source =
      '\uFEFFimport Widget from "./Widget";\r\n\r\n{literal} **bold**.\r\n';
    const documents = controller();
    const session = attach(
      documents,
      'opaque-source-owner',
      source,
      sourcePath ?? documentKey ?? 'note.mdx',
    );
    const ui = render(
      <ConnectedEditor
        documents={documents}
        session={session}
        documentKey={documentKey}
        sourcePath={sourcePath}
      />,
      { wrapper: NotificationProvider },
    );
    const editor = screen.getByRole('textbox', { name: 'Editable document' });
    expect(editor.querySelectorAll('.rendered-source-block')).toHaveLength(
      mdx ? 2 : 0,
    );
    if (mdx) {
      expect(editor.querySelector('pre code')).toHaveTextContent(
        'import Widget from "./Widget";',
      );
      expect(
        editor.querySelector(
          '.rendered-source-block span, span.rendered-source-block',
        ),
      ).toHaveTextContent('{literal}');
    } else {
      expect(editor.querySelector('p')).toHaveTextContent(
        'import Widget from "./Widget";',
      );
      expect(editor.querySelectorAll('p')[1]).toHaveTextContent(
        '{literal} bold.',
      );
    }
    expect(editor.querySelector('strong')).toHaveTextContent('bold');
    const cm = EditorView.findFromDOM(
      ui.container.querySelector('.cm-editor')!,
    )!;
    expect(rawSource(cm.state)).toBe(source);
    expect(session.witness.source).toBe(source);
    expect(session.witness.editorRevision).toBe(0);
  });
}

it('preserves one real history across Source/Preview and remounts of the same session', async () => {
  const source = '\uFEFF# Note\r\n\r\nBody.\r\n';
  const documents = controller();
  const session = attach(documents, 'same-session', source);
  const commands = createRef<EditorCommands>();
  const histories: RefObject<EditorHistory> = { current: new Map() };
  const draw = (active: boolean) => (
    <ConnectedEditor
      documents={documents}
      session={session}
      documentKey="opaque-history-id"
      sourcePath="notes/plain.md"
      active={active}
      commands={commands}
      histories={histories}
    />
  );
  const ui = render(draw(false), { wrapper: NotificationProvider });
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  act(() =>
    cm.dispatch({
      changes: { from: cm.state.doc.length, insert: 'Added.' },
      annotations: isolateHistory.of('full'),
    }),
  );
  await waitFor(() => expect(session.witness.source).toBe(source + 'Added.'));
  ui.rerender(draw(true));
  expect(
    EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!),
  ).toBe(cm);
  expect(undoDepth(cm.state)).toBe(1);
  act(() => commands.current!.undo());
  await waitFor(() => expect(session.witness.source).toBe(source));
  ui.rerender(draw(false));
  act(() => commands.current!.redo());
  await waitFor(() => expect(session.witness.source).toBe(source + 'Added.'));
  ui.unmount();
  expect(histories.current.has('same-session')).toBe(true);
  const reopened = render(draw(true), { wrapper: NotificationProvider });
  act(() => commands.current!.undo());
  await waitFor(() => expect(session.witness.source).toBe(source));
  expect(
    rawSource(
      EditorView.findFromDOM(reopened.container.querySelector('.cm-editor')!)!
        .state,
    ),
  ).toBe(source);
});

it('does not inherit retired history when the same logical file reopens under a fresh session', async () => {
  const source = '\uFEFF# Note\r\n\r\nBody.\r\n';
  const documents = controller();
  const old = attach(documents, 'retired-session', source);
  const histories: RefObject<EditorHistory> = { current: new Map() };
  const commands = createRef<EditorCommands>();
  const draw = (session: SourceSession) => (
    <ConnectedEditor
      documents={documents}
      session={session}
      documentKey="same-logical-document"
      sourcePath="notes/plain.md"
      commands={commands}
      histories={histories}
    />
  );
  const ui = render(draw(old), { wrapper: NotificationProvider });
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  act(() =>
    cm.dispatch({
      changes: { from: cm.state.doc.length, insert: 'Saved.' },
      annotations: isolateHistory.of('full'),
    }),
  );
  await waitFor(() => expect(old.witness.source).toBe(source + 'Saved.'));
  ui.unmount();
  await documents.close('retired-session');
  const fresh = attach(documents, 'fresh-session', source + 'Saved.');
  const reopened = render(draw(fresh), { wrapper: NotificationProvider });
  const newCM = EditorView.findFromDOM(
    reopened.container.querySelector('.cm-editor')!,
  )!;
  expect(histories.current.has('retired-session')).toBe(true);
  expect(undoDepth(newCM.state)).toBe(0);
  act(() => commands.current!.undo());
  expect(fresh.witness).toEqual({
    sessionId: 'fresh-session',
    editorRevision: 0,
    source: source + 'Saved.',
  });
  expect(rawSource(newCM.state)).toBe(source + 'Saved.');
});
