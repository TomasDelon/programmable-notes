// Historical rejected-shell implementation coverage, not the product contract.
// Migrate useful scenarios to the shared product; Split/X are not target UX.
import {
  cleanup,
  fireEvent,
  render,
  screen,
  within,
} from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import {
  NativeWorkspaceShell,
  type NativeWorkspaceShellProps,
} from '../../src/desktop/NativeWorkspaceShell';

afterEach(cleanup);

function props(): NativeWorkspaceShellProps {
  return {
    documents: [
      {
        key: 'notes/first.mdx',
        name: 'First note',
        source: 'A quiet page.',
        dirty: true,
      },
      {
        key: 'notes/second.mdx',
        name: 'Second note',
        source: 'A unique sentence.',
      },
    ],
    selected: 'notes/first.mdx',
    title: 'First note',
    mode: 'visual',
    canVisual: true,
    children: <div data-testid="owned-editor">Owned editor</div>,
    onSelect: vi.fn(),
    onModeChange: vi.fn(),
    onNew: vi.fn(),
    onOpenFiles: vi.fn(),
    onOpenFolder: vi.fn(),
    onSave: vi.fn(),
    onSaveAs: vi.fn(),
    onSettings: vi.fn(),
  };
}

it('uses the existing workspace canvas with a passive title and no legacy dashboard or runtime', () => {
  render(<NativeWorkspaceShell {...props()} />);
  expect(screen.getByRole('main', { name: 'Document workspace' })).toHaveClass(
    'main-panel',
  );
  expect(
    screen.getByRole('heading', { name: 'First note', level: 1 }),
  ).toHaveClass('doc-title-text');
  expect(screen.getByTestId('owned-editor')).toBeVisible();
  expect(
    document.querySelector('iframe,textarea,[contenteditable]'),
  ).toBeNull();
  expect(screen.queryByText(/Experimental Linux desktop preview/)).toBeNull();
});

it('opens the sidebar, filters source content and navigates through owner callbacks', () => {
  const value = props();
  render(<NativeWorkspaceShell {...value} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open left panel' }));
  const navigation = screen.getByRole('complementary', {
    name: 'Workspace navigation',
  });
  expect(
    within(navigation).getByRole('button', { name: 'Open First note' }),
  ).toHaveAttribute('aria-current', 'page');
  expect(
    within(navigation).getByLabelText('Unsaved changes'),
  ).toBeInTheDocument();
  fireEvent.change(
    screen.getByRole('searchbox', { name: 'Search notes and content' }),
    { target: { value: 'unique' } },
  );
  expect(screen.queryByRole('button', { name: 'Open First note' })).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Open Second note' }));
  expect(value.onSelect).toHaveBeenCalledWith('notes/second.mdx');
});

it('delegates document actions and mode changes without implementing storage or execution', () => {
  const value = props();
  render(<NativeWorkspaceShell {...value} />);
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  expect(value.onModeChange).toHaveBeenCalledWith('source');
  fireEvent.click(screen.getByRole('button', { name: 'Split' }));
  expect(value.onModeChange).toHaveBeenCalledWith('split');
  fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));
  for (const [name, handler] of [
    ['New note', value.onNew],
    ['Open files', value.onOpenFiles],
    ['Open notes folder', value.onOpenFolder],
    ['Save source', value.onSave],
    ['Save As', value.onSaveAs],
    ['Settings', value.onSettings],
  ] as const) {
    fireEvent.click(screen.getByRole('button', { name }));
    expect(handler).toHaveBeenCalledOnce();
  }
});

it('keeps recovery and settings mounted while panels are collapsed', () => {
  render(
    <NativeWorkspaceShell
      {...props()}
      recovery={<span data-testid="recovery">Recovery content</span>}
      settings={<span data-testid="settings">Settings content</span>}
    />,
  );
  expect(screen.getByTestId('recovery')).toBeInTheDocument();
  expect(screen.getByTestId('settings')).toBeInTheDocument();
});

it('blocks source-changing callbacks during native exclusion while navigation controls remain operable', () => {
  const value = props();
  render(<NativeWorkspaceShell {...value} disabled />);
  fireEvent.click(screen.getByRole('button', { name: 'Show document modes' }));
  expect(screen.getByRole('button', { name: 'Source' })).toBeDisabled();
  fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));
  for (const name of [
    'New note',
    'Open files',
    'Open notes folder',
    'Save source',
    'Save As',
  ]) {
    expect(screen.getByRole('button', { name })).toBeDisabled();
  }
  expect(value.onModeChange).not.toHaveBeenCalled();
});

it('changes appearance in memory without browser document storage', () => {
  render(<NativeWorkspaceShell {...props()} />);
  expect(document.documentElement.dataset.theme).toBe('dark');
  fireEvent.click(screen.getByRole('button', { name: 'Open right panel' }));
  fireEvent.click(
    screen.getByRole('button', { name: 'Switch to light theme' }),
  );
  expect(document.documentElement.dataset.theme).toBe('light');
  fireEvent.click(screen.getByRole('button', { name: 'Switch to dark theme' }));
  expect(document.documentElement.dataset.theme).toBe('dark');
});

it('opens modes when a real pointer enters the handle before clicking it', () => {
  const value = props();
  render(<NativeWorkspaceShell {...value} />);
  const handle = screen.getByRole('button', { name: 'Show document modes' });
  fireEvent.mouseEnter(handle.closest('.mode-island')!);
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(screen.getByRole('button', { name: 'Source' }));
  expect(value.onModeChange).toHaveBeenCalledWith('source');
  expect(handle).toHaveAttribute('aria-expanded', 'false');
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'true');
  fireEvent.click(handle);
  expect(handle).toHaveAttribute('aria-expanded', 'false');
});

it('closes the mode picker with Escape before closing an open navigation panel', () => {
  render(<NativeWorkspaceShell {...props()} />);
  fireEvent.click(screen.getByRole('button', { name: 'Open left panel' }));
  const handle = screen.getByRole('button', { name: 'Show document modes' });
  fireEvent.click(handle);
  fireEvent.keyDown(handle, { key: 'Escape' });
  expect(handle).toHaveAttribute('aria-expanded', 'false');
  expect(
    screen.getByRole('button', { name: 'Close left panel' }),
  ).toBeInTheDocument();
});
