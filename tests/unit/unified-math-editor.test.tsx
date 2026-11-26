import { EditorView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { act, fireEvent, render, waitFor } from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { RenderedEditor } from '../../src/editor/rendered/RenderedEditor';
import { NotificationProvider } from '../../src/ui/Notifications';

vi.mock('../../src/editor/rendered/RenderedRuntime', () => ({
  RenderedRuntime: () => null,
}));

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
function mount(source: string) {
  const props: ComponentProps<typeof RenderedEditor> = {
    source,
    path: 'note.mdx',
    active: true,
    disabled: false,
    commandsRef: createRef(),
    runtime: {
      files: { 'note.mdx': source },
      entry: 'note.mdx',
      theme: 'light',
      images: [],
      stopped: true,
    },
    wikilinks: [],
    apply: vi.fn(() => true),
    undo: vi.fn(),
    redo: vi.fn(),
    openSource: vi.fn(),
    onPendingChange: vi.fn(),
  };
  const mounted = render(
    <NotificationProvider>
      <RenderedEditor {...props} />
    </NotificationProvider>,
  );
  return {
    ...mounted,
    props,
    editor: mounted.container.querySelector<HTMLElement>('.ProseMirror')!,
  };
}
async function replaceNative(
  element: HTMLElement,
  text: string,
  caret = text.length,
) {
  await act(async () => {
    element.textContent = text;
    const selection = element.ownerDocument.getSelection()!;
    selection.collapse(
      element.firstChild ?? element,
      Math.min(caret, text.length),
    );
    element.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
    );
    await Promise.resolve();
  });
}
function reveal(editor: HTMLElement) {
  const host = editor.querySelector<HTMLElement>('.rendered-math-host')!;
  fireEvent.mouseDown(host.querySelector('.rendered-math-render')!, {
    button: 0,
  });
  return host.querySelector<HTMLElement>('.rendered-math-source')!;
}

