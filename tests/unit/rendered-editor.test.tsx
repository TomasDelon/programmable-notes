import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { EditorView as MathView } from '@codemirror/view';
import {
  act,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
} from '@testing-library/react';
import {
  createRef,
  useState,
  type ComponentProps,
  type ReactElement,
} from 'react';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { rawSource } from '../../src/editor/live/rawSource';
import { undo as undoSource, redo as redoSource } from '@codemirror/commands';
import { NotificationProvider } from '../../src/ui/Notifications';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  RenderedEditor,
  type RenderedCommands,
} from '../../src/editor/rendered/RenderedEditor';

// The component contract under test is host editing. Runtime isolation is
// exercised by the real browser suite, not by an artificial jsdom compiler.
vi.mock('../../src/editor/rendered/RenderedRuntime', () => ({
  RenderedRuntime: () => null,
}));

type Props = ComponentProps<typeof RenderedEditor>;
const render = (ui: ReactElement) =>
  renderUI(ui, { wrapper: NotificationProvider });
async function changeMath(field: HTMLElement, value: string) {
  await act(async () => {
    field.textContent = value;
    field.dispatchEvent(
      new InputEvent('input', { bubbles: true, inputType: 'insertText' }),
    );
    await Promise.resolve();
  });
}
function mathSource(index = 0): HTMLElement {
  const host = document.querySelectorAll<HTMLElement>('.rendered-math-host')[
    index
  ]!;
  fireEvent.mouseDown(host.querySelector('.rendered-math-render')!, {
    button: 0,
  });
  return host.querySelector<HTMLElement>('.rendered-math-source')!;
}
function mathValue(field: HTMLElement) {
  return field.textContent;
}
function propsFor(source: string): Props {
  return {
    source,
    path: 'note.mdx',
    active: true,
    disabled: false,
    commandsRef: createRef<RenderedCommands>(),
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
}

const originalRects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getClientRects',
);
const originalRect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
);
const originalCreateURL = Object.getOwnPropertyDescriptor(
  URL,
  'createObjectURL',
);
const originalRevokeURL = Object.getOwnPropertyDescriptor(
  URL,
  'revokeObjectURL',
);
beforeEach(() => {
  // jsdom has no layout. These values only allow selection scrolling to run;
  // no test treats them as evidence of browser layout or visual correctness.
  Object.defineProperty(Range.prototype, 'getClientRects', {
    configurable: true,
    value: () => [],
  });
  Object.defineProperty(Range.prototype, 'getBoundingClientRect', {
    configurable: true,
    value: () => new DOMRect(),
  });
  Object.defineProperty(URL, 'createObjectURL', {
    configurable: true,
    value: vi.fn(() => 'blob:verified-fixture'),
  });
  Object.defineProperty(URL, 'revokeObjectURL', {
    configurable: true,
    value: vi.fn(),
  });
});
afterEach(() => {
  for (const [target, property, descriptor] of [
    [Range.prototype, 'getClientRects', originalRects],
    [Range.prototype, 'getBoundingClientRect', originalRect],
    [URL, 'createObjectURL', originalCreateURL],
    [URL, 'revokeObjectURL', originalRevokeURL],
  ] as const) {
    if (descriptor) Object.defineProperty(target, property, descriptor);
    else Reflect.deleteProperty(target, property);
  }
});

