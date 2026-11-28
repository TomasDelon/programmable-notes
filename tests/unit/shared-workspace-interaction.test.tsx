import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
} from '@testing-library/react';
import { createRef } from 'react';
import { expect, it, vi } from 'vitest';
import {
  useWorkspaceInteraction,
  type WorkspaceInteractionInput,
} from '../../src/product/useWorkspaceInteraction';
import { DocumentCommandPalette } from '../../src/product/DocumentCommandPalette';
import {
  AppearanceSettings,
  CorePluginSettings,
} from '../../src/product/CorePluginSettings';
import type { EditorCommands } from '../../src/editor/SourceEditor';
import { FileText } from 'lucide-react';

it('shares command filtering and formatting actions rather than maintaining a second product list', async () => {
  const module = await import('../../src/product/useWorkspaceInteraction');
  expect(module).toHaveProperty('filterDocumentCommands');
  expect(module).toHaveProperty('documentFormattingCommands');
  const commands = module.documentFormattingCommands(true, 'preview');
  expect(module.filterDocumentCommands(commands, ' EQUATION ')).toEqual([
    expect.objectContaining({ id: 'action:format:math' }),
  ]);
  expect(module.documentFormattingCommands(false, 'preview')).toEqual([]);
  expect(module.documentFormattingCommands(true, 'source')).toEqual([]);
});

function interactionInput(
  overrides: Partial<WorkspaceInteractionInput> = {},
): WorkspaceInteractionInput {
  return {
    selected: 'one.md',
    mode: 'source',
    canLeave: () => true,
    documentPath: (id) => (id === 'one.md' || id === 'two.md' ? id : null),
    selectDocument: vi.fn(),
    setMode: vi.fn(),
    sourcePanel: createRef<HTMLDivElement>(),
    documentScroll: createRef<HTMLDivElement>(),
    commands: createRef<EditorCommands>(),
    isCurrentSource: () => true,
    onError: vi.fn(),
    ...overrides,
  };
}

it('checks live admission before opening, switching mode or dispatching document commands', async () => {
  let pending = false;
  const input = interactionInput({ canLeave: () => !pending });
  const { result } = renderHook(() => useWorkspaceInteraction(input));
  pending = true;
  await act(async () => {
    await result.current.openDocument('two.md');
    result.current.switchMode('preview');
    result.current.runCommand(
      { id: 'document:two.md' },
      () => {},
      () => {},
    );
  });
  expect(input.selectDocument).not.toHaveBeenCalled();
  expect(input.setMode).not.toHaveBeenCalled();
  expect(result.current.visitHistory.entries).toEqual(['one.md']);
});

it('does not record a failed opening and reports failure from palette dispatch', async () => {
  const reason = Error('native acquisition refused');
  const input = interactionInput({
    selectDocument: () => Promise.reject(reason),
  });
  const { result } = renderHook(() => useWorkspaceInteraction(input));
  await act(async () => {
    result.current.runCommand(
      { id: 'document:two.md' },
      () => {},
      () => {},
    );
    await Promise.resolve();
  });
  expect(input.onError).toHaveBeenCalledWith(reason);
  expect(result.current.visitHistory.entries).toEqual(['one.md']);
});

it('withdraws a stale source reveal instead of moving focus into changed text', () => {
  const revealSource = vi.fn();
  const commands = { current: { revealSource } as unknown as EditorCommands };
  const first = interactionInput({
    selected: 'one.md',
    commands,
    isCurrentSource: () => false,
  });
  const mounted = renderHook((input) => useWorkspaceInteraction(input), {
    initialProps: first,
  });
  mounted.result.current.pendingLocation.current = {
    key: 'two.md',
    offset: 5,
    source: 'old source',
  };
  mounted.rerender({ ...first, selected: 'two.md' });
  expect(revealSource).not.toHaveBeenCalled();
  expect(mounted.result.current.pendingLocation.current).toBeNull();
});

it('retires an awaited opening when its application is replaced', async () => {
  let finish!: () => void;
  const first = interactionInput({
    scope: {},
    selectDocument: () =>
      new Promise<void>((resolve) => {
        finish = resolve;
      }),
  });
  const mounted = renderHook((input) => useWorkspaceInteraction(input), {
    initialProps: first,
  });
  let opening!: Promise<void>;
  act(() => {
    opening = mounted.result.current.openDocument('two.md');
  });
  const replacement = interactionInput({
    scope: {},
    selected: 'replacement.ts',
    documentPath: (id) => (id === 'replacement.ts' ? id : null),
  });
  mounted.rerender(replacement);
  await act(async () => {
    finish();
    await opening;
  });
  expect(replacement.setMode).not.toHaveBeenCalled();
  expect(mounted.result.current.visitHistory.entries).not.toContain('two.md');
});

it('command keyboard navigation executes the selected enabled command', () => {
  const run = vi.fn();
  const commands = [
    { id: 'one', name: 'One', description: 'first', icon: FileText },
    { id: 'two', name: 'Two', description: 'second', icon: FileText },
  ];
  const mounted = render(
    <DocumentCommandPalette
      query=""
      index={0}
      results={commands}
      onQuery={() => {}}
      onIndex={(index) =>
        mounted.rerender(
          <DocumentCommandPalette
            query=""
            index={index}
            results={commands}
            onQuery={() => {}}
            onIndex={() => {}}
            onRun={run}
            onClose={() => {}}
          />,
        )
      }
      onRun={run}
      onClose={() => {}}
    />,
  );
  const input = screen.getByRole('textbox', {
    name: 'Search commands and notes',
  });
  fireEvent.keyDown(input, { key: 'ArrowDown' });
  fireEvent.keyDown(input, { key: 'Enter' });
  expect(run).toHaveBeenCalledWith(commands[1]);
});

it('shared plugin and appearance settings dispatch explicit preferences only', () => {
  const plugin = vi.fn(),
    reactDisabled = vi.fn(),
    source = vi.fn(),
    theme = vi.fn();
  render(
    <>
      <CorePluginSettings onPlugin={plugin} onReactDisabled={reactDisabled} />
      <AppearanceSettings theme="dark" onTheme={theme} onSource={source} />
    </>,
  );
  fireEvent.click(screen.getByRole('checkbox', { name: /React components/ }));
  expect(reactDisabled).toHaveBeenCalledOnce();
  expect(plugin).toHaveBeenCalledWith('react', false);
  fireEvent.click(
    screen.getByRole('checkbox', { name: /Show component source in Preview/ }),
  );
  expect(source).toHaveBeenCalledWith(true);
  fireEvent.click(screen.getByRole('button', { name: 'Light' }));
  expect(theme).toHaveBeenCalledWith('light');
});
