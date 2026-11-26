import { Blob as NodeBlob } from 'node:buffer';
import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { RetainedEdits } from '../../src/web/RetainedEdits';
import type { RetainedAttempt } from '../../src/web/persistence';

const attempt: RetainedAttempt = {
  id: '2fcb9354-b517-4fb6-9d71-aa830908105a',
  documentKey: 'notes/Unicode.mdx',
  baseRevision: 4,
  baseChecksum: 'a'.repeat(64),
  checksum: 'b'.repeat(64),
  text: '\ufeff# 未適用 🌱\r\n\r\n<button>Not an action</button>\r',
  updated: 1,
};
const props = { attempts: [attempt], error: '' };

afterEach(() => {
  vi.useRealTimers();
  vi.unstubAllGlobals();
});

it('downloads exact retained bytes in a damaged workspace with no restore authority', async () => {
  vi.useFakeTimers();
  const create = vi.fn<(blob: Blob) => string>(() => 'blob:retained');
  const revoke = vi.fn();
  vi.stubGlobal('Blob', NodeBlob);
  vi.stubGlobal(
    'URL',
    class extends URL {
      static createObjectURL = create;
      static revokeObjectURL = revoke;
    },
  );
  const names: string[] = [];
  vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (
    this: HTMLAnchorElement,
  ) {
    names.push(this.download);
  });
  render(
    <RetainedEdits
      {...props}
      disabled
      error="Another retained edit is damaged."
    />,
  );
  expect(screen.getByRole('alert')).toHaveTextContent(
    'Another retained edit is damaged.',
  );
  expect(
    screen.queryByRole('button', { name: 'Restore as new note' }),
  ).toBeNull();
  expect(screen.queryByRole('button', { name: 'Not an action' })).toBeNull();
  fireEvent.click(
    screen.getByRole('button', { name: 'Download retained source' }),
  );
  expect(names).toEqual(['recovered-Unicode.mdx']);
  expect(
    Array.from(new Uint8Array(await create.mock.calls[0]![0].arrayBuffer())),
  ).toEqual(Array.from(new TextEncoder().encode(attempt.text)));
  act(() => vi.runAllTimers());
  expect(revoke).toHaveBeenCalledWith('blob:retained');
});

it('keeps the recovery list on refusal and runs onRestored only after successful publication', async () => {
  const restore = vi
    .fn()
    .mockResolvedValueOnce(false)
    .mockResolvedValueOnce(true);
  const restored = vi.fn();
  render(
    <RetainedEdits {...props} onRestore={restore} onRestored={restored} />,
  );
  const button = screen.getByRole('button', { name: 'Restore as new note' });
  await act(async () => {
    fireEvent.click(button);
  });
  expect(restore).toHaveBeenCalledWith(attempt.id);
  expect(restored).not.toHaveBeenCalled();
  expect(screen.getByRole('alert')).toBeVisible();
  expect(screen.getByText(attempt.documentKey)).toBeVisible();
  await act(async () => {
    fireEvent.click(button);
  });
  expect(restored).toHaveBeenCalledOnce();
});

it('prevents concurrent publication and discard while a restore is pending or externally disabled', async () => {
  let finish!: (saved: boolean) => void;
  const pending = new Promise<boolean>((resolve) => {
    finish = resolve;
  });
  const restore = vi.fn(() => pending);
  const discard = vi.fn();
  const ui = render(
    <RetainedEdits
      {...props}
      disabled
      onRestore={restore}
      onDiscard={discard}
    />,
  );
  const button = screen.getByRole('button', { name: 'Restore as new note' });
  const remove = screen.getByRole('button', { name: 'Discard retained edit' });
  expect(button).toBeDisabled();
  fireEvent.click(button);
  expect(restore).not.toHaveBeenCalled();
  ui.rerender(
    <RetainedEdits {...props} onRestore={restore} onDiscard={discard} />,
  );
  fireEvent.click(button);
  fireEvent.click(button);
  fireEvent.click(remove);
  expect(restore).toHaveBeenCalledOnce();
  expect(remove).toBeDisabled();
  expect(discard).not.toHaveBeenCalled();
  await act(async () => finish(true));
  expect(remove).toBeEnabled();
});

it('preserves a cancelled discard and keeps the entry available after a rejected delete', async () => {
  vi.spyOn(window, 'confirm')
    .mockReturnValueOnce(false)
    .mockReturnValueOnce(true);
  const discard = vi.fn().mockRejectedValue(new Error('Storage unavailable.'));
  render(<RetainedEdits {...props} onDiscard={discard} />);
  const button = screen.getByRole('button', { name: 'Discard retained edit' });
  fireEvent.click(button);
  expect(discard).not.toHaveBeenCalled();
  await act(async () => {
    fireEvent.click(button);
  });
  expect(discard).toHaveBeenCalledWith(attempt.id);
  expect(screen.getByRole('alert')).toHaveTextContent('Storage unavailable.');
  expect(button).toBeEnabled();
});