describe('rendered editor host transaction boundary', () => {
  it('keeps the first rejected edit until explicit recovery instead of overwriting it with another attempt', () => {
    const props = propsFor('Saved source.');
    props.apply = vi.fn(() => false);
    render(<RenderedEditor {...props} />);
    act(() => {
      props.commandsRef.current!.insertText('First retained draft.');
    });
    act(() => {
      props.commandsRef.current!.insertText('Second rejected attempt.');
    });
    expect(props.apply).toHaveBeenCalledOnce();
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Unapplied text',
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('First retained draft.');
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Unapplied text',
        }) as HTMLTextAreaElement
      ).value,
    ).not.toContain('Second rejected attempt.');
  });
  it('keeps formatting out of the document and opens link editing with its shortcut', () => {
    render(<RenderedEditor {...propsFor('A link target.')} />);
    expect(
      screen.queryByRole('toolbar', { name: 'Text formatting' }),
    ).not.toBeInTheDocument();
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Editable document' }),
      { key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true },
    );
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://',
    );
  });
  it('rejects refused inserts, keeps the attempted text, and restores browser-mutated DOM', async () => {
    const props = propsFor('Saved note.');
    props.apply = vi.fn(() => false);
    render(<RenderedEditor {...props} />);
    const editor = screen.getByRole('textbox', { name: 'Editable document' });
    act(() => {
      expect(props.commandsRef.current!.insertText('Rejected insertion.')).toBe(
        false,
      );
    });
    expect(props.apply).toHaveBeenCalledOnce();
    expect(editor.textContent).toBe('Saved note.');
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Unapplied text',
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('Rejected insertion.');
    act(() => {
      editor.querySelector('p')!.textContent = 'Rejected browser input.';
    });
    await waitFor(() => expect(editor.textContent).toBe('Saved note.'));
    expect(props.apply).toHaveBeenCalledOnce();
    await waitFor(() => expect(editor.textContent).toBe('Saved note.'));
    expect(
      (
        screen.getByRole('textbox', {
          name: 'Unapplied text',
        }) as HTMLTextAreaElement
      ).value,
    ).toContain('Rejected insertion.');
    expect(screen.getByRole('alert')).toHaveTextContent(
      'Your edit was kept for recovery',
    );
    expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Discard retained draft' }),
    );
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('defers an external source refresh during composition and applies it after composition ends', async () => {
    const props = propsFor('Original text.');
    const ui = render(<RenderedEditor {...props} />);
    const editor = screen.getByRole('textbox', { name: 'Editable document' });
    fireEvent.compositionStart(editor);
    ui.rerender(<RenderedEditor {...props} source="External replacement." />);
    expect(editor.textContent).toBe('Original text.');
    fireEvent.compositionEnd(editor);
    await waitFor(() =>
      expect(editor.textContent).toBe('External replacement.'),
    );
    expect(props.apply).not.toHaveBeenCalled();
  });

  it('commits missing delimiters as document text without an alert or pending guard', async () => {
    const props = propsFor('Keep $x$ here.');
    render(<RenderedEditor {...props} />);
    await changeMath(mathSource(), '$x');
    expect(props.apply).toHaveBeenCalledWith(
      'Keep $x$ here.',
      'Keep $x here.',
      true,
    );
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(
      screen.getByRole('textbox', { name: 'Editable document' }),
    ).toHaveTextContent('Keep $x here.');
    expect(
      document.querySelector('.rendered-math-source .cm-editor'),
    ).toBeNull();
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('reconciles an external source revision after an immediately accepted equation edit', async () => {
    const props = propsFor('Before $x$.');
    const ui = render(<RenderedEditor {...props} />);
    await changeMath(mathSource(), '$x^2$');
    expect(props.apply).toHaveBeenCalledWith(
      'Before $x$.',
      'Before $x^2$.',
      true,
    );
    (props.apply as ReturnType<typeof vi.fn>).mockClear();
    ui.rerender(<RenderedEditor {...props} source="After $y$." />);
    expect(mathSource().textContent).toBe('$y$');
    expect(
      screen.getByRole('textbox', { name: 'Editable document' }),
    ).toHaveTextContent('After');
    expect(props.apply).not.toHaveBeenCalled();
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('opens the second identical equation at its current exact offset after preceding text is inserted', async () => {
    const source = 'Original paragraph.\r\n\r\nFirst $x$ and second $x$.\n';
    const props = propsFor(source);
    let accepted = source;
    props.apply = vi.fn((_expected, next) => {
      accepted = next;
      return true;
    });
    const ui = render(<RenderedEditor {...props} />);
    act(() =>
      expect(
        props.commandsRef.current!.insertText('Inserted preceding paragraph.'),
      ).toBe(true),
    );
    ui.rerender(<RenderedEditor {...props} source={accepted} />);
    const field = mathSource(1);
    expect(mathValue(field)).toBe('$x$');
    const before = accepted;
    await changeMath(field, '$x^2$');
    expect(props.apply).toHaveBeenLastCalledWith(
      before,
      before.slice(0, before.lastIndexOf('$x$')) +
        '$x^2$' +
        before.slice(before.lastIndexOf('$x$') + 3),
      true,
    );
  });

  it('fills an existing image node when its validated catalog arrives without editing the document', () => {
    const id = `sha256:${'a'.repeat(64)}`;
    const props = propsFor(`![Diagram](attachment:${id})`);
    const ui = render(<RenderedEditor {...props} />);
    const editor = screen.getByRole('textbox', { name: 'Editable document' });
    const originalPlaceholder = editor.querySelector('.rendered-image');
    expect(originalPlaceholder).toHaveTextContent('Diagram');
    expect(originalPlaceholder?.querySelector('img')).toBeNull();
    ui.rerender(
      <RenderedEditor
        {...props}
        runtime={{
          ...props.runtime,
          images: [
            {
              id,
              name: 'diagram.png',
              mime: 'image/png',
              width: 1,
              height: 1,
              byteLength: 68,
              base64:
                'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+iFioAAAAASUVORK5CYII=',
            },
          ],
        }}
      />,
    );
    expect(editor.querySelector('.rendered-image')).toBe(originalPlaceholder);
    expect(screen.getByRole('img', { name: 'Diagram' })).toHaveAttribute(
      'src',
      'blob:verified-fixture',
    );
    expect(props.apply).not.toHaveBeenCalled();
    ui.unmount();
    expect(URL.revokeObjectURL).toHaveBeenCalledWith('blob:verified-fixture');
  });

  it('retains an existing link URL when a refused equation edit requires recovery', async () => {
    const props = propsFor('Link target and $x$.');
    props.apply = vi.fn(() => false);
    render(<RenderedEditor {...props} />);
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Editable document' }),
      { key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true },
    );
    fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
      target: { value: 'https://example.org/retained' },
    });
    await changeMath(mathSource(), '$x^2$');
    expect(props.apply).toHaveBeenCalledWith(
      'Link target and $x$.',
      'Link target and $x^2$.',
      true,
    );
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://example.org/retained',
    );
    expect(screen.getByRole('alert')).toBeVisible();
    expect(mathValue(document.querySelector('.rendered-math-source')!)).toBe(
      '$x$',
    );
    fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
    expect(screen.getByRole('textbox', { name: 'Unapplied text' })).toHaveValue(
      'Link target and $x^2$.',
    );
  });

  it('retains a link draft and refuses stale selection coordinates after an external source update', () => {
    const props = propsFor('Original paragraph with a link target.');
    const ui = render(<RenderedEditor {...props} />);
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Editable document' }),
      { key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true },
    );
    expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
    const url = screen.getByRole('textbox', { name: 'Link URL' });
    fireEvent.change(url, {
      target: { value: 'https://example.com/retained' },
    });
    ui.rerender(<RenderedEditor {...props} source="Short." />);
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(props.apply).not.toHaveBeenCalled();
    expect(
      screen.getByRole('textbox', { name: 'Editable document' }),
    ).toHaveTextContent('Short.');
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://example.com/retained',
    );
    expect(screen.getByRole('alert')).toHaveTextContent('Your URL is retained');
    fireEvent.click(screen.getByRole('button', { name: /^Cancel$/ }));
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });
});

