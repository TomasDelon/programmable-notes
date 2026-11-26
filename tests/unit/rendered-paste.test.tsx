import { act, fireEvent, render, screen } from '@testing-library/react';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import {
  RenderedEditor,
  type RenderedCommands,
} from '../../src/editor/rendered/RenderedEditor';
import { NotificationProvider } from '../../src/ui/Notifications';

it('leaves the caret at the end of a pasted paragraph before a list', () => {
  const source = 'Readings begin here.\n\n* Unchanged sample\n';
  const apply = vi.fn(() => true);
  render(
    <RenderedEditor
      source={source}
      path="note.md"
      active
      disabled={false}
      commandsRef={createRef<RenderedCommands>()}
      runtime={{
        files: { 'note.md': source },
        entry: 'note.md',
        theme: 'light',
        images: [],
        stopped: true,
      }}
      wikilinks={[]}
      apply={apply}
      undo={vi.fn()}
      redo={vi.fn()}
      openSource={vi.fn()}
    />,
    { wrapper: NotificationProvider },
  );
  const editor = screen.getByRole('textbox', { name: 'Editable document' });
  const selection = document.getSelection()!;
  const initial = editor.querySelector('p')!.firstChild!;
  act(() => {
    editor.focus();
    selection.setBaseAndExtent(
      initial,
      0,
      initial,
      initial.textContent!.length,
    );
    document.dispatchEvent(new Event('selectionchange'));
  });
  const pasted = 'Readings begin here.\nCheck the temperature.';
  fireEvent.paste(editor, {
    clipboardData: {
      files: [],
      getData: (type: string) => (type === 'text/plain' ? pasted : ''),
    },
  });
  expect(apply).toHaveBeenCalledWith(
    source,
    pasted + '\n\n* Unchanged sample\n',
    false,
  );
  const paragraph = editor.querySelector('p')!;
  expect(selection.isCollapsed).toBe(true);
  expect(selection.focusNode).toBe(paragraph.lastChild);
  expect(selection.focusOffset).toBe(paragraph.lastChild!.textContent!.length);
});
