import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { NotificationProvider } from '../../src/ui/Notifications';
import { useNotifications } from '../../src/ui/useNotifications';

function Controls() {
  const { notify, dismiss } = useNotifications();
  return (
    <>
      <input aria-label="Writing" />
      <button
        onClick={() =>
          notify({
            id: 'save',
            message: 'Saved safely',
            tone: 'success',
            duration: 1000,
          })
        }
      >
        Save
      </button>
      <button
        onClick={() =>
          notify({
            id: 'error',
            message: 'Your text is retained',
            tone: 'error',
            persistent: true,
            detail: 'A stale revision was refused.',
          })
        }
      >
        Fail
      </button>
      <button onClick={() => dismiss('error')}>Resolve</button>
    </>
  );
}
const setup = () =>
  render(
    <NotificationProvider>
      <Controls />
    </NotificationProvider>,
  );
afterEach(() => vi.useRealTimers());

it('announces feedback without stealing typing focus and animates dismissal', () => {
  vi.useFakeTimers();
  setup();
  const input = screen.getByLabelText('Writing');
  input.focus();
  fireEvent.click(screen.getByText('Save'));
  expect(screen.getByRole('status')).toHaveTextContent('Saved safely');
  expect(document.activeElement).toBe(input);
  act(() => vi.advanceTimersByTime(1000));
  expect(screen.getByRole('status')).toHaveAttribute('data-leaving', 'true');
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});
it('deduplicates persistent errors and keeps details behind an explicit action', () => {
  vi.useFakeTimers();
  setup();
  fireEvent.click(screen.getByText('Fail'));
  fireEvent.click(screen.getByText('Fail'));
  expect(screen.getAllByRole('alert')).toHaveLength(1);
  act(() => vi.advanceTimersByTime(30000));
  expect(screen.getByRole('alert')).toHaveTextContent('Your text is retained');
  expect(screen.queryByRole('dialog')).not.toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Details' }));
  expect(screen.getByRole('dialog')).toHaveTextContent(
    'A stale revision was refused.',
  );
  fireEvent.click(screen.getByRole('button', { name: 'Close details' }));
  fireEvent.click(screen.getByText('Resolve'));
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole('alert')).not.toBeInTheDocument();
});
it('pauses automatic dismissal while a notification is being used', () => {
  vi.useFakeTimers();
  setup();
  fireEvent.click(screen.getByText('Save'));
  const item = screen.getByRole('status');
  fireEvent.pointerEnter(item);
  act(() => vi.advanceTimersByTime(5000));
  expect(item).not.toHaveAttribute('data-leaving', 'true');
  fireEvent.pointerLeave(item);
  act(() => vi.advanceTimersByTime(1000));
  expect(item).toHaveAttribute('data-leaving', 'true');
  act(() => vi.advanceTimersByTime(200));
  expect(screen.queryByRole('status')).not.toBeInTheDocument();
});

it('keeps a keyboard-focused notification alive after the pointer leaves', () => {
  vi.useFakeTimers();
  setup();
  fireEvent.click(screen.getByText('Save'));
  const item = screen.getByRole('status');
  act(() =>
    screen.getByRole('button', { name: 'Dismiss notification' }).focus(),
  );
  fireEvent.pointerEnter(item);
  fireEvent.pointerLeave(item);
  act(() => vi.advanceTimersByTime(5000));
  expect(item).not.toHaveAttribute('data-leaving', 'true');
});