describe('mathematics shares the document text editor', () => {
  it.each([
    'undo',
    'delete/reinsert',
    'external',
    'repeated',
    'history-collision',
    'live-budget',
  ] as const)(
    'preserves owned dollar provenance through %s without guessing Source escapes',
    (mode) => {
      const captured: EditorView[] = [];
      const setProps = EditorView.prototype.setProps;
      const capture = vi
        .spyOn(EditorView.prototype, 'setProps')
        .mockImplementation(function (this: EditorView, props) {
          captured.push(this);
          setProps.call(this, props);
        });
      const mounted = mount(
        mode === 'repeated' || mode === 'history-collision'
          ? '\\$xTail.'
          : 'Tail.',
      );
      capture.mockRestore();
      const view = captured[0]!;
      function type(text: string) {
        act(() => {
          const { from, to } = view.state.selection;
          let handled = false;
          view.someProp(
            'handleTextInput',
            (handler) =>
              (handled = !!handler(view, from, to, text, () =>
                view.state.tr.insertText(text),
              )),
          );
          if (!handled) view.dispatch(view.state.tr.insertText(text));
        });
      }
      if (mode !== 'history-collision') type('$');
      if (mode !== 'repeated' && mode !== 'history-collision') type('x');
      if (mode === 'live-budget')
        for (let index = 0; index < 33; index++) type('y');
      if (mode === 'live-budget') {
        // Exhausting history witnesses must not affect direct live ownership.
      } else if (mode === 'history-collision') {
        act(() => view.dispatch(view.state.tr.delete(1, 2)));
        act(() =>
          view.dispatch(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
          ),
        );
        type('$');
        const revisions = ['xTail.', '\\$xTail.'];
        mounted.props.undo = vi.fn(() =>
          mounted.rerender(
            <NotificationProvider>
              <RenderedEditor {...mounted.props} source={revisions.shift()!} />
            </NotificationProvider>,
          ),
        );
        mounted.rerender(
          <NotificationProvider>
            <RenderedEditor {...mounted.props} />
          </NotificationProvider>,
        );
        fireEvent.keyDown(mounted.editor, {
          key: 'z',
          code: 'KeyZ',
          ctrlKey: true,
        });
        fireEvent.keyDown(mounted.editor, {
          key: 'z',
          code: 'KeyZ',
          ctrlKey: true,
        });
      } else if (mode === 'repeated') {
        act(() => view.dispatch(view.state.tr.delete(1, 2)));
        expect(view.state.doc.textContent).toBe('$xTail.');
        expect(vi.mocked(mounted.props.apply).mock.calls.at(-1)?.[1]).toBe(
          '\\$xTail.',
        );
      } else if (mode === 'delete/reinsert') {
        act(() => view.dispatch(view.state.tr.delete(1, 2)));
        act(() =>
          view.dispatch(
            view.state.tr.setSelection(TextSelection.create(view.state.doc, 1)),
          ),
        );
        type('$');
      } else {
        act(() => view.dispatch(view.state.tr.delete(2, 3)));
        const restore = () =>
          mounted.rerender(
            <NotificationProvider>
              <RenderedEditor {...mounted.props} source={'\\$xTail.'} />
            </NotificationProvider>,
          );
        mounted.props.undo = vi.fn(restore);
        mounted.rerender(
          <NotificationProvider>
            <RenderedEditor {...mounted.props} />
          </NotificationProvider>,
        );
        if (mode === 'undo')
          fireEvent.keyDown(mounted.editor, {
            key: 'z',
            code: 'KeyZ',
            ctrlKey: true,
          });
        else restore();
      }
      act(() =>
        view.dispatch(
          view.state.tr.setSelection(
            TextSelection.create(
              view.state.doc,
              mode === 'live-budget' ? 36 : 3,
            ),
          ),
        ),
      );
      type('$');
      expect(vi.mocked(mounted.props.apply).mock.calls.at(-1)?.[1]).toBe(
        mode === 'external' ||
          mode === 'repeated' ||
          mode === 'history-collision'
          ? '\\$x\\$Tail.'
          : mode === 'live-budget'
            ? '$x' + 'y'.repeat(33) + '$Tail.'
            : '$x$Tail.',
      );
    },
  );
  it('escapes a newly typed pending dollar without revealing neighboring bold and promotes only the completed pair', () => {
    const original = 'Before **bold** tail.';
    const captured: EditorView[] = [];
    const originalSetProps = EditorView.prototype.setProps;
    const capture = vi
      .spyOn(EditorView.prototype, 'setProps')
      .mockImplementation(function (this: EditorView, props) {
        captured.push(this);
        originalSetProps.call(this, props);
      });
    const { editor, props } = mount(original);
    capture.mockRestore();
    const view = captured[0]!;
    function type(text: string) {
      act(() => {
        const { from, to } = view.state.selection;
        let handled = false;
        view.someProp(
          'handleTextInput',
          (handler) =>
            (handled = !!handler(view, from, to, text, () =>
              view.state.tr.insertText(text),
            )),
        );
        if (!handled) view.dispatch(view.state.tr.insertText(text));
      });
    }
    act(() =>
      view.dispatch(
        view.state.tr.setSelection(TextSelection.create(view.state.doc, 8)),
      ),
    );
    type('$');
    expect(props.apply).toHaveBeenLastCalledWith(
      original,
      'Before \\$**bold** tail.',
      true,
    );
    expect(editor.querySelector('strong')?.textContent).toBe('bold');
    expect(editor.querySelector('.rendered-math-host')).toBeNull();
    type('x');
    type('$');
    expect(props.apply).toHaveBeenLastCalledWith(
      'Before \\$x**bold** tail.',
      'Before $x$**bold** tail.',
      true,
    );
    expect(editor.querySelector('.rendered-math-source')?.textContent).toBe(
      '$x$',
    );
    expect(editor.querySelector('strong')?.textContent).toBe('bold');
  });
  it.each([
    { input: '$x$', canonical: '$x$', math: true },
    { input: '$$x$$', canonical: '$$x$$', math: true },
    {
      input: '$$\nx^2\n$$',
      canonical: '$$\n\nx^2\n\n$$',
      math: true,
      initial: '',
    },
    {
      input: '$\\unknowncommand$',
      canonical: '$\\unknowncommand$',
      math: true,
    },
    { input: '$$', canonical: '\\$\\$', math: false },
    { input: '$ $', canonical: '\\$ \\$', math: false },
    {
      input: '$<Unsafe />',
      canonical: '\\$\\<Unsafe /\\>',
      math: false,
      whole: true,
    },
  ])(
    'completes only nonempty owned delimiters: $input',
    ({ input, canonical, math, whole, initial = 'Tail.' }) => {
      const captured: EditorView[] = [];
      const setProps = EditorView.prototype.setProps;
      const capture = vi
        .spyOn(EditorView.prototype, 'setProps')
        .mockImplementation(function (this: EditorView, props) {
          captured.push(this);
          setProps.call(this, props);
        });
      const { editor, props } = mount(initial);
      capture.mockRestore();
      const view = captured[0]!;
      for (const character of whole ? [input] : [...input])
        act(() => {
          if (character === '\n') {
            fireEvent.keyDown(editor, {
              key: 'Enter',
              code: 'Enter',
              keyCode: 13,
            });
            return;
          }
          const { from, to } = view.state.selection;
          let handled = false;
          view.someProp(
            'handleTextInput',
            (handler) =>
              (handled = !!handler(view, from, to, character, () =>
                view.state.tr.insertText(character),
              )),
          );
          if (!handled) view.dispatch(view.state.tr.insertText(character));
        });
      expect(vi.mocked(props.apply).mock.calls.at(-1)?.[1]).toBe(
        canonical + initial,
      );
      expect(Boolean(editor.querySelector('.rendered-math-host'))).toBe(math);
      if (input.includes('unknowncommand'))
        expect(editor.querySelector('.rendered-math-invalid')).not.toBeNull();
      expect(editor.querySelector('input, textarea, .cm-editor')).toBeNull();
    },
  );

  it('reveals editable child text without nested fields or tab stops', () => {
    const { editor, props } = mount('Before $x$ after.');
    const source = reveal(editor);
    expect(source.hidden).toBe(false);
    expect(source.textContent).toBe('$x$');
    expect(
      editor.querySelector(
        '.cm-editor, input, textarea, [role="button"], [tabindex]',
      ),
    ).toBeNull();
    expect(editor.ownerDocument.activeElement).toBe(editor);
    expect(props.apply).not.toHaveBeenCalled();
  });

  it('keeps rendered mathematics DOM stable when only unrelated text selection changes', async () => {
    const { editor, props } = mount('Before $x$ after.');
    const rendered = editor.querySelector('.katex');
    expect(rendered).not.toBeNull();
    await act(async () => {
      editor.focus();
      const tail = editor.querySelector('p')!.lastChild!;
      document.getSelection()!.collapse(tail, 2);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    expect(editor.querySelector('.katex')).toBe(rendered);
    expect(props.apply).not.toHaveBeenCalled();
  });

  it.each(['x$', '$x'])(
    'removing a delimiter projects %s into ordinary editable text',
    async (raw) => {
      const original =
        '\uFEFFexport const keep = 1\r\n\r\nBefore $x$ after.\r\n\r\n<Counter />\r\n';
      const { editor, props } = mount(original);
      await replaceNative(reveal(editor), raw);
      await waitFor(() =>
        expect(props.apply).toHaveBeenLastCalledWith(
          original,
          original.replace('$x$', raw),
          true,
        ),
      );
      expect(editor.querySelector('.rendered-math-host')).toBeNull();
      expect(editor.textContent).toContain('Before ' + raw + ' after.');
      expect(document.querySelector('[role="alert"]')).toBeNull();
    },
  );

  it('keeps the same math source DOM through a delimiter-changing IME composition', async () => {
    const original = 'Before $x$ after.';
    const { editor, props } = mount(original);
    const source = reveal(editor);
    fireEvent.compositionStart(editor);
    expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
    await replaceNative(source, '$x');
    expect(source.isConnected).toBe(true);
    expect(props.apply).not.toHaveBeenCalled();
    await replaceNative(source, '$x_{你}$');
    fireEvent.compositionEnd(editor, { data: '你' });
    await waitFor(() =>
      expect(props.apply).toHaveBeenLastCalledWith(
        original,
        'Before $x_{你}$ after.',
        true,
        'start',
      ),
    );
    expect(editor.textContent).toContain('Before ');
    await waitFor(() =>
      expect(props.onPendingChange).toHaveBeenLastCalledWith(false),
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('refuses an IME result against an external revision and retains the composed source', async () => {
    const original = 'Before $x$ after.';
    const mounted = mount(original);
    const source = reveal(mounted.editor);
    fireEvent.compositionStart(mounted.editor);
    await replaceNative(source, '$x_{你}$');
    const external = 'External revision.';
    vi.mocked(mounted.props.apply).mockReturnValue(false);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} source={external} />
      </NotificationProvider>,
    );
    expect(source.isConnected).toBe(true);
    fireEvent.compositionEnd(mounted.editor, { data: '你' });
    await waitFor(() =>
      expect(mounted.props.apply).toHaveBeenLastCalledWith(
        original,
        'Before $x_{你}$ after.',
        true,
        'start',
      ),
    );
    await waitFor(() =>
      expect(document.querySelector('[role="alert"]')).not.toBeNull(),
    );
    expect(mounted.editor.textContent).toContain(external);
  });

  it('keeps the accepted final prose visible while awaiting the host source echo', async () => {
    const { editor, props } = mount('Original prose.');
    const paragraph = editor.querySelector('p')!;
    editor.focus();
    fireEvent.compositionStart(editor);
    await replaceNative(paragraph, 'Original中 prose.', 9);
    expect(props.apply).not.toHaveBeenCalled();
    await replaceNative(paragraph, 'Original中文 prose.', 10);
    fireEvent.compositionEnd(editor, { data: '中文' });
    await waitFor(() =>
      expect(props.onPendingChange).toHaveBeenLastCalledWith(false),
    );
    expect(props.apply).toHaveBeenCalledExactlyOnceWith(
      'Original prose.',
      'Original中文 prose.',
      true,
      'start',
    );
    expect(editor.querySelector('p')).toHaveTextContent('Original中文 prose.');
  });

  it('retains the complete final prose composition when a conflict locks its original revision', async () => {
    const original =
      '\uFEFFexport const preserved = 1\r\n\r\nOrdinary prose.\r\n\r\n<Counter />\n';
    const mounted = mount(original);
    const retain = vi.fn(async () => {});
    const paragraph = mounted.editor.querySelector('p')!;
    act(() => {
      mounted.editor.focus();
      document.getSelection()!.collapse(paragraph.firstChild!, 8);
      document.dispatchEvent(new Event('selectionchange'));
    });
    fireEvent.compositionStart(mounted.editor);
    await replaceNative(paragraph, 'Ordinary中 prose.', 9);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} disabled onRetainAttempt={retain} />
      </NotificationProvider>,
    );
    const historyInputs = ['historyUndo', 'historyRedo'].map((inputType) => {
      const history = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType,
      });
      fireEvent(mounted.editor, history);
      return history;
    });
    await replaceNative(paragraph, 'Ordinary中文 prose.', 10);
    fireEvent.compositionEnd(mounted.editor, { data: '中文' });
    await waitFor(() =>
      expect(retain).toHaveBeenCalledWith(
        original,
        original.replace('Ordinary', 'Ordinary中文'),
      ),
    );
    expect(mounted.props.apply).not.toHaveBeenCalled();
    expect(mounted.props.undo).not.toHaveBeenCalled();
    expect(mounted.props.redo).not.toHaveBeenCalled();
    expect(historyInputs.every((event) => event.defaultPrevented)).toBe(true);
    expect(mounted.editor.querySelector('p')).toHaveTextContent(
      'Ordinary prose.',
    );
    expect(mounted.props.onPendingChange).toHaveBeenLastCalledWith(true);
  });

  it('retains only the ended composition when a lock arrives before the next composition starts', async () => {
    const original =
      '\uFEFFexport const keep = 1\r\n\r\nRecord.\r\n\r\n<Counter />\n';
    const mounted = mount(original);
    const retain = vi.fn(async () => {});
    mounted.editor.focus();
    fireEvent.compositionStart(mounted.editor);
    await replaceNative(mounted.editor.querySelector('p')!, 'Record中.');
    fireEvent.compositionEnd(mounted.editor, { data: '中' });
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} disabled onRetainAttempt={retain} />
      </NotificationProvider>,
    );
    fireEvent.compositionStart(mounted.editor);
    await replaceNative(mounted.editor.querySelector('p')!, 'Record中文.');
    fireEvent.compositionEnd(mounted.editor, { data: '文' });
    await waitFor(() =>
      expect(retain).toHaveBeenCalledExactlyOnceWith(
        original,
        original.replace('Record.', 'Record中.'),
      ),
    );
    expect(mounted.props.apply).not.toHaveBeenCalled();
    expect(mounted.editor).toHaveAttribute('contenteditable', 'false');
  });

  it('retains final IME Unicode when editing is disabled before the final native read', async () => {
    const original = '\uFEFFBefore $x$ after.\r\n';
    const mounted = mount(original);
    const source = reveal(mounted.editor);
    fireEvent.compositionStart(mounted.editor);
    await replaceNative(source, '$x_');
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} disabled />
      </NotificationProvider>,
    );
    await replaceNative(source, '$x_{你}$');
    fireEvent.compositionEnd(mounted.editor, { data: '你' });
    await waitFor(() =>
      expect(
        mounted.getByRole('button', { name: 'Review draft' }),
      ).toBeTruthy(),
    );
    fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
    expect(
      mounted.getByRole('textbox', { name: 'Unapplied text' }),
    ).toHaveValue('\uFEFFBefore $x_{你}$ after.\n');
    const createURL = vi.fn<(blob: Blob) => string>(() => 'blob:retained-ime');
    Object.defineProperty(URL, 'createObjectURL', {
      configurable: true,
      value: createURL,
    });
    Object.defineProperty(URL, 'revokeObjectURL', {
      configurable: true,
      value: vi.fn(),
    });
    fireEvent.click(
      mounted.getByRole('button', { name: 'Download retained source' }),
    );
    const blob = createURL.mock.calls.at(-1)![0] as Blob;
    const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as ArrayBuffer);
      reader.onerror = reject;
      reader.readAsArrayBuffer(blob);
    });
    expect(Array.from(new Uint8Array(bytes))).toEqual(
      Array.from(new TextEncoder().encode('\uFEFFBefore $x_{你}$ after.\r\n')),
    );
    expect(mounted.props.apply).not.toHaveBeenCalled();
    expect(mounted.props.onPendingChange).toHaveBeenLastCalledWith(true);
  });

  it.each([0, 2])(
    'retains final IME text when composition starts at literal source boundary %s',
    async (edge) => {
      const original = '\uFEFFBefore $x\r\n';
      const mounted = mount(original);
      const source =
        mounted.editor.querySelector<HTMLElement>('[data-math-source]')!;
      await act(async () => {
        mounted.editor.focus();
        document.getSelection()!.collapse(source.firstChild!, edge);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      fireEvent.compositionStart(mounted.editor);
      expect(mounted.props.onPendingChange).toHaveBeenLastCalledWith(true);
      await replaceNative(source, '$x_');
      mounted.rerender(
        <NotificationProvider>
          <RenderedEditor {...mounted.props} disabled />
        </NotificationProvider>,
      );
      await replaceNative(source, '$x你');
      fireEvent.compositionEnd(mounted.editor, { data: '你' });
      await waitFor(() =>
        expect(
          mounted.getByRole('button', { name: 'Review draft' }),
        ).toBeTruthy(),
      );
      fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
      expect(
        mounted.getByRole('textbox', { name: 'Unapplied text' }),
      ).toHaveValue('\uFEFFBefore $x你\n');
      const createURL = vi.fn<(blob: Blob) => string>(
        () => 'blob:retained-ime',
      );
      Object.defineProperty(URL, 'createObjectURL', {
        configurable: true,
        value: createURL,
      });
      Object.defineProperty(URL, 'revokeObjectURL', {
        configurable: true,
        value: vi.fn(),
      });
      fireEvent.click(
        mounted.getByRole('button', { name: 'Download retained source' }),
      );
      const blob = createURL.mock.calls.at(-1)![0];
      const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(reader.result as ArrayBuffer);
        reader.onerror = reject;
        reader.readAsArrayBuffer(blob);
      });
      expect(Array.from(new Uint8Array(bytes))).toEqual(
        Array.from(new TextEncoder().encode('\uFEFFBefore $x你\r\n')),
      );
      expect(mounted.props.apply).not.toHaveBeenCalled();
      expect(mounted.props.onPendingChange).toHaveBeenLastCalledWith(true);
    },
  );

  it.each(['cross-boundary selection', 'replaced math wrapper'])(
    'recovers the full disabled IME edit after %s',
    async (kind) => {
      const original = '\uFEFFBefore $x$ after.\r\n';
      const mounted = mount(original);
      const source = reveal(mounted.editor);
      const paragraph = mounted.editor.querySelector('p')!;
      if (kind === 'cross-boundary selection')
        await act(async () => {
          const range = document.createRange();
          range.selectNodeContents(paragraph);
          const selection = document.getSelection()!;
          selection.removeAllRanges();
          selection.addRange(range);
          document.dispatchEvent(new Event('selectionchange'));
          await new Promise((resolve) => setTimeout(resolve, 30));
        });
      fireEvent.compositionStart(mounted.editor);
      mounted.rerender(
        <NotificationProvider>
          <RenderedEditor {...mounted.props} disabled />
        </NotificationProvider>,
      );
      await act(async () => {
        if (kind === 'cross-boundary selection')
          paragraph.textContent = 'Replacement你.';
        else source.parentElement!.replaceWith(document.createTextNode('你'));
        mounted.editor.dispatchEvent(
          new InputEvent('input', {
            bubbles: true,
            inputType: 'insertCompositionText',
            data: '你',
            isComposing: true,
          }),
        );
        await Promise.resolve();
      });
      fireEvent.compositionEnd(mounted.editor, { data: '你' });
      await waitFor(() =>
        expect(
          mounted.getByRole('button', { name: 'Review draft' }),
        ).toBeTruthy(),
      );
      fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
      const expected =
        kind === 'cross-boundary selection'
          ? '\uFEFFReplacement你.\n'
          : '\uFEFFBefore 你 after.\n';
      expect(
        mounted.getByRole('textbox', { name: 'Unapplied text' }),
      ).toHaveValue(expected);
      expect(mounted.props.apply).not.toHaveBeenCalled();
      expect(mounted.props.onPendingChange).toHaveBeenLastCalledWith(true);
      expect(mounted.editor.getAttribute('contenteditable')).toBe('false');
    },
  );

  it('never invokes canonical undo or redo while a disabled math IME is finishing', () => {
    const mounted = mount('Before $x$ after.');
    reveal(mounted.editor);
    fireEvent.compositionStart(mounted.editor);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} disabled />
      </NotificationProvider>,
    );
    fireEvent.keyDown(mounted.editor, { key: 'z', ctrlKey: true });
    fireEvent.keyDown(mounted.editor, { key: 'y', ctrlKey: true });
    fireEvent.keyDown(mounted.editor, {
      key: 'Z',
      ctrlKey: true,
      shiftKey: true,
    });
    expect(mounted.props.undo).not.toHaveBeenCalled();
    expect(mounted.props.redo).not.toHaveBeenCalled();
  });

  it.each([
    { key: 'ArrowRight', side: 'before', edge: 1, shift: false },
    { key: 'ArrowLeft', side: 'after', edge: 2, shift: false },
    { key: 'ArrowRight', side: 'before', edge: 1, shift: true },
    { key: 'ArrowLeft', side: 'after', edge: 2, shift: true },
  ])(
    'moves $key into the actual $side math text edge with shift=$shift',
    async ({ key, side, edge, shift }) => {
      const { editor, props } = mount('Before $x$ after.');
      const paragraph = editor.querySelector('p')!;
      const text =
        side === 'before' ? paragraph.firstChild! : paragraph.lastChild!;
      const offset = side === 'before' ? text.textContent!.length : 0;
      await act(async () => {
        editor.focus();
        document.getSelection()!.collapse(text, offset);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      fireEvent.keyDown(editor, { key, shiftKey: shift });
      const source = editor.querySelector<HTMLElement>(
        '.rendered-math-source',
      )!;
      expect(source.hidden).toBe(false);
      const selection = document.getSelection()!;
      expect(selection.focusNode).toBe(source.firstChild);
      expect(selection.focusOffset).toBe(edge);
      if (shift) expect(selection.toString()).toBe('$');
      expect(editor.ownerDocument.activeElement).toBe(editor);
      expect(props.apply).not.toHaveBeenCalled();
    },
  );

  it.each([
    { key: 'ArrowDown', side: 'before', edge: 2, shift: false },
    { key: 'ArrowRight', side: 'before', edge: 2, shift: false },
    { key: 'ArrowLeft', side: 'after', edge: 5, shift: false },
    { key: 'ArrowUp', side: 'after', edge: 5, shift: false },
    { key: 'ArrowDown', side: 'before', edge: 2, shift: true },
  ])(
    'enters adjacent display source with $key at a proven visual line end, shift=$shift',
    async ({ key, side, edge, shift }) => {
      const { editor, props } = mount('Before.\n\n$$\nx\n$$\n\nAfter.\n');
      const paragraphs = editor.querySelectorAll('p');
      const text = (side === 'before' ? paragraphs[0]! : paragraphs[1]!)
        .firstChild!;
      await act(async () => {
        editor.focus();
        document
          .getSelection()!
          .collapse(text, side === 'before' ? text.textContent!.length : 0);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      const lineEnd = vi
        .spyOn(EditorView.prototype, 'endOfTextblock')
        .mockReturnValue(true);
      fireEvent.keyDown(editor, { key, shiftKey: shift });
      const source = editor.querySelector<HTMLElement>(
        '.rendered-math-source',
      )!;
      expect(source.hidden).toBe(false);
      expect(document.getSelection()!.focusNode).toBe(source.firstChild);
      expect(document.getSelection()!.focusOffset).toBe(edge);
      expect(lineEnd).toHaveBeenCalledWith(
        (
          {
            ArrowDown: 'down',
            ArrowUp: 'up',
            ArrowRight: 'forward',
            ArrowLeft: 'backward',
          } as const
        )[key as 'ArrowDown' | 'ArrowUp' | 'ArrowRight' | 'ArrowLeft'],
      );
      expect(props.apply).not.toHaveBeenCalled();
    },
  );

  it.each(['ArrowDown', 'ArrowRight'])(
    'leaves wrapped paragraph %s movement to the browser before display mathematics',
    async (key) => {
      const { editor, props } = mount('Wrapped paragraph.\n\n$$\nx\n$$\n');
      const text = editor.querySelector('p')!.firstChild!;
      await act(async () => {
        editor.focus();
        document.getSelection()!.collapse(text, 2);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      vi.spyOn(EditorView.prototype, 'endOfTextblock').mockReturnValue(false);
      const event = new KeyboardEvent('keydown', {
        key,
        bubbles: true,
        cancelable: true,
      });
      fireEvent(editor, event);
      expect(
        editor.querySelector<HTMLElement>('.rendered-math-source')!.hidden,
      ).toBe(true);
      expect(event.defaultPrevented).toBe(false);
      expect(props.apply).not.toHaveBeenCalled();
    },
  );

  it.each([
    {
      name: 'CRLF',
      raw: '$$\r\nx^2\r\n$$',
      input: '$$\ny^2\n+ z^2\n$$',
      replacement: '$$\r\ny^2\r\n+ z^2\r\n$$',
    },
    {
      name: 'mixed physical breaks',
      raw: '$$\r\nx^2\n$$',
      input: '$$\ny^2\n$$',
      replacement: '$$\r\ny^2\n$$',
    },
    {
      name: 'explicit authored CRLF',
      raw: '$$\nx^2\n$$',
      input: '$$\r\ny^2\r\n$$',
      replacement: '$$\r\ny^2\r\n$$',
    },
  ])(
    'preserves $name when replacing selected math source through native beforeinput',
    async ({ raw, input, replacement }) => {
      const prefix = '\uFEFFexport const keep = 1\r\n\r\n# Math\r\n\r\n';
      const suffix = '\r\n\r\n<Counter />\n';
      const original = prefix + raw + suffix;
      const { editor, props } = mount(original);
      const source = reveal(editor);
      await act(async () => {
        const range = document.createRange();
        range.selectNodeContents(source);
        const selection = document.getSelection()!;
        selection.removeAllRanges();
        selection.addRange(range);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      const event = new InputEvent('beforeinput', {
        bubbles: true,
        cancelable: true,
        inputType: 'insertText',
        data: input,
      });
      fireEvent(editor, event);
      expect(event.defaultPrevented).toBe(true);
      expect(props.apply).toHaveBeenLastCalledWith(
        original,
        prefix + replacement + suffix,
        true,
      );
      const current = editor.querySelector<HTMLElement>(
        '.rendered-math-source',
      )!;
      expect(current.textContent).toBe(replacement.replace(/\r\n?|\n/g, '\n'));
      expect(document.getSelection()!.focusNode).toBe(current.firstChild);
      expect(document.getSelection()!.focusOffset).toBe(
        current.textContent!.length,
      );
    },
  );

  it('uses the surrounding math physical break style for an LF-only collapsed insertion', async () => {
    const original = '\uFEFFBefore.\r\n\r\n$$\r\nx\r\n$$\r\n';
    const { editor, props } = mount(original);
    const source = reveal(editor);
    await act(async () => {
      document.getSelection()!.collapse(source.firstChild!, 4);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: '$y$\n',
    });
    fireEvent(editor, event);
    expect(event.defaultPrevented).toBe(true);
    expect(props.apply).toHaveBeenLastCalledWith(
      original,
      '\uFEFFBefore.\r\n\r\n$$\r\nx$y$\r\n\r\n$$\r\n',
      true,
    );
  });

  it('retains CRLF when a native DOM-only final dollar completes multiline literal mathematics', async () => {
    const raw = "$$\r\nf'(x) = \\frac{x}{h}.\r\n$";
    const original =
      '\uFEFF# Mathematics\r\n\r\n' + raw + '\r\n\r\nContinue writing.\r\n';
    const { editor, props } = mount(original);
    const literal = editor.querySelector<HTMLElement>('[data-math-source]')!;
    const text = literal.firstChild as Text;
    await act(async () => {
      editor.focus();
      document.getSelection()!.collapse(text, text.length);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await act(async () => {
      text.appendData('$');
      document.getSelection()!.collapse(text, text.length);
      editor.dispatchEvent(
        new InputEvent('input', {
          bubbles: true,
          inputType: 'insertText',
          data: '$',
        }),
      );
      await Promise.resolve();
    });
    await waitFor(() =>
      expect(props.apply).toHaveBeenLastCalledWith(
        original,
        original.replace(raw, () => raw + '$'),
        true,
      ),
    );
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });

  it('uses the owned native math range when beforeinput arrives before selectionchange updates the model', () => {
    const invalid = '$x \\in \\mathbb{R$';
    const corrected = '$x \\in \\mathbb{R}$';
    const original = '# Modular note\n\nFirst ' + invalid + '.\n';
    const { editor, props } = mount(original);
    editor.focus();
    const source = editor.querySelector<HTMLElement>('.rendered-math-source')!;
    // Do not emit selectionchange: this reproduces the native-event ordering
    // where the real range has moved but the PM selection is still the heading.
    const range = document.createRange();
    range.selectNodeContents(source);
    const selection = document.getSelection()!;
    selection.removeAllRanges();
    selection.addRange(range);
    const event = new InputEvent('beforeinput', {
      bubbles: true,
      cancelable: true,
      inputType: 'insertText',
      data: corrected,
    });
    fireEvent(editor, event);
    expect(event.defaultPrevented).toBe(true);
    expect(props.apply).toHaveBeenLastCalledWith(
      original,
      original.replace(invalid, () => corrected),
      true,
    );
    expect(editor.querySelector('h1')!.textContent).toBe('Modular note');
  });

  it.each([false, true])(
    'reveals math source before native caret synchronization with shift=%s',
    async (shift) => {
      const { editor, props } = mount('Before $x$ after.');
      const source = editor.querySelector<HTMLElement>(
        '.rendered-math-source',
      )!;
      const text = editor.querySelector('p')!.firstChild!;
      await act(async () => {
        editor.focus();
        document.getSelection()!.collapse(text, text.textContent!.length);
        document.dispatchEvent(new Event('selectionchange'));
        await new Promise((resolve) => setTimeout(resolve, 30));
      });
      const selection = document.getSelection()!;
      const collapse = selection.collapse.bind(selection);
      const extend = selection.extend.bind(selection);
      const writes: { hidden: boolean; offset: number | undefined }[] = [];
      vi.spyOn(selection, 'collapse').mockImplementation((node, offset) => {
        if (node && source.contains(node))
          writes.push({ hidden: Boolean(source.hidden), offset });
        collapse(node, offset);
      });
      vi.spyOn(selection, 'extend').mockImplementation((node, offset) => {
        if (source.contains(node))
          writes.push({ hidden: Boolean(source.hidden), offset });
        extend(node, offset);
      });
      fireEvent.keyDown(editor, { key: 'ArrowRight', shiftKey: shift });
      expect(writes.length).toBeGreaterThan(0);
      expect(writes.every((write) => !write.hidden)).toBe(true);
      expect(props.apply).not.toHaveBeenCalled();
    },
  );

  it('removes the final draft dollar without leaving an unsafe stale mark or blocking typing', async () => {
    const original = 'Before $x';
    const { editor, props } = mount(original);
    const draft = editor.querySelector<HTMLElement>('[data-math-source]')!;
    expect(draft).not.toBeNull();
    // Let PM observe the native document selection before editing its text.
    await act(async () => {
      editor.focus();
      document.getSelection()!.collapse(draft.firstChild!, 1);
      document.dispatchEvent(new Event('selectionchange'));
      await new Promise((resolve) => setTimeout(resolve, 30));
    });
    await replaceNative(draft, 'x');
    await waitFor(() =>
      expect(props.apply).toHaveBeenLastCalledWith(original, 'Before x', true),
    );
    expect(editor.querySelector('[data-math-source]')).toBeNull();
    expect(document.querySelector('[role="alert"]')).toBeNull();
  });
  it('persists a refused editor attempt and keeps it until durable discard succeeds', async () => {
    const original = 'Before $x$ after.';
    const mounted = mount(original);
    const retain = vi.fn(async () => {});
    const discard = vi.fn(async () => {
      throw new Error('Deletion unavailable');
    });
    Object.assign(mounted.props, {
      onRetainAttempt: retain,
      onDiscardAttempt: discard,
    });
    vi.mocked(mounted.props.apply).mockReturnValue(false);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} />
      </NotificationProvider>,
    );
    await replaceNative(reveal(mounted.editor), '$y$');
    await waitFor(() =>
      expect(retain).toHaveBeenCalledWith(original, 'Before $y$ after.'),
    );
    fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
    await waitFor(() =>
      expect(mounted.getByText('Recovery copy saved.')).toBeTruthy(),
    );
    fireEvent.click(
      mounted.getByRole('button', { name: 'Discard retained draft' }),
    );
    await waitFor(() => expect(discard).toHaveBeenCalledTimes(1));
    expect(
      mounted.getByRole('textbox', { name: 'Unapplied text' }),
    ).toHaveValue('Before $y$ after.');
    expect(mounted.editor.textContent).toContain('Before');
  });

  it('retains an exact downloadable attempt if its recovery copy cannot be saved', async () => {
    const original = 'Before $x$ after.';
    const mounted = mount(original);
    const retain = vi.fn(async () => {
      throw new Error('Storage full');
    });
    Object.assign(mounted.props, { onRetainAttempt: retain });
    vi.mocked(mounted.props.apply).mockReturnValue(false);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} />
      </NotificationProvider>,
    );
    await replaceNative(reveal(mounted.editor), '$y$');
    await waitFor(() => expect(retain).toHaveBeenCalledTimes(1));
    fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
    await waitFor(() =>
      expect(
        mounted.getByText(
          'Recovery copy could not be saved. Download or copy this text before leaving.',
        ),
      ).toBeTruthy(),
    );
    expect(
      mounted.getByRole('textbox', { name: 'Unapplied text' }),
    ).toHaveValue('Before $y$ after.');
    expect(
      mounted.getByRole('button', { name: 'Download retained source' }),
    ).toBeTruthy();
  });
  it('serializes live recovery actions and retains text when the stored-copy handoff fails', async () => {
    const mounted = mount('Before $x$ after.');
    let rejectKeep!: (reason: Error) => void;
    const keep = vi.fn(
      () =>
        new Promise<void>((_, reject) => {
          rejectKeep = reject;
        }),
    );
    const discard = vi.fn(async () => {});
    Object.assign(mounted.props, {
      onRetainAttempt: vi.fn(async () => {}),
      onKeepAttempt: keep,
      onDiscardAttempt: discard,
    });
    vi.mocked(mounted.props.apply).mockReturnValue(false);
    mounted.rerender(
      <NotificationProvider>
        <RenderedEditor {...mounted.props} />
      </NotificationProvider>,
    );
    await replaceNative(reveal(mounted.editor), '$y$');
    fireEvent.click(mounted.getByRole('button', { name: 'Review draft' }));
    const keepButton = await mounted.findByRole('button', {
      name: 'Keep recovery copy and continue',
    });
    fireEvent.click(keepButton);
    await waitFor(() => expect(keep).toHaveBeenCalledTimes(1));
    expect(
      mounted.getByRole('button', { name: 'Discard retained draft' }),
    ).toBeDisabled();
    fireEvent.click(
      mounted.getByRole('button', { name: 'Discard retained draft' }),
    );
    expect(discard).not.toHaveBeenCalled();
    await act(async () => rejectKeep(new Error('Stored copy is unavailable')));
    expect(
      mounted.getByRole('textbox', { name: 'Unapplied text' }),
    ).toHaveValue('Before $y$ after.');
    expect(
      mounted.getByRole('button', { name: 'Discard retained draft' }),
    ).not.toBeDisabled();
  });
});
