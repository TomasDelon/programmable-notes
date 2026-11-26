import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { EditorView as RenderedView } from 'prosemirror-view';
import { TextSelection } from 'prosemirror-state';
import { historyField, isolateHistory } from '@codemirror/commands';
import { createRef } from 'react';
import { beforeEach, afterEach, expect, it, vi } from 'vitest';
import {
  SourceEditor,
  type EditorCommands,
} from '../../src/editor/SourceEditor';
import type {
  SourceSession,
  SourceWitness,
} from '../../src/editor/sourceWitness';
import { explicitRawSource, rawSource } from '../../src/editor/live/rawSource';
import { NotificationProvider } from '../../src/ui/Notifications';
import { parseSourceWikilinks, resolveWikilinks } from '../../src/links';

vi.mock('../../src/editor/rendered/RenderedRuntime', () => ({
  RenderedRuntime: () => null,
}));

function host(source = 'A', sessionId = 'session-a') {
  let current: SourceWitness = { sessionId, editorRevision: 0, source };
  let active = true;
  const isCurrent = (witness: SourceWitness) =>
    active &&
    witness.sessionId === current.sessionId &&
    witness.editorRevision === current.editorRevision &&
    witness.source === current.source;
  const validate = vi.fn((batch: Parameters<SourceSession['validate']>[0]) =>
    isCurrent(batch.expected),
  );
  const publish = vi.fn((batch: Parameters<SourceSession['publish']>[0]) => {
    if (!isCurrent(batch.expected)) throw Error('stale publication');
    current = {
      ...current,
      editorRevision: current.editorRevision + 1,
      source: batch.source,
    };
    return current;
  });
  const retainFailure = vi.fn();
  return {
    current: () => current,
    external: (source: string) => {
      current = {
        ...current,
        source,
        editorRevision: current.editorRevision + 1,
      };
    },
    retire: () => {
      active = false;
    },
    validate,
    publish,
    retainFailure,
    session: (witness = current): SourceSession => ({
      witness,
      isCurrent,
      validate,
      publish,
      retainFailure,
    }),
  };
}

const rects = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getClientRects',
);
const rect = Object.getOwnPropertyDescriptor(
  Range.prototype,
  'getBoundingClientRect',
);
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
afterEach(() => {
  for (const [key, descriptor] of [
    ['getClientRects', rects],
    ['getBoundingClientRect', rect],
  ] as const) {
    if (descriptor) Object.defineProperty(Range.prototype, key, descriptor);
    else Reflect.deleteProperty(Range.prototype, key);
  }
});

function mount(owned = host(), preview = false) {
  const commands = createRef<EditorCommands>();
  const legacy = vi.fn();
  const draw = (witness = owned.current()) => (
    <SourceEditor
      source={witness.source}
      session={owned.session(witness)}
      documentKey="note.mdx"
      commandsRef={commands}
      onChange={legacy}
      rendered={
        preview
          ? {
              active: true,
              files: { 'note.mdx': witness.source },
              entry: 'note.mdx',
              theme: 'light',
              images: [],
              stopped: true,
            }
          : undefined
      }
    />
  );
  const ui = render(draw(), { wrapper: NotificationProvider });
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  return { owned, commands, legacy, draw, ui, cm };
}

it('publishes exactly one authoritative receipt for an accepted net-zero batch, before dispatch returns', () => {
  const { cm, owned, legacy } = mount();
  const before = cm.state;
  const one = before.update({ changes: { from: 1, insert: 'B' } });
  const two = one.state.update({ changes: { from: 1, to: 2 } });
  act(() => cm.dispatch([one, two]));
  expect(owned.publish).toHaveBeenCalledTimes(1);
  expect(owned.current()).toEqual({
    sessionId: 'session-a',
    editorRevision: 1,
    source: 'A',
  });
  expect(legacy).not.toHaveBeenCalled();
  act(() => cm.dispatch({ selection: { anchor: 0 } }));
  expect(owned.publish).toHaveBeenCalledTimes(1);
});