it('downloads retained raw source with its BOM, CRLF and opaque JSX intact', async () => {
  const props = propsFor('\uFEFFOriginal.\r\n\r\n<span>Opaque</span>\r\n');
  props.apply = vi.fn(() => false);
  render(<RenderedEditor {...props} />);
  act(() => {
    props.commandsRef.current!.insertText('Rejected.');
  });
  fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Download retained source' }),
  );
  const blob = vi.mocked(URL.createObjectURL).mock.calls.at(-1)![0] as Blob;
  const bytes = await new Promise<ArrayBuffer>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result as ArrayBuffer);
    reader.onerror = reject;
    reader.readAsArrayBuffer(blob);
  });
  expect(Array.from(new Uint8Array(bytes))).toEqual(
    Array.from(
      new TextEncoder().encode(
        '\uFEFFRejected.\r\n\r\nOriginal.\r\n\r\n<span>Opaque</span>\r\n',
      ),
    ),
  );
  expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
});

it('rejects obsolete React echoes without rejecting subsequent current visual edits', () => {
  const props = propsFor('Original.');
  let owned = props.source;
  const sourceIsCurrent = (snapshot: string) => snapshot === owned;
  props.apply = vi.fn((expected: string, next: string) => {
    if (expected !== owned) return false;
    owned = next;
    return true;
  });
  const ui = render(
    <RenderedEditor {...props} sourceIsCurrent={sourceIsCurrent} />,
  );
  act(() => {
    expect(props.commandsRef.current!.insertText('First.')).toBe(true);
  });
  const earlier = owned;
  act(() => {
    expect(props.commandsRef.current!.insertText('Second.')).toBe(true);
  });
  const latest = owned;
  ui.rerender(
    <RenderedEditor
      {...props}
      source={earlier}
      sourceIsCurrent={sourceIsCurrent}
    />,
  );
  expect(owned).toBe(latest);
  act(() => {
    expect(props.commandsRef.current!.insertText('Third.')).toBe(true);
  });
  expect(
    screen.queryByRole('button', { name: 'Review draft' }),
  ).not.toBeInTheDocument();
});

