import { vi } from 'vitest';

// The pinned ProseMirror detector runs at module import. Set the actual browser
// globals first, then exercise its production event/observer code unchanged.
const profile = vi.hoisted(() => {
  const values = {
    vendor: 'Apple Computer, Inc.',
    userAgent:
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Safari/605.1.15',
    platform: 'Linux x86_64',
    maxTouchPoints: 0,
  };
  const descriptors = Object.entries(values).map(([key, value]) => {
    const descriptor = Object.getOwnPropertyDescriptor(navigator, key);
    Object.defineProperty(navigator, key, { configurable: true, value });
    return [key, descriptor] as const;
  });
  return { descriptors };
});

import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { afterAll, afterEach, beforeEach, expect, it } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import {
  SourceEditor,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';
import { NotificationProvider } from '../../src/ui/Notifications';

const geometry = ['getClientRects', 'getBoundingClientRect'].map(
  (key) =>
    [key, Object.getOwnPropertyDescriptor(Range.prototype, key)] as const,
);
beforeEach(() => {
  vi.useFakeTimers({
    toFake: [
      'setTimeout',
      'clearTimeout',
      'requestAnimationFrame',
      'cancelAnimationFrame',
      'Date',
    ],
  });
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
  vi.restoreAllMocks();
  vi.useRealTimers();
  for (const [key, descriptor] of geometry) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});
afterAll(() => {
  for (const [key, descriptor] of profile.descriptors) {
    if (descriptor) Object.defineProperty(navigator, key, descriptor);
    else Reflect.deleteProperty(navigator, key);
  }
});

const original =
  '\uFEFF# Before\r\n\r\n| Left | Right |\r\n| --- | --- |\r\n| seed | untouched |\r\n\r\n{/* opaque sibling */}\r\n\r\nAfter.\r\n';
function fixture() {
  const documents = new DocumentSessions(
    async () => ({ diskRevision: 'disk-1', durable: true }),
    async () => {},
  );
  const session = documents.attach({
    witness: { sessionId: 'safari-table', editorRevision: 0, source: original },
    logicalPath: 'note.mdx',
    diskRevision: 'disk-0',
  });
  const commands = createRef<EditorCommands>();
  function Editor() {
    const state = useDocumentSession(documents, 'safari-table')!;
    return (
      <SourceEditor
        source={state.witness.source}
        session={session}
        documentKey="safari-table"
        sourcePath="note.mdx"
        commandsRef={commands}
        onChange={() => {}}
        onPendingChange={(pending) =>
          documents.setUnapplied('safari-table', pending)
        }
        rendered={{
          active: true,
          files: { 'note.mdx': state.witness.source },
          entry: 'note.mdx',
          theme: 'light',
          images: [],
          stopped: true,
          corePlugins: { react: false },
        }}
      />
    );
  }
  const ui = render(<Editor />, { wrapper: NotificationProvider });
  const editable = screen.getByRole('textbox', { name: 'Editable document' });
  const cell = editable.querySelector('tbody tr:last-child td')!;
  const paragraph = cell.querySelector('p')!;
  const text = paragraph.firstChild!;
  const row = cell.parentElement!;
  return { documents, session, commands, editable, text, row, ui };
}

it.each([false, true])(
  'preserves an atomic table composition with Safari detection and a finalizer before20ms (TR mutation=%s)',
  async (mutateRow) => {
    expect(navigator.vendor).toBe('Apple Computer, Inc.');
    const f = fixture();
    f.editable.focus();
    const selection = window.getSelection()!;
    selection.collapse(f.text, 0);
    fireEvent.compositionStart(f.editable);
    await act(async () => {
      await Promise.resolve();
    });
    const timeout = vi.spyOn(window, 'setTimeout');
    const clear = vi.spyOn(window, 'clearTimeout');
    const mutationStartedAt = Date.now();
    act(() => {
      f.text.textContent = 'seéd';
      if (mutateRow) {
        const transient = document.createElement('br');
        f.row.appendChild(transient);
        f.row.removeChild(transient);
      }
    });
    await act(async () => {
      await Promise.resolve();
    });
    const deferredReads = timeout.mock.calls.flatMap((call, index) =>
      call[1] === 20 ? [timeout.mock.results[index]!.value] : [],
    );
    // Before compositionend, only the real Safari TR-mutation observer schedules
    // this deferred read. The ordinary character-data control flushes immediately.
    expect(deferredReads).toHaveLength(mutateRow ? 1 : 0);
    expect(f.session.witness.source).toBe(original);
    expect(f.documents.state('safari-table').unapplied).toBe(true);
    act(() => {
      expect(f.commands.current!.detachIfClean!()).toBe(false);
      fireEvent.compositionEnd(f.editable);
      expect(f.commands.current!.detachIfClean!()).toBe(false);
      expect(f.commands.current!.detachIfClean!()).toBe(false);
    });
    if (mutateRow)
      expect(
        clear.mock.calls.some(([handle]) => handle === deferredReads[0]),
      ).toBe(true);
    expect(f.session.witness.source).toBe(original);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(16);
    });
    expect(Date.now() - mutationStartedAt).toBe(16);
    const expected = original.replace('| seed |', '| seéd |');
    expect(f.session.witness.source).toBe(expected);
    expect(f.documents.state('safari-table').unapplied).toBe(false);
    act(() => f.commands.current!.undo());
    expect(f.session.witness.source).toBe(original);
    act(() => f.commands.current!.redo());
    expect(f.session.witness.source).toBe(expected);
    await act(async () => {
      await Promise.resolve();
    });
    act(() => expect(f.commands.current!.detachIfClean!()).toBe(true));
    expect(f.editable.isConnected).toBe(false);
    await act(async () => {
      await vi.advanceTimersByTimeAsync(4);
    });
    expect(f.session.witness.source).toBe(expected);
    expect(f.documents.state('safari-table').retainedFailures).toEqual([]);
  },
);
