import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
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
    await waitFor(() => expect(props.apply).toHaveBeenCalledTimes(2));
    await waitFor(() => expect(editor.textContent).toBe('Saved note.'));
    expect(screen.getByRole('textbox', { name: 'Unapplied text' })).toHaveValue(
      'Rejected browser input.',
    );
    expect(screen.getByRole('alert')).toHaveTextContent(
      'saved source is unchanged',
    );
    expect(props.onPendingChange).toHaveBeenLastCalledWith(true);
    fireEvent.click(
      screen.getByRole('button', { name: 'Dismiss recovered draft' }),
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

  it('refuses inserted content while an invalid equation draft is pending', () => {
    const props = propsFor('Keep $x$ here.');
    render(<RenderedEditor {...props} />);
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const field = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    fireEvent.change(field, { target: { value: '$\\unknowncommand$' } });
    fireEvent.keyDown(field, { key: 'Enter' });
    act(() => {
      expect(props.commandsRef.current!.insertText('Replacement.')).toBe(false);
    });
    expect(props.apply).not.toHaveBeenCalled();
    expect(field).toHaveValue('$\\unknowncommand$');
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
    fireEvent.change(field, { target: { value: '$x^2$' } });
    ui.rerender(<RenderedEditor {...props} source="After $y$." />);
    expect(field).toHaveValue('$x^2$');
    fireEvent.keyDown(field, { key: 'Enter' });
    expect(field).toHaveValue('$x^2$');
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
    expect(field).toHaveValue('$x$');
    const before = accepted;
    fireEvent.change(field, { target: { value: '$x^2$' } });
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
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
    const url = screen.getByRole('textbox', { name: 'Link URL' });
    fireEvent.change(url, {
      target: { value: 'https://example.org/retained' },
    });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    const math = screen.getByRole('textbox', { name: 'Inline LaTeX source' });
    fireEvent.change(math, { target: { value: '$\\unknowncommand$' } });
    fireEvent.keyDown(math, { key: 'Enter' });
    fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
    expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
      'https://example.org/retained',
    );
    expect(math).toHaveValue('$\\unknowncommand$');
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
    fireEvent.click(screen.getByRole('button', { name: 'Insert link' }));
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