it('rejects a whole batch without consuming history and refuses retired sessions', () => {
  const { cm, owned } = mount();
  owned.validate.mockImplementation((batch) => batch.source !== 'ABC');
  const before = cm.state;
  const first = before.update({ changes: { from: 1, insert: 'B' } });
  const second = first.state.update({ changes: { from: 2, insert: 'C' } });
  act(() => cm.dispatch([first, second]));
  expect(cm.state).toBe(before);
  expect(cm.state.field(historyField)).toBe(before.field(historyField));
  expect(owned.publish).not.toHaveBeenCalled();
  owned.validate.mockImplementation((batch) =>
    owned.session().isCurrent(batch.expected),
  );
  owned.retire();
  act(() => cm.dispatch({ changes: { from: 1, insert: 'late' } }));
  expect(rawSource(cm.state)).toBe('A');
});

it('uses synchronous receipts for rapid visual edits while old props and echoes lag', () => {
  const { owned, commands, cm, ui, draw, legacy } = mount(
    host('\uFEFF# Heading\r\n\r\nBody.\r\n'),
    true,
  );
  const original = owned.current();
  act(() => {
    expect(commands.current!.insertText('First')).toBe(true);
  });
  const earlier = owned.current();
  act(() => {
    expect(commands.current!.insertText('Second')).toBe(true);
  });
  const latest = owned.current();
  expect(latest.editorRevision).toBe(2);
  ui.rerender(draw(earlier));
  ui.rerender(draw(original));
  act(() => {
    expect(commands.current!.insertText('Third')).toBe(true);
  });
  expect(owned.current().editorRevision).toBe(3);
  expect(rawSource(cm.state)).toBe(owned.current().source);
  expect(owned.current().source).toContain('\r\n');
  expect(legacy).not.toHaveBeenCalled();
  expect(
    screen.queryByRole('button', { name: 'Review draft' }),
  ).not.toBeInTheDocument();
});

it('rejects same-byte ABA projections and source navigation until their newer witness is adopted', () => {
  const { owned, cm, commands, ui, draw } = mount(host('Original.'), true);
  const original = owned.current();
  act(() =>
    cm.dispatch({
      changes: { from: cm.state.doc.length, insert: 'X' },
      annotations: isolateHistory.of('full'),
    }),
  );
  act(() => commands.current!.undo());
  expect(owned.current().source).toBe(original.source);
  expect(owned.current().editorRevision).toBe(2);
  act(() => commands.current!.revealSource(4, original.source, original));
  expect(cm.state.selection.main.anchor).not.toBe(4);
  act(() => {
    expect(commands.current!.insertText('Stale')).toBe(false);
  });
  expect(owned.current().source).toBe(original.source);
  expect(
    screen.getByRole('button', { name: 'Review draft' }),
  ).toBeInTheDocument();
  // New echo is provenance adoption, not a third accepted transaction.
  ui.rerender(draw());
  expect(owned.publish).toHaveBeenCalledTimes(2);
});

it('adopts newer same-byte external provenance without republishing or losing the next visual edit', () => {
  const { owned, commands, ui, draw, cm } = mount(host('Body.'), true);
  const old = owned.current();
  owned.external(old.source);
  ui.rerender(draw());
  expect(owned.publish).not.toHaveBeenCalled();
  act(() => {
    expect(commands.current!.insertText('Current')).toBe(true);
  });
  expect(owned.current().editorRevision).toBe(2);
  const newest = owned.current();
  ui.rerender(draw(old));
  expect(rawSource(cm.state)).toBe(newest.source);
});

