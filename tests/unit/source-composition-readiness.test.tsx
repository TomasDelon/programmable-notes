import { act, fireEvent, render } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';
import { useDocumentSession } from '../../src/workspace/useDocumentSession';
import { NotificationProvider } from '../../src/ui/Notifications';

const original = '\uFEFFBase\r\n';
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
  vi.useRealTimers();
  for (const [key, descriptor] of geometry) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});
async function settle() {
  await act(async () => {
    await vi.advanceTimersByTimeAsync(100);
  });
}
function setup() {
  const writer = vi.fn(async () => ({
    diskRevision: 'written',
    durable: true,
  }));
  const documents = new DocumentSessions(writer, async () => {});
  const session = documents.attach({
    witness: { sessionId: 'a', editorRevision: 0, source: original },
    logicalPath: 'a.mdx',
    diskRevision: 'disk-0',
  });
  const reports: { pending: boolean; source: string }[] = [];
  let preview = false;
  function Editor() {
    const state = useDocumentSession(documents, 'a')!;
    return (
      <SourceEditor
        source={state.witness.source}
        session={session}
        onChange={() => {}}
        onPendingChange={(pending) => {
          reports.push({ pending, source: session.witness.source });
          documents.setUnapplied('a', pending);
        }}
        rendered={
          preview
            ? {
                active: false,
                files: { 'a.mdx': state.witness.source },
                entry: 'a.mdx',
                theme: 'light',
                images: [],
                stopped: true,
              }
            : undefined
        }
      />
    );
  }
  const ui = render(<Editor />, { wrapper: NotificationProvider });
  const editor = EditorView.findFromDOM(
    ui.container.querySelector('.cm-editor')!,
  )!;
  return {
    ui,
    editor,
    documents,
    session,
    reports,
    writer,
    preview(value: boolean) {
      preview = value;
      ui.rerender(<Editor />);
    },
  };
}

describe('Source composition readiness for external adoption', () => {
  it('reserves ordinary native DOM input before its mutation becomes canonical source', async () => {
    const h = setup();
    fireEvent(
      h.editor.contentDOM,
      new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: '追加',
      }),
    );
    expect(h.documents.state('a').unapplied).toBe(true);
    const observation = h.documents.reserveObservation('a');
    await observation.settled();
    expect(() =>
      observation.adopt(h.session.witness, 'disk-0', {
        source: 'Disk',
        diskRevision: 'external',
      }),
    ).toThrow();
    act(() => {
      const text = document.createTextNode('\uFEFFBase追加');
      h.editor.contentDOM.querySelector('.cm-line')!.replaceChildren(text);
      getSelection()!.collapse(text, text.length);
      fireEvent.input(h.editor.contentDOM, {
        inputType: 'insertText',
        data: '追加',
      });
    });
    await settle();
    expect(h.documents.state('a').unapplied).toBe(false);
    expect(h.session.witness.source).toBe('\uFEFFBase追加\r\n');
    observation.release();
    await h.documents.flush();
    expect(h.writer).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: 'disk-0',
      source: '\uFEFFBase追加\r\n',
    });
  });
  it('keeps Source composition pending when another surface mounts and retires its empty draft state', async () => {
    const h = setup();
    fireEvent.compositionStart(h.editor.contentDOM);
    h.preview(true);
    expect(h.documents.state('a').unapplied).toBe(true);
    h.preview(false);
    expect(h.documents.state('a').unapplied).toBe(true);
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
    fireEvent.compositionEnd(h.editor.contentDOM);
    await settle();
    expect(h.documents.state('a').unapplied).toBe(false);
  });
  it('reports composition ownership without a text change and holds adoption until the editor settles', async () => {
    const h = setup();
    fireEvent.compositionStart(h.editor.contentDOM);
    expect(h.documents.state('a').unapplied).toBe(true);
    const observation = h.documents.reserveObservation('a');
    await observation.settled();
    expect(() =>
      observation.adopt(h.session.witness, 'disk-0', {
        source: 'Disk',
        diskRevision: 'external',
      }),
    ).toThrow();
    fireEvent.compositionEnd(h.editor.contentDOM);
    expect(h.documents.state('a').unapplied).toBe(true);
    await settle();
    expect(h.documents.state('a').unapplied).toBe(false);
    await act(async () => {
      observation.adopt(h.session.witness, 'disk-0', {
        source: 'Disk',
        diskRevision: 'external',
      });
      observation.release();
      await h.documents.flush();
    });
    expect(rawSource(h.editor.state)).toBe('Disk');
    expect(h.writer).not.toHaveBeenCalled();
  });

  for (const endFirst of [false, true])
    it(`reports ready only after the actual final DOM input is accepted (end first: ${endFirst})`, async () => {
      const h = setup();
      const expected = '\uFEFF確定🌱\r\n';
      h.reports.length = 0;
      fireEvent.compositionStart(h.editor.contentDOM);
      expect(h.documents.state('a').unapplied).toBe(true);
      act(() => {
        if (endFirst) fireEvent.compositionEnd(h.editor.contentDOM);
        const line = h.editor.contentDOM.querySelector('.cm-line')!;
        const text = document.createTextNode('\uFEFF確定🌱');
        line.replaceChildren(text);
        getSelection()!.collapse(text, text.length);
        fireEvent.input(h.editor.contentDOM, {
          inputType: 'insertCompositionText',
          isComposing: !endFirst,
          data: '確定🌱',
        });
        if (!endFirst) fireEvent.compositionEnd(h.editor.contentDOM);
      });
      expect(h.documents.state('a').unapplied).toBe(true);
      await settle();
      expect(h.session.witness.source).toBe(expected);
      expect(rawSource(h.editor.state)).toBe(expected);
      expect(h.documents.state('a').unapplied).toBe(false);
      expect(h.reports.some(({ pending }) => !pending)).toBe(true);
      expect(
        h.reports
          .filter(({ pending }) => !pending)
          .every(({ source }) => source === expected),
      ).toBe(true);
      await h.documents.flush();
      expect(h.writer).toHaveBeenCalledWith({
        documentId: 'a',
        expectedDiskRevision: 'disk-0',
        source: expected,
      });
    });

  it('defers an external surface replacement and rechecks that same source after composition ends', async () => {
    const changed = vi.fn();
    const draw = (source: string) => (
      <SourceEditor source={source} onChange={changed} />
    );
    const ui = render(draw('Before'), { wrapper: NotificationProvider });
    const editor = EditorView.findFromDOM(
      ui.container.querySelector('.cm-editor')!,
    )!;
    fireEvent.compositionStart(editor.contentDOM);
    ui.rerender(draw('Disk'));
    expect(rawSource(editor.state)).toBe('Before');
    fireEvent.compositionEnd(editor.contentDOM);
    await settle();
    expect(rawSource(editor.state)).toBe('Disk');
    expect(changed).not.toHaveBeenCalled();
  });

  it('does not clear readiness through a retired surface after its pending end callback', async () => {
    const h = setup();
    fireEvent.compositionStart(h.editor.contentDOM);
    expect(h.documents.state('a').unapplied).toBe(true);
    fireEvent.compositionEnd(h.editor.contentDOM);
    h.ui.unmount();
    const reports = h.reports.length;
    await settle();
    expect(h.reports).toHaveLength(reports);
    expect(h.documents.state('a').unapplied).toBe(true);
  });
});