it('keeps invalid mathematical text red while using the document selection', () => {
  render(<RenderedEditor {...propsFor('Keep $\\unknowncommand$ here.')} />);
  const source = mathSource();
  expect(source.closest('.rendered-math-host')).toHaveClass(
    'rendered-math-invalid',
  );
  expect(source.closest('.ProseMirror')).toBe(
    screen.getByRole('textbox', { name: 'Editable document' }),
  );
  expect(source.querySelector('.cm-editor,input,textarea')).toBeNull();
});

it('does not detach a mathematical activation target during unrelated runtime updates', () => {
  const props = propsFor('Keep $x$ here.');
  const ui = render(<RenderedEditor {...props} />);
  const button = document.querySelector('.rendered-math-source')!;
  const host = button.closest('.rendered-math-host')!;
  const observer = new MutationObserver(() => {});
  observer.observe(host, { childList: true });
  ui.rerender(
    <RenderedEditor
      {...props}
      runtime={{
        ...props.runtime,
        files: {
          'note.mdx': props.source,
          'other.tsx': 'export const value=1',
        },
      }}
    />,
  );
  const removed = observer
    .takeRecords()
    .flatMap((record) => [...record.removedNodes]);
  observer.disconnect();
  expect(removed).not.toContain(button);
});

it('preserves the math activation target when a source edit only shifts its offsets', () => {
  const props = propsFor('Keep $x$ here.');
  const ui = render(<RenderedEditor {...props} />);
  const button = document.querySelector('.rendered-math-source')!;
  const observer = new MutationObserver(() => {});
  observer.observe(button.closest('.rendered-math-host')!, { childList: true });
  ui.rerender(<RenderedEditor {...props} source="Longer Keep $x$ here." />);
  const removed = observer
    .takeRecords()
    .flatMap((record) => [...record.removedNodes]);
  observer.disconnect();
  expect(removed).not.toContain(button);
});

it('owns replacement text before a browser can mutate an unrepresentable Select All range', () => {
  const source = 'export const preserved = 1\n\nA visible paragraph.\n';
  const props = propsFor(source);
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  act(() => fireEvent.keyDown(editor, { key: 'a', ctrlKey: true }));
  const input = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: 'Replacement body.',
  });
  act(() => editor.dispatchEvent(input));
  expect(input.defaultPrevented).toBe(true);
  expect(props.apply).toHaveBeenCalledWith(
    source,
    expect.stringContaining('Replacement body.'),
    false,
  );
  const next = (props.apply as ReturnType<typeof vi.fn>).mock.calls.at(
    -1,
  )![1] as string;
  expect(next).toContain('export const preserved = 1');
  expect(next).not.toContain('A visible paragraph.');
});

