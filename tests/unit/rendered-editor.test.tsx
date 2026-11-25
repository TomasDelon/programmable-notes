import { EditorView as MathView } from '@codemirror/view';
import {
  act,
  fireEvent,
  render as renderUI,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, type ComponentProps, type ReactElement } from 'react';
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
function changeMath(field: HTMLElement, value: string) {
  const view = MathView.findFromDOM(field)!;
  act(() =>
    view.dispatch({
      changes: { from: 0, to: view.state.doc.length, insert: value },
    }),
  );
}
function mathValue(field: HTMLElement) {
  return MathView.findFromDOM(field)!.state.doc.toString();
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

  it('refuses inserted content while an unsafe delimiter edit is pending', () => {
    const props = propsFor('Keep $x$ here.');
    render(<RenderedEditor {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const field = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    changeMath(field, '$x');
    fireEvent.keyDown(field, { key: 'Enter' });
    act(() => {
      expect(props.commandsRef.current!.insertText('Replacement.')).toBe(false);
    });
    expect(props.apply).not.toHaveBeenCalled();
    expect(mathValue(field)).toBe('$x');
    expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
    fireEvent.keyDown(field, { key: 'Escape' });
    act(() => {
      expect(props.commandsRef.current!.insertText('Allowed.')).toBe(true);
    });
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('reconciles a deferred source revision after cancelling an equation draft', () => {
    const props = propsFor('Before $x$.');
    const ui = render(<RenderedEditor {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const field = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    changeMath(field, '$x^2$');
    ui.rerender(<RenderedEditor {...props} source="After $y$." />);
    expect(mathValue(field)).toBe('$x^2$');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(mathValue(field)).toBe('$x^2$');
    expect(screen.getByRole('alert')).toBeVisible();
    expect(props.apply).not.toHaveBeenCalled();
    fireEvent.keyDown(field, { key: 'Escape' });
    expect(
      screen.getByRole('button', { name: 'Edit inline equation: y' }),
    ).toBeVisible();
    expect(
      screen.getByRole('textbox', { name: 'Editable document' }),
    ).toHaveTextContent('After');
    expect(props.onPendingChange).toHaveBeenLastCalledWith(false);
  });

  it('opens the second identical equation at its current exact offset after preceding text is inserted', () => {
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
    const equations = screen.getAllByRole('button', {
      name: 'Edit inline equation: x',
    });
    expect(equations).toHaveLength(2);
    fireEvent.click(equations[1]!);
    const field = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    expect(mathValue(field)).toBe('$x$');
    const before = accepted;
    changeMath(field, '$x^2$');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(props.apply).toHaveBeenLastCalledWith(
      before,
      before.slice(0, before.lastIndexOf('$x$')) +
        '$x^2$' +
        before.slice(before.lastIndexOf('$x$') + 3),
      false,
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

  it('retains an existing link URL when an invalid equation prevents its application', () => {
    const props = propsFor('Link target and $x$.');
    render(<RenderedEditor {...props} />);
    fireEvent.keyDown(
      screen.getByRole('textbox', { name: 'Editable document' }),
      { key: 'K', code: 'KeyK', keyCode: 75, ctrlKey: true, shiftKey: true },
    );
    const url = screen.getByRole('textbox', { name: 'Link URL' });
    fireEvent.change(url, {
      target: { value: 'https://example.org/retained' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const math = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    changeMath(math, '$x');
    fireEvent.keyDown(math, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://example.org/retained',
    );
    expect(mathValue(math)).toBe('$x');
    expect(props.apply).not.toHaveBeenCalled();
    fireEvent.keyDown(math, { key: 'Escape' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(
      screen.queryByRole('textbox', { name: 'Link URL' }),
    ).not.toBeInTheDocument();
    expect(props.apply).toHaveBeenCalledOnce();
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

it('keeps an invalid mathematical expression red when its editable source receives focus', () => {
  const props = propsFor('Keep $\\unknowncommand$ here.');
  render(<RenderedEditor {...props} />);
  const equation = screen.getByRole('button', {
    name: 'Edit inline equation: \\unknowncommand',
  });
  expect(equation.closest('.rendered-math-host')).toHaveClass(
    'rendered-math-invalid',
  );
  fireEvent.click(equation);
  expect(
    screen
      .getByRole('textbox', { name: 'Inline LaTeX source' })
      .closest('.rendered-math-host'),
  ).toHaveClass('rendered-math-invalid');
});

it('does not detach a mathematical activation target during unrelated runtime updates', () => {
  const props = propsFor('Keep $x$ here.');
  const ui = render(<RenderedEditor {...props} />);
  const button = screen.getByRole('button', {
    name: 'Edit inline equation: x',
  });
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
  const button = screen.getByRole('button', {
    name: 'Edit inline equation: x',
  });
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
