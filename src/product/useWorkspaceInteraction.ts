import { Pencil } from 'lucide-react';
import type { DocumentCommand } from './DocumentCommandPalette';
import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import type { EditorCommands } from '../editor/SourceEditor';
import { isMdxSource } from '../sourceTypes';

export interface WorkspaceInteractionInput {
  /** Bootstrap/controller identity, not document content or a storage projection. */
  scope?: object;
  selected: string | null;
  selectedId?(): string | null;
  mode: 'source' | 'preview';
  canLeave(): boolean;
  documentPath(id: string): string | null;
  selectDocument(id: string): void | Promise<void>;
  setMode(mode: 'source' | 'preview'): void;
  sourcePanel: RefObject<HTMLDivElement | null>;
  documentScroll: RefObject<HTMLDivElement | null>;
  commands: RefObject<EditorCommands>;
  onOpened?: () => void;
  isCurrentSource(id: string, snapshot: string): boolean;
  onError(reason: unknown): void;
}

/** Shared WebApp interaction: no platform storage or source/history copy. */
export function useWorkspaceInteraction(input: WorkspaceInteractionInput) {
  const latest = useRef(input);
  const navigationRequest = useRef(0);
  useLayoutEffect(() => {
    latest.current = input;
  });
  useLayoutEffect(
    () => () => {
      navigationRequest.current++;
    },
    [input.scope],
  );
  const [visitHistory, setVisitHistory] = useState({
    entries: input.selected ? [input.selected] : [],
    cursor: input.selected ? 0 : -1,
  });
  const pendingLocation = useRef<{
    key: string;
    offset: number;
    source: string;
  } | null>(null);
  useEffect(() => {
    const target = pendingLocation.current;
    if (target && input.selected === target.key && input.mode === 'source') {
      pendingLocation.current = null;
      if (latest.current.isCurrentSource(target.key, target.source))
        latest.current.commands.current?.revealSource(
          target.offset,
          target.source,
        );
    }
  }, [input.selected, input.mode]);
  function switchMode(next: 'source' | 'preview') {
    const current = latest.current;
    const path = current.selected
      ? current.documentPath(current.selected)
      : null;
    if (
      (next !== 'source' && (!path || !isMdxSource(path))) ||
      !current.canLeave()
    )
      return;
    const initiator = document.activeElement;
    pendingLocation.current = null;
    const request = navigationRequest.current;
    current.setMode(next);
    if (next === 'source')
      requestAnimationFrame(() => {
        if (
          latest.current.scope !== current.scope ||
          latest.current.selected !== current.selected ||
          navigationRequest.current !== request
        )
          return;
        const active = document.activeElement;
        if (active && active !== document.body && active !== initiator) return;
        latest.current.sourcePanel.current
          ?.querySelector<HTMLElement>('.cm-content')
          ?.focus();
      });
  }
  async function openDocument(id: string) {
    const current = latest.current;
    const path = current.documentPath(id);
    if (!path || !current.canLeave()) return;
    pendingLocation.current = null;
    const request = ++navigationRequest.current;
    const selecting = current.selectDocument(id);
    const asynchronous = selecting !== undefined;
    if (selecting) await selecting;
    if (
      latest.current.scope !== current.scope ||
      navigationRequest.current !== request
    )
      return;
    const selectedId = asynchronous
      ? (latest.current.selectedId?.() ?? latest.current.selected)
      : id;
    if (
      asynchronous &&
      (!selectedId || latest.current.documentPath(selectedId) !== path)
    )
      return;
    const opened = selectedId ?? id;
    if (!isMdxSource(path)) latest.current.setMode('source');
    setVisitHistory((history) => {
      if (history.entries[history.cursor] === opened) return history;
      const entries = [
        ...history.entries.slice(0, history.cursor + 1),
        opened,
      ].slice(-40);
      return { entries, cursor: entries.length - 1 };
    });
    latest.current.onOpened?.();
    latest.current.documentScroll.current?.scrollTo?.({
      top: 0,
      behavior: 'instant',
    });
  }
  async function showSource(id: string, offset: number, source: string) {
    const current = latest.current;
    const path = current.documentPath(id);
    if (!path || !current.canLeave() || !current.isCurrentSource(id, source))
      return;
    const request = ++navigationRequest.current;
    if (current.selected !== id) await current.selectDocument(id);
    if (
      latest.current.scope !== current.scope ||
      navigationRequest.current !== request
    )
      return;
    const selected = latest.current.selectedId?.() ?? id;
    if (
      !selected ||
      latest.current.documentPath(selected) !== path ||
      !latest.current.isCurrentSource(selected, source)
    )
      return;
    const target = { key: selected, offset, source };
    pendingLocation.current = target;
    latest.current.setMode('source');
    requestAnimationFrame(() => {
      if (
        pendingLocation.current !== target ||
        navigationRequest.current !== request ||
        latest.current.scope !== current.scope ||
        (latest.current.selectedId?.() ?? latest.current.selected) !==
          selected ||
        !latest.current.isCurrentSource(selected, source)
      )
        return;
      pendingLocation.current = null;
      latest.current.commands.current?.revealSource(offset, source);
    });
  }
  function moveHistory(offset: number) {
    const current = latest.current;
    if (!current.canLeave()) return;
    let cursor = visitHistory.cursor + offset;
    while (cursor >= 0 && cursor < visitHistory.entries.length) {
      const id = visitHistory.entries[cursor]!;
      const path = current.documentPath(id);
      if (path) {
        const request = ++navigationRequest.current;
        void Promise.resolve()
          .then(() => current.selectDocument(id))
          .then(() => {
            if (
              latest.current.scope !== current.scope ||
              navigationRequest.current !== request
            )
              return;
            const selected = latest.current.selectedId?.();
            if (
              selected !== undefined &&
              (!selected || latest.current.documentPath(selected) !== path)
            )
              return;
            if (!isMdxSource(path)) latest.current.setMode('source');
            setVisitHistory((old) => ({ ...old, cursor }));
            latest.current.documentScroll.current?.scrollTo?.({
              top: 0,
              behavior: 'instant',
            });
          })
          .catch((reason: unknown) => latest.current.onError(reason));
        return;
      }
      cursor += offset;
    }
  }
  function runCommand(
    result: { id: string },
    close: () => void,
    action: (id: string) => void,
  ) {
    close();
    if (result.id.startsWith('action:format:')) {
      const current = latest.current;
      const owner = current.commands.current;
      requestAnimationFrame(() => {
        if (
          latest.current.scope !== current.scope ||
          latest.current.selected !== current.selected ||
          latest.current.commands.current !== owner ||
          !latest.current.canLeave()
        )
          return;
        owner?.formatRendered?.(result.id.slice('action:format:'.length));
      });
    } else if (result.id.startsWith('document:')) {
      void openDocument(result.id.slice('document:'.length)).catch(
        (reason: unknown) => latest.current.onError(reason),
      );
    } else if (
      result.id === 'action:source' ||
      result.id === 'action:preview'
    ) {
      switchMode(result.id === 'action:source' ? 'source' : 'preview');
    } else action(result.id.slice('action:'.length));
  }
  return {
    canLeaveDraft: () => latest.current.canLeave(),
    switchMode,
    openDocument,
    showSource,
    moveHistory,
    visitHistory,
    setVisitHistory,
    pendingLocation,
    runCommand,
  };
}

export function filterDocumentCommands<
  T extends { name: string; description: string },
>(commands: readonly T[], query: string): T[] {
  const needle = query.trim().toLocaleLowerCase();
  return commands.filter(
    (command) =>
      !needle ||
      (command.name + ' ' + command.description)
        .toLocaleLowerCase()
        .includes(needle),
  );
}
export function documentFormattingCommands(
  selectedIsNote: boolean,
  mode: 'source' | 'preview',
): DocumentCommand[] {
  return selectedIsNote && mode === 'preview'
    ? [
        ['Insert link', 'link'],
        ['Insert table', 'table'],
        ['Add table row', 'row'],
        ['Insert equation', 'math'],
        ['Bullet list', 'bullet'],
        ['Ordered list', 'ordered'],
        ['Task list', 'task'],
        ['Blockquote', 'quote'],
      ].map(([name, action]) => ({
        id: 'action:format:' + action,
        name: name!,
        description: 'Format the selected Markdown',
        icon: Pencil,
      }))
    : [];
}
