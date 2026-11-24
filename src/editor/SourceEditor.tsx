import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import {
  Annotation,
  Compartment,
  EditorState,
  Transaction,
  type EditorSelection,
  type TransactionSpec,
} from '@codemirror/state';
import { EditorView, keymap, lineNumbers } from '@codemirror/view';
import {
  defaultKeymap,
  history,
  historyField,
  historyKeymap,
  isolateHistory,
  undo,
  redo,
} from '@codemirror/commands';
import { markdown } from '@codemirror/lang-markdown';
import { javascriptLanguage } from '@codemirror/lang-javascript';
import 'katex/dist/katex.min.css';
import type { LinkResolution } from '../links';
import { MarkdownEditor } from './MarkdownEditor';
import { patchMarkdown } from './markdownEdits';
import { RawSourceMap } from './live/sourceCoordinates';
import {
  explicitRawSource,
  rawAfterTransaction,
  rawSource,
  rawSourceField,
  rawSourceHistory,
} from './live/rawSource';
import { liveDataChanged, livePreview } from './live/livePreview';
import { compositionHistory } from './live/compositionHistory';
import { MathEditor, type MathDraft } from './math/MathEditor';
import { planMathReplacement } from './math/mathSource';
import './live/live.css';
import {
  RenderedEditor,
  type RenderedCommands,
} from './rendered/RenderedEditor';
import type { RenderedRuntimeContext } from './rendered/RenderedRuntime';

const external = Annotation.define<boolean>();
const EMPTY_WIKILINKS: readonly LinkResolution[] = Object.freeze([]);
export type EditorCommands = {
  undo: () => void;
  redo: () => void;
  revealSource: (offset: number, expectedSource: string) => void;
  insertText: (text: string) => boolean;
  formatRendered?: (action: string) => void;
} | null;

// Preserve the real immutable history field, not its JSON serialization:
// CodeMirror intentionally omits custom inverse effects when serializing JSON.
export type EditorHistory = Map<
  string,
  { source: string; history: unknown; selection: EditorSelection }
>;

