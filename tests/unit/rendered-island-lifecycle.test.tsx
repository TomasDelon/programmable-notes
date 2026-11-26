import {
  act,
  fireEvent,
  render,
  screen,
  waitFor,
} from '@testing-library/react';
import { createRef, type ComponentProps } from 'react';
import { beforeEach, expect, it, vi } from 'vitest';
import { RenderedEditor } from '../../src/editor/rendered/RenderedEditor';
import { useWebPreview } from '../../src/web/useWebPreview';
import { NotificationProvider } from '../../src/ui/Notifications';

// Keep the real island source selection, React roots, and keyed iframe. Only
// the worker output is substituted so that jsdom can observe iframe lifetime.
vi.mock('../../src/web/useWebPreview', () => ({
  useWebPreview: ({ files, entry }: Parameters<typeof useWebPreview>[0]) => ({
    html: files[entry],
    error: '',
    reportRuntimeError: () => {},
  }),
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

const original =
  '\uFEFFexport const Counter = () => 1\r\n\r\n' +
  'Before $x$ after.\r\n\r\n' +
  'Set $y \\in \\mathbb{R$ here.\r\n\r\n' +
  'Ratio $\\frac{a}{b$ goes here.\r\n\r\n' +
  'Root $\\sqrt{z$ goes here.\r\n\r\n' +
  'A spare $ is ordinary punctuation.\r\n\r\n' +
  '$$\r\nf(x) = \\frac{1}{2}\r\n$\r\n\r\n' +
  '{/* Keep its spacing.  */}\n\n<section><Counter /></section>\n';

function mount() {
  const props: ComponentProps<typeof RenderedEditor> = {
    source: original,
    path: 'note.mdx',
    active: true,
    disabled: false,
    wikilinks: [],
    commandsRef: createRef(),
    runtime: {
      files: { 'note.mdx': original },
      entry: 'note.mdx',
      theme: 'light',
      images: [],
      stopped: false,
    },
    apply: vi.fn(() => true),
    undo: vi.fn(),
    redo: vi.fn(),
    openSource: vi.fn(),
  };
  const ui = render(<RenderedEditor {...props} />, {
    wrapper: NotificationProvider,
  });
  const refresh = (
    source: string,
    stopped = false,
    react = true,
    rebuildVersion = 0,
  ) => {
    ui.rerender(
      <RenderedEditor
        {...props}
        source={source}
        runtime={{
          ...props.runtime,
          files: { 'note.mdx': source },
          stopped,
          rebuildVersion,
          corePlugins: { react, mathematics: true },
        }}
      />,
    );
  };
  return {
    editor: screen.getByRole('textbox', { name: 'Editable document' }),
    refresh,
    apply: props.apply,
  };
}

it('keeps the running island mounted when math loses and regains its closing delimiter', async () => {
  const { editor, refresh, apply } = mount();
  const frame = editor.querySelector('iframe')!;
  const browsingContext = frame.contentWindow;
  expect(browsingContext).not.toBeNull();
  const renderMath = editor.querySelector('.rendered-math-render')!;
  fireEvent.mouseDown(renderMath, { button: 0 });
  const math = editor.querySelector('.rendered-math-source')!;
  await act(async () => {
    math.textContent = '$x';
    math.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'deleteContentBackward',
      }),
    );
  });
  const unmatched = original.replace('$x$', '$x');
  await waitFor(() =>
    expect(apply).toHaveBeenLastCalledWith(original, unmatched, true),
  );
  refresh(unmatched);
  expect(
    editor.querySelector('p')!.querySelector('.rendered-math-host'),
  ).toBeNull();
  expect(screen.getByTitle('Document preview')).toBe(frame);
  expect(frame.contentWindow).toBe(browsingContext);

  const paragraph = editor.querySelector('p')!;
  const walker = document.createTreeWalker(paragraph, NodeFilter.SHOW_TEXT);
  let text = walker.nextNode()!;
  while (!text.textContent!.includes('$x')) text = walker.nextNode()!;
  editor.focus();
  document.getSelection()!.collapse(text, text.textContent!.indexOf('$x') + 2);
  const input = new InputEvent('beforeinput', {
    bubbles: true,
    cancelable: true,
    inputType: 'insertText',
    data: '$',
  });
  fireEvent(editor, input);
  expect(input.defaultPrevented).toBe(true);
  expect(apply).toHaveBeenLastCalledWith(unmatched, original, true);
  refresh(original);
  expect(
    editor.querySelector('p')!.querySelector('.rendered-math-host'),
  ).not.toBeNull();
  expect(screen.getByTitle('Document preview')).toBe(frame);
  expect(frame.contentWindow).toBe(browsingContext);
});

it('replaces the iframe for changed JSX and setup and keeps stopped or disabled runtime out of the editor', () => {
  const { refresh } = mount();
  const first = screen.getByTitle('Document preview');
  const changedJsx = original.replace('<Counter />', '<Counter count={2} />');
  refresh(changedJsx);
  const second = screen.getByTitle('Document preview');
  expect(second).not.toBe(first);
  expect(second.getAttribute('srcdoc')).toContain('<Counter count={2} />');
  const changedSetup = changedJsx.replace('() => 1', '() => 2');
  refresh(changedSetup);
  const third = screen.getByTitle('Document preview');
  expect(third).not.toBe(second);
  expect(third.getAttribute('srcdoc')).toContain('() => 2');
  refresh(changedSetup, true);
  expect(screen.queryByTitle('Document preview')).toBeNull();
  refresh(original, true);
  expect(screen.queryByTitle('Document preview')).toBeNull();
  refresh(original, false, false);
  expect(screen.queryByTitle('Document preview')).toBeNull();
});

it('restarts the active island on explicit Rebuild with identical executable source', () => {
  const { refresh } = mount();
  const before = screen.getByTitle('Document preview');
  refresh(original, false, true, 1);
  const rebuilt = screen.getByTitle('Document preview');
  expect(rebuilt).not.toBe(before);
  expect(rebuilt.getAttribute('srcdoc')).toBe(before.getAttribute('srcdoc'));
  refresh(original, true, true, 2);
  expect(screen.queryByTitle('Document preview')).toBeNull();
  refresh(original, false, false, 3);
  expect(screen.queryByTitle('Document preview')).toBeNull();
});