it.each(['throw', 'malformed', 'publish-then-throw'] as const)(
  'retains failed publication bytes and latches pending across child cleanup for %s',
  (failure) => {
    const owned = host('\uFEFFBody.\r\n');
    const original = owned.current();
    const realPublish = owned.publish.getMockImplementation()!;
    owned.publish.mockImplementation((batch) => {
      if (failure === 'publish-then-throw') realPublish(batch);
      if (failure === 'malformed')
        return { ...batch.expected, source: batch.source };
      throw Error('synthetic publisher failure');
    });
    const pending = vi.fn();
    const histories = {
      current:
        new Map() as import('../../src/editor/SourceEditor').EditorHistory,
    };
    const commands = createRef<EditorCommands>();
    const draw = (preview: boolean) => (
      <SourceEditor
        source={original.source}
        session={owned.session(original)}
        onChange={() => {}}
        onPendingChange={pending}
        commandsRef={commands}
        histories={histories}
        documentKey="note.mdx"
        rendered={
          preview
            ? {
                active: true,
                files: { 'note.mdx': original.source },
                entry: 'note.mdx',
                theme: 'light',
                images: [],
                stopped: true,
              }
            : undefined
        }
      />
    );
    const ui = render(draw(true), { wrapper: NotificationProvider });
    const cm = EditorView.findFromDOM(
      ui.container.querySelector('.cm-editor')!,
    )!;
    act(() =>
      cm.dispatch({
        changes: { from: cm.state.doc.length, insert: 'failed text' },
      }),
    );
    const failed = rawSource(cm.state);
    expect(failed).toBe(original.source + 'failed text');
    expect(owned.retainFailure).toHaveBeenCalledWith({
      expected: original,
      source: failed,
    });
    ui.rerender(draw(false)); // RenderedEditor cleanup emits pending(false).
    expect(pending).toHaveBeenLastCalledWith(true);
    expect(rawSource(cm.state)).toBe(failed);
    act(() =>
      cm.dispatch({
        changes: { from: cm.state.doc.length, insert: 'blocked' },
      }),
    );
    expect(rawSource(cm.state)).toBe(failed);
    const closing = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(closing);
    expect(closing.defaultPrevented).toBe(true);
    ui.unmount();
    expect(histories.current!.has(original.sessionId)).toBe(false);
    expect(owned.retainFailure.mock.calls[0]![0].source).toBe(failed);
  },
);

it('keeps an IME base stale through a same-byte external revision and retains its attempted text', async () => {
  const { owned, ui, draw } = mount(host('Original.'), true);
  const pm = ui.container.querySelector<HTMLElement>('.ProseMirror')!;
  fireEvent.compositionStart(pm);
  await act(async () => {
    pm.querySelector('p')!.textContent = 'Composed attempt.';
    pm.dispatchEvent(
      new InputEvent('input', {
        bubbles: true,
        inputType: 'insertCompositionText',
        data: 'Composed attempt.',
        isComposing: true,
      }),
    );
    await Promise.resolve();
  });
  owned.external('Original.');
  ui.rerender(draw());
  fireEvent.compositionEnd(pm);
  await act(async () => {
    await new Promise((resolve) => requestAnimationFrame(resolve));
  });
  expect(owned.publish).not.toHaveBeenCalled();
  expect(owned.current().source).toBe('Original.');
  fireEvent.click(screen.getByRole('button', { name: 'Review draft' }));
  expect(
    (
      screen.getByRole('textbox', {
        name: 'Unapplied text',
      }) as HTMLTextAreaElement
    ).value,
  ).toContain('Composed attempt.');
});

it('rejects an old link selection after same-byte provenance changes and keeps its URL', () => {
  const { owned, commands, ui, draw } = mount(host('Link target.'), true);
  act(() => commands.current!.formatRendered!('link'));
  fireEvent.change(screen.getByRole('textbox', { name: 'Link URL' }), {
    target: { value: 'https://example.invalid/retained' },
  });
  owned.external('Link target.');
  ui.rerender(draw());
  fireEvent.click(screen.getByRole('button', { name: 'Apply link' }));
  expect(owned.publish).not.toHaveBeenCalled();
  expect(screen.getByRole('textbox', { name: 'Link URL' })).toHaveValue(
    'https://example.invalid/retained',
  );
});

it('refuses mixed external and user transactions before updating either state or history', () => {
  const { owned, ui, draw, cm } = mount();
  const originalState = cm.state;
  const update = vi.spyOn(cm, 'update').mockImplementationOnce(() => {});
  owned.external('External');
  ui.rerender(draw());
  const external = update.mock.calls[0]![0][0]!;
  update.mockRestore();
  const local = external.state.update({
    changes: { from: external.state.doc.length, insert: 'local' },
  });
  act(() => cm.dispatch([external, local]));
  expect(cm.state).toBe(originalState);
  expect(owned.publish).not.toHaveBeenCalled();
});

