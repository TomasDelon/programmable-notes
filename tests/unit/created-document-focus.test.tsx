import { act, fireEvent, render, screen } from '@testing-library/react';
import { useRef, useState } from 'react';
import { expect, it, vi } from 'vitest';
import {
  SourceEditor,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import { useWorkspaceInteraction } from '../../src/product/useWorkspaceInteraction';
import { ProductDialog } from '../../src/ui/ProductDialog';

function fixture() {
  let interaction!: ReturnType<typeof useWorkspaceInteraction>;
  const scope = {};
  function Workspace({
    selected = 'one.mdx',
    owner = scope,
    mode = 'source',
  }: {
    selected?: string;
    owner?: object;
    mode?: 'source' | 'preview';
  }) {
    const panel = useRef<HTMLDivElement>(null);
    interaction = useWorkspaceInteraction({
      scope: owner,
      selected,
      mode,
      canLeave: () => true,
      documentPath: (id) => id,
      selectDocument: () => {},
      setMode: () => {},
      sourcePanel: panel,
      documentScroll: useRef(null),
      commands: useRef<EditorCommands>(null),
      isCurrentSource: () => true,
      onError: vi.fn(),
    });
    return (
      <>
        <button>New document</button>
        <input aria-label="Newer dialog" />
        <div ref={panel}>
          <SourceEditor key={selected} source="" onChange={() => {}} />
        </div>
      </>
    );
  }
  const mounted = render(<Workspace />);
  const button = screen.getByRole('button', { name: 'New document' });
  button.focus();
  return {
    mounted,
    Workspace,
    get interaction() {
      return interaction;
    },
  };
}

it('focuses the newly mounted real source editor without an animation frame', () => {
  const view = fixture();
  const oldEditor = screen.getByRole('textbox', { name: 'MDX source' });
  act(() => view.interaction.focusCreatedDocument('two.mdx'));
  view.mounted.rerender(<view.Workspace selected="two.mdx" />);
  const editor = screen.getByRole('textbox', { name: 'MDX source' });
  expect(editor).not.toBe(oldEditor);
  expect(editor).toHaveFocus();
  const newer = screen.getByRole('textbox', { name: 'Newer dialog' });
  newer.focus();
  view.mounted.rerender(<view.Workspace selected="two.mdx" />);
  expect(newer).toHaveFocus();
});

it('does not replace a newer dialog focus with creation focus', () => {
  const view = fixture();
  act(() => view.interaction.focusCreatedDocument('two.mdx'));
  const dialog = screen.getByRole('textbox', { name: 'Newer dialog' });
  dialog.focus();
  view.mounted.rerender(<view.Workspace selected="two.mdx" />);
  expect(dialog).toHaveFocus();
});

it('retires creation focus when a newer document navigation wins', () => {
  const view = fixture();
  act(() => {
    view.interaction.focusCreatedDocument('two.mdx');
    void view.interaction.openDocument('three.mdx');
  });
  view.mounted.rerender(<view.Workspace selected="three.mdx" />);
  expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
});

it('retires creation focus when the workspace owner changes', () => {
  const view = fixture();
  act(() => view.interaction.focusCreatedDocument('two.mdx'));
  view.mounted.rerender(<view.Workspace owner={{}} selected="two.mdx" />);
  expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
});

it('retires creation focus when a newer preview intent wins', () => {
  const view = fixture();
  act(() => {
    view.interaction.focusCreatedDocument('two.mdx');
    view.interaction.switchMode('preview');
  });
  view.mounted.rerender(<view.Workspace selected="two.mdx" />);
  expect(screen.getByRole('button', { name: 'New document' })).toHaveFocus();
});

it('restores ordinary dialog focus on Escape when no creation handoff owns it', () => {
  function DialogFixture() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button onClick={() => setOpen(true)}>Open dialog</button>
        {open && (
          <ProductDialog title="Ordinary dialog" onClose={() => setOpen(false)}>
            <input aria-label="Dialog input" />
          </ProductDialog>
        )}
      </>
    );
  }
  render(<DialogFixture />);
  const opener = screen.getByRole('button', { name: 'Open dialog' });
  opener.focus();
  fireEvent.click(opener);
  fireEvent.keyDown(screen.getByRole('textbox', { name: 'Dialog input' }), {
    key: 'Escape',
  });
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  expect(opener).toHaveFocus();
});