it('commits input-only Select All replacement once while preserving hidden setup', () => {
  const source = 'export const preserved = 1\n\nA visible paragraph.\n';
  const props = propsFor(source);
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  act(() => fireEvent.keyDown(editor, { key: 'a', ctrlKey: true }));
  // OS/browser insertion APIs can emit input without a cancellable beforeinput.
  act(() => {
    editor.querySelector('p')!.textContent = 'Replacement body.';
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertText',
        data: 'Replacement body.',
      }),
    );
  });
  expect(props.apply).toHaveBeenCalledTimes(1);
  const next = (props.apply as ReturnType<typeof vi.fn>).mock
    .calls[0]![1] as string;
  expect(next).toContain('export const preserved = 1');
  expect(next).toContain('Replacement body.');
  expect(next).not.toContain('A visible paragraph.');
});

it('does not force a stale AllSelection after focus cancels its editing intent', () => {
  const props = propsFor(
    'export const preserved = 1\n\nKeep this visible body.\n',
  );
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  act(() => fireEvent.keyDown(editor, { key: 'a', ctrlKey: true }));
  act(() => fireEvent.blur(editor));
  const input = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: 'A later edit',
  });
  act(() => editor.dispatchEvent(input));
  expect(input.defaultPrevented).toBe(false);
  expect(props.apply).not.toHaveBeenCalled();
});

