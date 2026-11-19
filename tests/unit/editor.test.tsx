import { render, fireEvent, screen } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { MarkdownEditor } from '../../src/editor/MarkdownEditor';
it('does not report programmatic source replacement as a user edit', () => {
  const change = vi.fn();
  const view = render(<SourceEditor source="first" onChange={change} />);
  view.rerender(<SourceEditor source={'second\r\nline'} onChange={change} />);
  expect(change).not.toHaveBeenCalled();
});

it('retains unapplied text when its original mapping disappears and allows explicit cancellation', () => {
  const pending = vi.fn();
  const apply = vi.fn(() => false);
  const view = render(
    <MarkdownEditor
      source="Original paragraph."
      active
      apply={apply}
      onPendingChange={pending}
    />,
  );
  fireEvent.click(screen.getByRole('button', { name: 'Original paragraph.' }));
  fireEvent.change(screen.getByRole('textbox', { name: 'Paragraph text' }), {
    target: { value: 'Keep this pending value.' },
  });
  expect(pending).toHaveBeenLastCalledWith(true);
  view.rerender(
    <MarkdownEditor
      source="<Broken"
      active
      apply={apply}
      onPendingChange={pending}
    />,
  );
  const field = screen.getByRole('textbox', { name: 'Paragraph text' });
  expect(field).toHaveValue('Keep this pending value.');
  expect(apply).not.toHaveBeenCalled();
  view.rerender(
    <MarkdownEditor
      source="<Broken"
      active
      busy
      apply={apply}
      onPendingChange={pending}
    />,
  );
  expect(field).toBeDisabled();
  expect(field).toHaveValue('Keep this pending value.');
  view.rerender(
    <MarkdownEditor
      source="<Broken"
      active
      apply={apply}
      onPendingChange={pending}
    />,
  );
  expect(field).toBeEnabled();
  fireEvent.keyDown(field, { key: 'Enter' });
  expect(screen.getByRole('alert')).toHaveTextContent('Paragraph changed');
  expect(field).toHaveValue('Keep this pending value.');
  fireEvent.keyDown(field, { key: 'Escape' });
  expect(pending).toHaveBeenLastCalledWith(false);
  expect(
    screen.queryByRole('textbox', { name: 'Paragraph text' }),
  ).not.toBeInTheDocument();
});