it('returns receipts through normal Markdown, literal-dollar promotion and math-dollar insertion without prop echoes', () => {
  const tracking = vi.spyOn(RenderedView.prototype, 'updateState');
  const { owned, commands, cm } = mount(host('Tail.'), true);
  act(() => {
    expect(commands.current!.insertText('Seed')).toBe(true);
  });
  const pm = tracking.mock.contexts.at(-1)! as RenderedView;
  tracking.mockRestore();
  const input = (text: string) => {
    let handled = false;
    act(() => {
      const { from, to } = pm.state.selection;
      pm.someProp('handleTextInput', (handler) => {
        handled = Boolean(
          handler(pm, from, to, text, () => pm.state.tr.insertText(text)),
        );
        return handled;
      });
    });
    expect(handled).toBe(true);
    expect(rawSource(cm.state)).toBe(owned.current().source);
  };
  input('$x');
  input('$');
  let start = -1,
    size = 0;
  pm.state.doc.descendants((node, pos) => {
    if (node.type.name === 'inline_math') {
      start = pos + 1;
      size = node.content.size;
    }
  });
  expect(start).toBeGreaterThan(0);
  act(() =>
    pm.dispatch(
      pm.state.tr.setSelection(
        TextSelection.create(pm.state.doc, start, start + size),
      ),
    ),
  );
  input('$y$');
  expect(owned.current().source).toContain('$y$');
  expect(owned.current().editorRevision).toBe(4);
  expect(owned.publish).toHaveBeenCalledTimes(4);
});

it('restores exact physical-only history and keeps selection-only transactions source-neutral', () => {
  const { owned, cm, commands } = mount(host('\uFEFFBody\r\n'));
  act(() => cm.dispatch({ annotations: explicitRawSource.of('\uFEFFBody\n') }));
  expect(owned.current().editorRevision).toBe(1);
  act(() => commands.current!.undo());
  expect(owned.current()).toMatchObject({
    editorRevision: 2,
    source: '\uFEFFBody\r\n',
  });
  act(() => cm.dispatch({ selection: { anchor: 2 } }));
  expect(owned.current().editorRevision).toBe(2);
});

it('keeps retired same-path session callbacks from reaching a different opening', () => {
  const first = mount(host('First', 'session-first'));
  const oldCommands = first.commands.current!;
  first.owned.retire();
  first.ui.unmount();
  const second = mount(host('Second', 'session-second'));
  act(() => {
    expect(oldCommands.insertText('stale')).toBe(false);
    oldCommands.undo();
    oldCommands.revealSource(2, 'First', {
      sessionId: 'session-first',
      editorRevision: 0,
      source: 'First',
    });
  });
  expect(second.owned.current().source).toBe('Second');
  expect(second.owned.publish).not.toHaveBeenCalled();
});

it('does not fall back to legacy publication when session protocol changes on an existing mount', () => {
  const owned = host();
  owned.validate.mockReturnValue(false);
  const changed = vi.fn();
  const ui = render(<SourceEditor source="A" onChange={changed} />);
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  ui.rerender(
    <SourceEditor source="A" session={owned.session()} onChange={changed} />,
  );
  act(() => cm.dispatch({ changes: { from: 1, insert: 'forbidden' } }));
  expect(changed).not.toHaveBeenCalled();
  expect(owned.publish).not.toHaveBeenCalled();
  expect(rawSource(cm.state)).toBe('A');
});

it('keeps a session mount blocked when its authority is removed or replaced without remounting', () => {
  const { owned, ui, cm } = mount();
  const changed = vi.fn();
  ui.rerender(<SourceEditor source="A" onChange={changed} />);
  act(() => cm.dispatch({ changes: { from: 1, insert: 'removed' } }));
  const other = host('A', 'different-session');
  ui.rerender(
    <SourceEditor source="A" session={other.session()} onChange={changed} />,
  );
  act(() => cm.dispatch({ changes: { from: 1, insert: 'replaced' } }));
  expect(rawSource(cm.state)).toBe('A');
  expect(owned.publish).not.toHaveBeenCalled();
  expect(other.publish).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
});

it('returns refusal from raw insertion after publisher failure while retaining the attempted bytes', () => {
  const { owned, commands, cm } = mount();
  owned.publish.mockImplementation(() => {
    throw Error('synthetic failure');
  });
  act(() => {
    expect(commands.current!.insertText('failed text')).toBe(false);
  });
  expect(rawSource(cm.state)).toBe('failed textA');
  expect(owned.retainFailure).toHaveBeenCalledWith({
    expected: owned.current(),
    source: 'failed textA',
  });
});

