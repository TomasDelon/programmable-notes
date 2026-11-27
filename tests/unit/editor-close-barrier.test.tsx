import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef } from 'react';
import type {
  SourceSession,
  SourceBatch,
} from '../../src/editor/sourceWitness';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, expect, it } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import {
  SourceEditor,
  type EditorCommands,
  type EditorHistory,
} from '../../src/editor/SourceEditor';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';
import { NotificationProvider } from '../../src/ui/Notifications';

const geometry = ['getClientRects', 'getBoundingClientRect'].map(
  (key) =>
    [key, Object.getOwnPropertyDescriptor(Range.prototype, key)] as const,
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
  for (const [key, descriptor] of geometry) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

function fixture(
  rendered = false,
  source = '\uFEFF# Note\r\n\r\nBody.\r\n',
  options: {
    publish?: (
      batch: SourceBatch,
      original: SourceSession['publish'],
    ) => ReturnType<SourceSession['publish']>;
    retain?: () => Promise<void>;
    keep?: () => Promise<void>;
  } = {},
) {
  let revision = 0;
  const documents = new DocumentSessions(
    async () => ({ diskRevision: `disk-${++revision}`, durable: true }),
    async () => {},
  );
  const session = documents.attach({
    witness: { sessionId: 'close-owner', editorRevision: 0, source },
    logicalPath: 'note.mdx',
    diskRevision: 'disk-0',
  });
  const authority: SourceSession = {
    get witness() {
      return session.witness;
    },
    isCurrent: session.isCurrent,
    validate: session.validate,
    publish: (batch) =>
      options.publish
        ? options.publish(batch, session.publish)
        : session.publish(batch),
    retainFailure: session.retainFailure,
  };
  const commands = createRef<EditorCommands>();
  const histories = { current: new Map() as EditorHistory };
  function Editor() {
    const state = useDocumentSession(documents, 'close-owner')!;
    return (
      <SourceEditor
        source={state.witness.source}
        session={authority}
        documentKey="close-owner"
        sourcePath="note.mdx"
        commandsRef={commands}
        histories={histories}
        onChange={() => {}}
        onRetainAttempt={async (base, text, witness) => {
          if (!witness || witness.source !== base)
            throw Error('Missing captured witness.');
          session.retainFailure({ expected: witness, source: text });
          await options.retain?.();
        }}
        onKeepAttempt={options.keep}
        onPendingChange={(pending) =>
          documents.setUnapplied('close-owner', pending)
        }
        rendered={
          rendered
            ? {
                active: true,
                files: { 'note.mdx': state.witness.source },
                entry: 'note.mdx',
                theme: 'light',
                images: [],
                stopped: true,
                corePlugins: { react: false },
              }
            : undefined
        }
      />
    );
  }
  const mount = () => render(<Editor />, { wrapper: NotificationProvider });
  const ui = mount();
  const cm = () =>
    EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  return { ui, mount, commands, histories, documents, session, cm };
}

it.each([false, true])(
  'detaches clean views once, retires captured commands and restores immutable history (rendered=%s)',
  async (rendered) => {
    const f = fixture(rendered);
    const original = f.session.witness.source;
    const first = f.cm();
    act(() =>
      first.dispatch({
        changes: { from: first.state.doc.length, insert: 'Next.' },
        userEvent: 'input',
      }),
    );
    const edited = f.session.witness.source;
    await act(async () => {});
    const captured = f.commands.current!;
    act(() => expect(captured.detachIfClean?.()).toBe(true));
    expect(f.commands.current).toBeNull();
    act(() => {
      expect(captured.detachIfClean?.()).toBe(true);
      expect(captured.insertText('must not publish')).toBe(false);
      captured.undo();
      captured.redo();
      captured.revealSource(0, edited, f.session.witness);
      captured.formatRendered?.('bold');
    });
    expect(f.session.witness.source).toBe(edited);
    f.ui.unmount();
    f.mount();
    act(() => f.commands.current!.undo());
    expect(f.session.witness.source).toBe(original);
  },
);

it.each([false, true])(
  'refuses repeated same-stack raw DOM changes without consuming pending source (rendered=%s)',
  async (rendered) => {
    const f = fixture(rendered);
    const editor = rendered
      ? screen.getByRole('textbox', { name: 'Editable document' })
      : f.cm().contentDOM;
    const text = rendered
      ? editor.querySelector('p')!.firstChild!
      : editor.querySelector('.cm-line')!.firstChild!;
    const next = rendered ? 'Changed body.' : '# Changed';
    act(() => {
      text.textContent = next;
      expect(f.commands.current!.detachIfClean?.()).toBe(false);
      expect(f.commands.current!.detachIfClean?.()).toBe(false);
    });
    await waitFor(() =>
      expect(f.session.witness.source).toContain(next.replace(/^# /, '')),
    );
    await act(async () => {});
    act(() => expect(f.commands.current!.detachIfClean?.()).toBe(true));
  },
);

it.each([false, true])(
  'refuses active and just-ended composition before producer completion (rendered=%s)',
  (rendered) => {
    const f = fixture(rendered);
    const editor = rendered
      ? screen.getByRole('textbox', { name: 'Editable document' })
      : f.cm().contentDOM;
    fireEvent.compositionStart(editor);
    expect(f.commands.current!.detachIfClean?.()).toBe(false);
    fireEvent.compositionEnd(editor);
    expect(f.commands.current!.detachIfClean?.()).toBe(false);
    expect(editor.isConnected).toBe(true);
  },
);

it('refuses a rendered link draft synchronously and allows cancellation without losing the source', async () => {
  const f = fixture(true);
  const original = f.session.witness.source;
  act(() => {
    f.commands.current!.formatRendered!('link');
    expect(f.commands.current!.detachIfClean?.()).toBe(false);
  });
  fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  await act(async () => {});
  act(() => expect(f.commands.current!.detachIfClean?.()).toBe(true));
  expect(f.session.witness.source).toBe(original);
});

it('refuses synchronous publication and retains a failed publication without destroying its editor', () => {
  let duringPublish: boolean | undefined;
  const f: ReturnType<typeof fixture> = fixture(false, 'Body.', {
    publish: () => {
      duringPublish = f.commands.current!.detachIfClean!();
      throw Error('Rejected source publication.');
    },
  });
  const original = f.session.witness.source;
  const cm = f.cm();
  act(() =>
    cm.dispatch({
      changes: { from: cm.state.doc.length, insert: ' attempted' },
    }),
  );
  expect(duringPublish).toBe(false);
  expect(f.commands.current!.detachIfClean!()).toBe(false);
  expect(f.session.witness.source).toBe(original);
  expect(f.documents.state('close-owner').retainedFailures).toHaveLength(1);
  expect(cm.contentDOM.isConnected).toBe(true);
});

it('refuses retained text while its durable recovery or explicit Keep action is pending', async () => {
  let releaseRecovery!: () => void;
  let releaseKeep!: () => void;
  const source = '# Before\n\n{/* hidden */}\n\nAfter.\n';
  const f = fixture(true, source, {
    retain: () =>
      new Promise<void>((resolve) => {
        releaseRecovery = resolve;
      }),
    keep: () =>
      new Promise<void>((resolve) => {
        releaseKeep = resolve;
      }),
  });
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  fireEvent.keyDown(editor, { key: 'a', ctrlKey: true, code: 'KeyA' });
  fireEvent(
    editor,
    new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: 'Retained replacement.',
    }),
  );
  expect(f.commands.current!.detachIfClean!()).toBe(false);
  await waitFor(() => expect(releaseRecovery).toBeTypeOf('function'));
  fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
  expect(screen.getByText('Saving recovery copy…')).toBeVisible();
  expect(f.commands.current!.detachIfClean!()).toBe(false);
  await act(async () => releaseRecovery());
  fireEvent.click(
    screen.getByRole('button', {
      name: 'Keep recovery copy and continue',
    }),
  );
  await waitFor(() => expect(releaseKeep).toBeTypeOf('function'));
  expect(f.commands.current!.detachIfClean!()).toBe(false);
  expect(f.session.witness.source).toBe(source);
  await act(async () => releaseKeep());
});