export function SourceEditor({
  source,
  onChange,
  visual,
  live = false,
  documentKey,
  histories,
  commandsRef,
  busy,
  onPendingChange,
  onShowSource,
  acceptChange,
  wikilinks = EMPTY_WIKILINKS,
  onOpenNote,
  rendered,
}: {
  commandsRef?: React.RefObject<EditorCommands>;
  source: string;
  visual?: boolean;
  live?: boolean;
  documentKey?: string;
  histories?: React.RefObject<EditorHistory>;
  onChange: (value: string) => void;
  busy?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onShowSource?: (offset: number, snapshot: string) => void;
  acceptChange?: (source: string) => boolean;
  wikilinks?: readonly LinkResolution[];
  onOpenNote?: (id: string) => void;
  rendered?: RenderedRuntimeContext & { active: boolean };
}) {
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const presentation = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const change = useRef(onChange);
  const accept = useRef(acceptChange);
  const latestLinks = useRef(wikilinks);
  const navigate = useRef(onOpenNote);
  const isBusy = useRef(busy);
  const pending = useRef(onPendingChange);
  const draftRef = useRef<MathDraft | null>(null);
  const legacyPending = useRef(false);
  const renderedPending = useRef(false);
  const [draft, setDraft] = useState<MathDraft | null>(null);
  const path = documentKey ?? 'note.mdx';
  const renderedCommands = useRef<RenderedCommands | null>(null);
  const renderedActive = useRef(Boolean(rendered?.active));
  useLayoutEffect(() => {
    renderedActive.current = Boolean(rendered?.active);
  }, [rendered]);

  useEffect(() => {
    change.current = onChange;
    accept.current = acceptChange;
    latestLinks.current = wikilinks;
    navigate.current = onOpenNote;
    isBusy.current = busy;
    pending.current = onPendingChange;
  }, [onChange, acceptChange, wikilinks, onOpenNote, busy, onPendingChange]);

  function setMathDraft(next: MathDraft | null) {
    draftRef.current = next;
    setDraft(next);
    pending.current?.(
      Boolean(next) || legacyPending.current || renderedPending.current,
    );
  }

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        draftRef.current ||
        legacyPending.current ||
        renderedPending.current
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    }
    window.addEventListener('beforeunload', beforeUnload);
    return () => window.removeEventListener('beforeunload', beforeUnload);
  }, []);

  // All host-originated exact raw edits share the same revision guard, projected
  // transaction, source budget and CodeMirror undo event.
  function applyRaw(
    editor: EditorView,
    expected: string,
    next: string,
    range?: { from: number; to: number; insert: string },
    sourceInput = false,
    typing = false,
  ): boolean {
    if (
      rawSource(editor.state) !== expected ||
      (isBusy.current && !sourceInput)
    )
      return false;
    if (next === expected) return true;
    if (accept.current?.(next) === false) return false;
    const map = new RawSourceMap(expected);
    let changes: TransactionSpec['changes'];
    if (range) {
      const from = map.toDisplay(range.from),
        to = map.toDisplay(range.to);
      if (from === null || to === null) return false;
      changes = { from, to, insert: new RawSourceMap(range.insert).display };
    } else
      changes = {
        from: 0,
        to: editor.state.doc.length,
        insert: new RawSourceMap(next).display,
      };
    editor.dispatch({
      changes,
      annotations: [
        explicitRawSource.of(next),
        ...(typing ? [] : [isolateHistory.of('full')]),
      ],
      userEvent: typing ? 'input.type' : 'input',
    });
    return rawSource(editor.state) === next;
  }

  useEffect(() => {
    const cache = histories?.current;
    const cached =
      documentKey === undefined ? undefined : cache?.get(documentKey);
    const initial = new RawSourceMap(source);
    const extensions = [
      // Tauri authorizes its inline boot style with a nonce. Once present,
      // unsafe-inline is ignored: CodeMirror's runtime CSS needs the same
      // authority, including the whitespace rules that preserve typed spaces.
      EditorView.cspNonce.of(
        element.current?.ownerDocument.querySelector<HTMLStyleElement>(
          'style[nonce]',
        )?.nonce ?? '',
      ),
      rawSourceField.init(() => source),
      rawSourceHistory,
      compositionHistory(),
      lineNumbers(),
      history(),
      keymap.of([
        { key: 'Mod-Shift-z', run: redo, preventDefault: true },
        ...defaultKeymap,
        ...historyKeymap,
      ]),
      markdown({ defaultCodeLanguage: javascriptLanguage }),
      EditorView.lineWrapping,
      EditorView.contentAttributes.of({ 'aria-label': 'MDX source' }),
      presentation.current.of([]),
      // Pending file/save I/O does not lock raw source. The document model
      // retains edits made during that operation; only unapplied editor drafts
      // temporarily protect the source surface from concurrent editing.
      editable.current.of(EditorState.readOnly.of(false)),
      EditorState.transactionFilter.of((transaction) => {
        if (
          !transaction.docChanged &&
          transaction.annotation(explicitRawSource) === undefined
        )
          return transaction;
        const next = rawAfterTransaction(transaction);
        if (next === null) return [];
        return !transaction.annotation(external) &&
          accept.current?.(next) === false
          ? []
          : transaction;
      }),
      EditorView.updateListener.of((update) => {
        if (
          update.transactions.some(
            (transaction) =>
              !transaction.annotation(external) &&
              rawSource(transaction.startState) !==
                rawSource(transaction.state),
          )
        )
          change.current(rawSource(update.state));
      }),
      EditorView.domEventHandlers({
        copy: (event, editor) => {
          if (
            !event.clipboardData ||
            editor.state.selection.ranges.every((selection) => selection.empty)
          )
            return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw);
          event.clipboardData.setData(
            'text/plain',
            editor.state.selection.ranges
              .map((selection) =>
                raw.slice(map.toRaw(selection.from)!, map.toRaw(selection.to)!),
              )
              .join('\n'),
          );
          event.preventDefault();
          return true;
        },
        cut: (event, editor) => {
          if (
            !event.clipboardData ||
            draftRef.current ||
            editor.state.selection.ranges.every((selection) => selection.empty)
          )
            return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw);
          event.clipboardData.setData(
            'text/plain',
            editor.state.selection.ranges
              .map((selection) =>
                raw.slice(map.toRaw(selection.from)!, map.toRaw(selection.to)!),
              )
              .join('\n'),
          );
          editor.dispatch(editor.state.replaceSelection(''));
          event.preventDefault();
          return true;
        },
        paste: (event, editor) => {
          if (
            !event.clipboardData ||
            event.clipboardData.files.length ||
            draftRef.current
          )
            return false;
          const text = event.clipboardData.getData('text/plain');
          if (!text || editor.state.selection.ranges.length !== 1) return false;
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw),
            selection = editor.state.selection.main;
          const from = map.toRaw(selection.from)!,
            to = map.toRaw(selection.to)!;
          applyRaw(
            editor,
            raw,
            raw.slice(0, from) + text + raw.slice(to),
            { from, to, insert: text },
            true,
          );
          event.preventDefault();
          return true;
        },
      }),
    ];
    if (cached?.source === source)
      extensions.push(historyField.init(() => cached.history));
    const editor = new EditorView({
      parent: element.current!,
      state: EditorState.create({
        doc: initial.display,
        extensions,
        ...(cached?.source === source ? { selection: cached.selection } : {}),
      }),
    });
    view.current = editor;
    if (commandsRef)
      commandsRef.current = {
        undo: () => {
          if (!draftRef.current) undo(editor);
        },
        redo: () => {
          if (!draftRef.current) redo(editor);
        },
        formatRendered: (action) => {
          if (!draftRef.current && renderedActive.current)
            renderedCommands.current?.format(action);
        },
        revealSource: (offset, expectedSource) => {
          if (rawSource(editor.state) !== expectedSource || draftRef.current)
            return;
          const anchor = new RawSourceMap(expectedSource).toDisplay(offset);
          if (anchor === null) return;
          editor.dispatch({ selection: { anchor }, scrollIntoView: true });
          editor.focus();
        },
        insertText: (text) => {
          if (draftRef.current) return false;
          if (renderedActive.current && renderedCommands.current)
            return renderedCommands.current.insertText(text);
          const raw = rawSource(editor.state),
            map = new RawSourceMap(raw),
            selection = editor.state.selection.main;
          const from = map.toRaw(selection.from),
            to = map.toRaw(selection.to);
          if (from === null || to === null) return false;
          const next = raw.slice(0, from) + text + raw.slice(to);
          if (!applyRaw(editor, raw, next, { from, to, insert: text }, true))
            return false;
          const anchor = new RawSourceMap(next).toDisplay(from + text.length);
          if (anchor !== null)
            editor.dispatch({ selection: { anchor }, scrollIntoView: true });
          editor.focus();
          return true;
        },
      };
    return () => {
      if (documentKey !== undefined)
        cache?.set(documentKey, {
          source: rawSource(editor.state),
          history: editor.state.field(historyField),
          selection: editor.state.selection,
        });
      if (commandsRef) commandsRef.current = null;
      view.current = null;
      editor.destroy();
    };
    // The immutable document identity owns one EditorView. Updates below are transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    const editor = view.current;
    if (editor && rawSource(editor.state) !== source)
      editor.dispatch({
        changes: {
          from: 0,
          to: editor.state.doc.length,
          insert: new RawSourceMap(source).display,
        },
        annotations: [
          external.of(true),
          explicitRawSource.of(source),
          isolateHistory.of('full'),
        ],
      });
  }, [source]);

  useEffect(() => {
    const editor = view.current;
    if (!editor) return;
    editor.dispatch({
      effects: presentation.current.reconfigure(
        live
          ? livePreview({
              path,
              getLinks: () => latestLinks.current,
              openMath: (snapshot, span) => {
                if (
                  rawSource(editor.state) !== snapshot ||
                  isBusy.current ||
                  draftRef.current ||
                  legacyPending.current ||
                  renderedPending.current
                )
                  return;
                setMathDraft({
                  source: snapshot,
                  span,
                  value: span.originalInner,
                  error: '',
                });
              },
              openLink: (snapshot, link) => {
                if (
                  rawSource(editor.state) !== snapshot ||
                  isBusy.current ||
                  draftRef.current ||
                  legacyPending.current ||
                  renderedPending.current ||
                  link.status !== 'resolved' ||
                  !link.targetId
                )
                  return;
                const current = latestLinks.current.find(
                  (item) =>
                    item.span.from === link.span.from &&
                    item.span.raw === link.span.raw &&
                    item.targetId === link.targetId &&
                    item.status === 'resolved',
                );
                if (current) navigate.current?.(link.targetId);
              },
            })
          : [],
      ),
      annotations: Transaction.addToHistory.of(false),
    });
    // Callbacks read current refs and the immutable editor instance.
  }, [live, path]);

  useEffect(() => {
    const editor = view.current;
    if (!live || !editor) return;
    let frame: number | null = null;
    let active = true;
    const schedule = () => {
      if (frame !== null) return;
      // Firefox can finish composition before CodeMirror has read its DOM
      // insertion. A passive React effect must not redraw that pending text.
      frame = requestAnimationFrame(() => {
        frame = null;
        if (!active || view.current !== editor || editor.compositionStarted)
          return;
        editor.dispatch({
          effects: liveDataChanged.of(null),
          annotations: Transaction.addToHistory.of(false),
        });
      });
    };
    // No polling while an IME is active. Its end event resumes pending work.
    editor.contentDOM.addEventListener('compositionend', schedule);
    schedule();
    return () => {
      active = false;
      if (frame !== null) cancelAnimationFrame(frame);
      editor.contentDOM.removeEventListener('compositionend', schedule);
    };
  }, [wikilinks, live]);
  useEffect(() => {
    view.current?.dispatch({
      effects: editable.current.reconfigure(
        EditorState.readOnly.of(Boolean(draft)),
      ),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [draft]);

  return (
    <div className="editor-pane">
      {rendered && (
        <RenderedEditor
          source={source}
          path={path}
          active={rendered.active}
          disabled={Boolean(busy || draft)}
          commandsRef={renderedCommands}
          runtime={rendered}
          wikilinks={wikilinks}
          onPendingChange={(value) => {
            renderedPending.current = value;
            pending.current?.(
              value || legacyPending.current || Boolean(draftRef.current),
            );
          }}
          openNote={onOpenNote}
          undo={() => {
            if (view.current && !draftRef.current) undo(view.current);
          }}
          redo={() => {
            if (view.current && !draftRef.current) redo(view.current);
          }}
          openSource={(offset, snapshot) => onShowSource?.(offset, snapshot)}
          apply={(snapshot, next, typing) => {
            const editor = view.current;
            if (!editor) return false;
            let from = 0;
            while (
              from < snapshot.length &&
              from < next.length &&
              snapshot[from] === next[from]
            )
              from++;
            let end = snapshot.length,
              nextEnd = next.length;
            while (
              end > from &&
              nextEnd > from &&
              snapshot[end - 1] === next[nextEnd - 1]
            ) {
              end--;
              nextEnd--;
            }
            // A physical CRLF and a surrogate pair each have one legal boundary.
            if (
              from > 0 &&
              ((snapshot[from - 1] === '\r' && snapshot[from] === '\n') ||
                /[\uD800-\uDBFF]/.test(snapshot[from - 1]!))
            )
              from--;
            if (
              end < snapshot.length &&
              ((snapshot[end - 1] === '\r' && snapshot[end] === '\n') ||
                /[\uDC00-\uDFFF]/.test(snapshot[end]!))
            ) {
              end++;
              nextEnd++;
            }
            return applyRaw(
              editor,
              snapshot,
              next,
              { from, to: end, insert: next.slice(from, nextEnd) },
              false,
              typing,
            );
          }}
        />
      )}
      <div hidden={!visual}>
        <MarkdownEditor
          busy={busy || Boolean(draft)}
          onPendingChange={(value) => {
            legacyPending.current = value;
            pending.current?.(
              value || renderedPending.current || Boolean(draftRef.current),
            );
          }}
          onShowSource={onShowSource}
          active={visual === true}
          source={source}
          apply={(snapshot, range, replacement) => {
            const editor = view.current;
            if (!editor || source !== snapshot) return false;
            const next = patchMarkdown(snapshot, range, replacement);
            if (next === null) return false;
            return applyRaw(editor, snapshot, next, {
              from: range.from,
              to: range.to,
              insert: next.slice(
                range.from,
                next.length - (snapshot.length - range.to),
              ),
            });
          }}
        />
      </div>
      <div hidden={visual || Boolean(rendered?.active)}>
        <div className="pane-title">{live ? 'Live Preview' : 'Source'}</div>
        <div className="source-editor" ref={element} />
      </div>
      {draft &&
        createPortal(
          <MathEditor
            draft={draft}
            onChange={(value) => setMathDraft({ ...draft, value, error: '' })}
            onCancel={() => {
              setMathDraft(null);
              if (renderedActive.current) renderedCommands.current?.focus();
              else view.current?.focus();
            }}
            onApply={() => {
              const editor = view.current;
              if (!editor) return;
              const planned = planMathReplacement(
                rawSource(editor.state),
                draft.source,
                draft.span,
                draft.value,
                path,
              );
              if (!planned.ok) {
                setMathDraft({ ...draft, error: planned.reason });
                return;
              }
              if (
                !applyRaw(editor, draft.source, planned.source, {
                  from: draft.span.innerFrom,
                  to: draft.span.innerTo,
                  insert: planned.replacement,
                })
              ) {
                setMathDraft({
                  ...draft,
                  error:
                    'The edit exceeds the document limit or the source changed. Your draft is preserved.',
                });
                return;
              }
              setMathDraft(null);
              if (renderedActive.current) renderedCommands.current?.focus();
              else editor.focus();
            }}
          />,
          document.body,
        )}
    </div>
  );
}