it('refuses a captured legacy source-location command after protocol opt-in on the same mount', () => {
  const commands = createRef<EditorCommands>();
  const ui = render(
    <SourceEditor
      source="Original."
      onChange={() => {}}
      commandsRef={commands}
    />,
  );
  const captured = commands.current!;
  const cm = EditorView.findFromDOM(ui.container.querySelector('.cm-editor')!)!;
  const measure = vi
    .spyOn(cm, 'coordsAtPos')
    .mockReturnValue({ left: 0, right: 0, top: 0, bottom: 10 });
  const owned = host('Original.');
  owned.validate.mockReturnValue(false);
  ui.rerender(
    <SourceEditor
      source="Original."
      session={owned.session()}
      onChange={() => {}}
      commandsRef={commands}
    />,
  );
  act(() => captured.revealSource(4, 'Original.'));
  expect(measure).not.toHaveBeenCalled();
  measure.mockRestore();
});

const wikiSource = 'Open [[Target]].';
const resolvedWiki = resolveWikilinks(parseSourceWikilinks(wikiSource), [
  {
    id: 'target-note',
    title: 'Target',
    folder: '',
    trashed: false,
    source: 'Target.',
  },
]);
const wikiRuntime = {
  active: true,
  files: { 'note.mdx': wikiSource },
  entry: 'note.mdx',
  theme: 'light' as const,
  images: [],
  stopped: true,
};

it('refuses a captured legacy wiki navigation after protocol opt-in on the same mount', () => {
  const open = vi.fn();
  const changed = vi.fn();
  const owned = host(wikiSource);
  owned.validate.mockReturnValue(false);
  const draw = (session?: SourceSession) => (
    <SourceEditor
      source={wikiSource}
      onChange={changed}
      session={session}
      onOpenNote={open}
      wikilinks={resolvedWiki}
      rendered={wikiRuntime}
    />
  );
  const ui = render(draw(), { wrapper: NotificationProvider });
  const captured =
    ui.container.querySelector<HTMLButtonElement>('.rendered-wikilink')!;
  expect(captured).not.toBeNull();
  ui.rerender(draw(owned.session()));
  fireEvent.click(captured);
  expect(open).not.toHaveBeenCalled();
  expect(changed).not.toHaveBeenCalled();
  expect(owned.publish).not.toHaveBeenCalled();
});

it.each([
  { sessionId: '', editorRevision: 0 },
  { sessionId: 'invalid', editorRevision: -1 },
  { sessionId: 'invalid', editorRevision: Number.MAX_SAFE_INTEGER + 1 },
  { sessionId: 'invalid', editorRevision: Number.NaN },
])(
  'rejects invalid initial provenance %s before CM mutation despite a permissive host',
  (identity) => {
    const witness: SourceWitness = { ...identity, source: wikiSource };
    const publish = vi.fn((batch: Parameters<SourceSession['publish']>[0]) => ({
      ...witness,
      source: batch.source,
      editorRevision: witness.editorRevision + 1,
    }));
    const session: SourceSession = {
      witness,
      isCurrent: () => true,
      validate: () => true,
      publish,
      retainFailure: vi.fn(),
    };
    const open = vi.fn();
    const diagnostic = vi.fn();
    const ui = render(
      <SourceEditor
        source={wikiSource}
        session={session}
        onChange={() => {}}
        onOpenNote={open}
        onAnalysisDiagnostic={diagnostic}
        wikilinks={resolvedWiki}
        rendered={wikiRuntime}
      />,
      { wrapper: NotificationProvider },
    );
    const cm = EditorView.findFromDOM(
      ui.container.querySelector('.cm-editor')!,
    )!;
    const original = cm.state;
    act(() =>
      cm.dispatch({
        changes: { from: cm.state.doc.length, insert: 'Refused' },
      }),
    );
    fireEvent.click(
      ui.container.querySelector<HTMLButtonElement>('.rendered-wikilink')!,
    );
    expect(cm.state).toBe(original);
    expect(publish).not.toHaveBeenCalled();
    expect(open).not.toHaveBeenCalled();
    expect(diagnostic).not.toHaveBeenCalled();
  },
);