it('undoes rendered composition replacement as one exact canonical source event', async () => {
  const original =
    '\uFEFFexport const setup = 1\r\n\r\n# Original heading\r\n\r\nOriginal paragraph.\r\n';
  function ControlledEditor() {
    const [source, setSource] = useState(original);
    return (
      <SourceEditor
        source={source}
        documentKey="composition.mdx"
        onChange={setSource}
        rendered={{
          active: true,
          files: { 'composition.mdx': source },
          entry: 'composition.mdx',
          theme: 'light',
          images: [],
          stopped: true,
        }}
      />
    );
  }
  const mounted = render(<ControlledEditor />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  const canonical = MathView.findFromDOM(
    mounted.container.querySelector('.cm-editor')!,
  )!;
  act(() => fireEvent.keyDown(editor, { key: 'a', ctrlKey: true }));
  act(() => fireEvent.compositionStart(editor));
  expect(rawSource(canonical.state)).not.toContain('Original heading');
  await act(async () => {
    editor.querySelector('p')!.textContent = 'Replacement body.';
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: 'Replacement body.',
        isComposing: true,
      }),
    );
    fireEvent.compositionEnd(editor, { data: 'Replacement body.' });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(rawSource(canonical.state)).toContain('Replacement body.'),
  );
  const changed = rawSource(canonical.state);
  act(() => {
    undoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(original);
  act(() => {
    redoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(changed);
  // A subsequent composition after Redo must open its own history event.
  act(() => fireEvent.compositionStart(editor));
  await act(async () => {
    editor.querySelector('p')!.textContent =
      'Replacement body. Second composition.';
    editor.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: ' Second composition.',
        isComposing: true,
      }),
    );
    fireEvent.compositionEnd(editor, { data: ' Second composition.' });
    await Promise.resolve();
  });
  await waitFor(() =>
    expect(rawSource(canonical.state)).toContain('Second composition.'),
  );
  const second = rawSource(canonical.state);
  act(() => {
    undoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(changed);
  act(() => {
    undoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(original);
  act(() => {
    redoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(changed);
  act(() => {
    redoSource(canonical);
  });
  expect(rawSource(canonical.state)).toBe(second);
});

it('does not promote dollars from composing DOM through the ordinary text-input shortcut', () => {
  const props = propsFor('Before text.');
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  act(() => fireEvent.compositionStart(editor));
  const event = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: '$',
    isComposing: true,
  });
  act(() => editor.dispatchEvent(event));
  expect(event.defaultPrevented).toBe(false);
  expect(props.apply).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('textbox', { name: 'Inline LaTeX source' }),
  ).not.toBeInTheDocument();
});

it('owns unmodified Home and End within a single visible text line after hidden setup', () => {
  const props = propsFor('export const preserved = 1\n\n# Components\n');
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  // Layout is supplied explicitly: jsdom does not know visual line boundaries.
  const coordinates = vi
    .spyOn(EditorView.prototype, 'coordsAtPos')
    .mockReturnValue({ left: 20, right: 20, top: 10, bottom: 30 });
  const nativeSync = vi.spyOn(EditorView.prototype, 'focus');
  const current = () => coordinates.mock.contexts.at(-1) as EditorView;
  const selection = () => current().state.selection;
  try {
    expect(fireEvent.keyDown(editor, { key: 'End' })).toBe(false);
    expect(selection().$head.parentOffset).toBe('Components'.length);
    expect(selection().$head.parent.type.name).toBe('heading');
    expect(fireEvent.keyDown(editor, { key: 'Home' })).toBe(false);
    expect(selection().$head.parentOffset).toBe(0);
    const previousSyncs = nativeSync.mock.calls.length;
    // An equal model selection can still have a drifted native DOM caret.
    expect(fireEvent.keyDown(editor, { key: 'Home' })).toBe(false);
    expect(nativeSync).toHaveBeenCalledTimes(previousSyncs + 1);
    expect(selection().$head.parent.type.name).toBe('heading');
    act(() => {
      current().dispatch(
        current().state.tr.setSelection(
          TextSelection.create(
            current().state.doc,
            selection().from,
            selection().from + 2,
          ),
        ),
      );
    });
    expect(fireEvent.keyDown(editor, { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'End' })).toBe(true);
    expect(selection().to - selection().from).toBe(2);
    expect(props.apply).not.toHaveBeenCalled();
  } finally {
    nativeSync.mockRestore();
    coordinates.mockRestore();
  }
});

it('leaves Home and End to the browser for wrapped text and modified keys', () => {
  const props = propsFor(
    'export const preserved = 1\n\nA wrapped paragraph.\n',
  );
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  const coordinates = vi
    .spyOn(EditorView.prototype, 'coordsAtPos')
    .mockImplementation(function (this: EditorView, position) {
      const top = position === this.state.selection.$head.start() ? 10 : 40;
      return { left: 20, right: 20, top, bottom: top + 20 };
    });
  try {
    expect(fireEvent.keyDown(editor, { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'End' })).toBe(true);
    coordinates.mockReturnValue({ left: 20, right: 20, top: 10, bottom: 30 });
    for (const modifier of ['shiftKey', 'ctrlKey', 'altKey', 'metaKey']) {
      expect(fireEvent.keyDown(editor, { key: 'Home', [modifier]: true })).toBe(
        true,
      );
      expect(fireEvent.keyDown(editor, { key: 'End', [modifier]: true })).toBe(
        true,
      );
    }
    expect(props.apply).not.toHaveBeenCalled();
  } finally {
    coordinates.mockRestore();
  }
});

it('leaves Home and End to the browser beside inline JSX node views', () => {
  const props = propsFor('Before <Badge /> after.\n');
  const mounted = render(<RenderedEditor {...props} />);
  const editor = mounted.container.querySelector('.ProseMirror')!;
  expect(editor.querySelector('.rendered-source-block')).not.toBeNull();
  const coordinates = vi
    .spyOn(EditorView.prototype, 'coordsAtPos')
    .mockReturnValue({
      left: 20,
      right: 20,
      top: 10,
      bottom: 30,
    });
  try {
    expect(fireEvent.keyDown(editor, { key: 'Home' })).toBe(true);
    expect(fireEvent.keyDown(editor, { key: 'End' })).toBe(true);
    expect(props.apply).not.toHaveBeenCalled();
  } finally {
    coordinates.mockRestore();
  }
});
