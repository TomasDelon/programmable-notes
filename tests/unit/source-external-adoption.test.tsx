import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { undo } from '@codemirror/commands';
import { createRef } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { DocumentSessions } from '../../src/application/documentSessions';
import {
  SourceEditor,
  type EditorHistory,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';
import { NotificationProvider } from '../../src/ui/Notifications';

const original = '\uFEFF# Title\r\n\r\nKeep 🌱 this selection.\nLast.\r\n';
const descriptors = ['getClientRects', 'getBoundingClientRect'].map(
  (name) =>
    [name, Object.getOwnPropertyDescriptor(Range.prototype, name)] as const,
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
  for (const [name, descriptor] of descriptors) {
    if (descriptor) Object.defineProperty(Range.prototype, name, descriptor);
    else Reflect.deleteProperty(Range.prototype, name);
  }
});
function setup(source = original) {
  let revision = 0;
  const write = vi.fn(async () => ({
    diskRevision: `written-${++revision}`,
    durable: true,
  }));
  const controller = new DocumentSessions(write, async () => {});
  const session = controller.attach({
    witness: { sessionId: 'a', editorRevision: 0, source },
    logicalPath: 'a.mdx',
    diskRevision: 'disk-0',
  });
  const histories: { current: EditorHistory } = { current: new Map() };
  const commands = createRef<EditorCommands>();
  const draw = (preview = false) => (
    <SourceEditor
      source={session.witness.source}
      session={session}
      histories={histories}
      commandsRef={commands}
      onChange={() => {}}
      onPendingChange={(pending) => controller.setUnapplied('a', pending)}
      rendered={
        preview
          ? {
              active: true,
              files: { 'note.mdx': session.witness.source },
              entry: 'note.mdx',
              theme: 'light',
              images: [],
              stopped: true,
            }
          : undefined
      }
    />
  );
  const ui = render(draw(), { wrapper: NotificationProvider });
  const editor = EditorView.findFromDOM(
    ui.container.querySelector('.cm-editor')!,
  )!;
  const adopt = async (source: string) => {
    const reservation = controller.reserveObservation('a');
    await reservation.settled();
    act(() => {
      reservation.adopt(
        session.witness,
        controller.state('a').autosave.diskRevision,
        { source, diskRevision: 'external-1' },
      );
    });
    reservation.release();
  };
  return {
    controller,
    session,
    histories,
    write,
    ui,
    editor,
    commands,
    draw,
    adopt,
  };
}

describe('external source in the owning EditorView', () => {
  it('reports passive readiness without detaching and refuses a same-stack Source mutation', async () => {
    const h = setup();
    await waitFor(() =>
      expect(h.commands.current?.canAdoptExternal?.()).toBe(true),
    );
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
    act(() => {
      h.editor.contentDOM
        .querySelector('.cm-line')!
        .append(document.createTextNode('Pending'));
      expect(h.commands.current?.canAdoptExternal?.()).toBe(false);
    });
    await waitFor(() =>
      expect(h.commands.current?.canAdoptExternal?.()).toBe(true),
    );
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
  });
  it('includes the owning Preview composition guard without detaching either view', async () => {
    const h = setup();
    h.ui.rerender(h.draw(true));
    await waitFor(() =>
      expect(h.commands.current?.canAdoptExternal?.()).toBe(true),
    );
    const preview = h.ui.getByRole('textbox', { name: 'Editable document' });
    act(() => {
      preview.dispatchEvent(
        new CompositionEvent('compositionstart', { bubbles: true }),
      );
      expect(h.controller.state('a').unapplied).toBe(true);
      expect(h.commands.current?.canAdoptExternal?.()).toBe(false);
    });
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
    fireEvent.compositionEnd(preview);
  });
  it('includes pending Preview DOM records before they become canonical input', async () => {
    const h = setup();
    h.ui.rerender(h.draw(true));
    await waitFor(() =>
      expect(h.commands.current?.canAdoptExternal?.()).toBe(true),
    );
    const preview = h.ui.getByRole('textbox', { name: 'Editable document' });
    await act(async () => {
      preview.querySelector('p')!.append(document.createTextNode('Pending'));
      expect(h.controller.state('a').unapplied).toBe(false);
      expect(h.commands.current?.canAdoptExternal?.()).toBe(false);
      await Promise.resolve();
    });
    h.ui.rerender(h.draw(true));
    await waitFor(() =>
      expect(h.commands.current?.canAdoptExternal?.()).toBe(true),
    );
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
  });
  it('maps an unaffected selection without replacing the view, losing focus or echoing a save', async () => {
    const h = setup();
    const anchor = h.editor.state.doc.toString().indexOf('this');
    act(() => {
      h.editor.dispatch({ selection: { anchor, head: anchor + 4 } });
      h.editor.focus();
    });
    const external = original.replace('Last.', 'Last changed.');
    await h.adopt(external);
    h.ui.rerender(h.draw());
    expect(
      EditorView.findFromDOM(h.ui.container.querySelector('.cm-editor')!),
    ).toBe(h.editor);
    expect(rawSource(h.editor.state)).toBe(external);
    expect(h.editor.state.selection.main.anchor).toBe(anchor);
    expect(h.editor.state.selection.main.head).toBe(anchor + 4);
    expect(document.activeElement).toBe(h.editor.contentDOM);
    await h.controller.flush();
    expect(h.write).not.toHaveBeenCalled();
  });

  it('retains a physical-ending-only adoption as an undoable checkpoint without moving the caret', async () => {
    const h = setup();
    const anchor = h.editor.state.doc.toString().indexOf('Keep');
    act(() => h.editor.dispatch({ selection: { anchor } }));
    const external = original.replaceAll('\r\n', '\n');
    await h.adopt(external);
    h.ui.rerender(h.draw());
    expect(rawSource(h.editor.state)).toBe(external);
    expect(h.editor.state.selection.main.anchor).toBe(anchor);
    act(() => {
      expect(undo(h.editor)).toBe(true);
    });
    expect(rawSource(h.editor.state)).toBe(original);
    expect(h.session.witness.source).toBe(original);
    await h.controller.flush();
    expect(h.write).toHaveBeenCalledExactlyOnceWith({
      documentId: 'a',
      expectedDiskRevision: 'external-1',
      source: original,
    });
  });

  it('restores real cached history through background adoption, keeping both the external checkpoint and earlier local undo', async () => {
    const h = setup();
    act(() =>
      h.editor.dispatch({
        changes: { from: h.editor.state.doc.length, insert: 'Local' },
        userEvent: 'input.type',
      }),
    );
    await h.controller.flush();
    const local = h.session.witness.source;
    h.ui.unmount();
    expect(h.histories.current!.get('a')?.source).toBe(local);
    const external = local.replace('# Title', '# External');
    await h.adopt(external);
    const reopened = render(h.draw(), { wrapper: NotificationProvider });
    const editor = EditorView.findFromDOM(
      reopened.container.querySelector('.cm-editor')!,
    )!;
    expect(rawSource(editor.state)).toBe(external);
    expect(h.write).toHaveBeenCalledTimes(1);
    act(() => {
      expect(undo(editor)).toBe(true);
    });
    expect(rawSource(editor.state)).toBe(local);
    expect(h.session.witness.source).toBe(local);
    act(() => {
      expect(undo(editor)).toBe(true);
    });
    expect(rawSource(editor.state)).toBe(original);
    expect(h.session.witness.source).toBe(original);
    await h.controller.flush();
  });
});
