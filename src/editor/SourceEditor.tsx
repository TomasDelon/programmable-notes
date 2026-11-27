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
  type RenderedCompositionPhase,
} from './rendered/RenderedEditor';
import type { RenderedRuntimeContext } from './rendered/RenderedRuntime';
import {
  sameSourceWitness,
  validSourceWitness,
  type SourceSession,
  type SourceWitness,
  type SourceBatch,
  type SourceReceipt,
} from './sourceWitness';

const external = Annotation.define<boolean>();
const EMPTY_WIKILINKS: readonly LinkResolution[] = Object.freeze([]);
export type EditorCommands = {
  /** Native close prerequisite; absence or false means close must remain blocked. */
  detachIfClean?: () => boolean;
  undo: () => void;
  redo: () => void;
  revealSource: (
    offset: number,
    expectedSource: string,
    witness?: SourceWitness,
  ) => void;
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
  sourceIsCurrent,
  session,
  onChange,
  visual,
  live = false,
  documentKey,
  sourcePath,
  histories,
  commandsRef,
  busy,
  readOnly = false,
  onPendingChange,
  onRetainAttempt,
  onKeepAttempt,
  onDiscardAttempt,
  onAnalysisDiagnostic,
  onShowSource,
  acceptChange,
  wikilinks = EMPTY_WIKILINKS,
  onOpenNote,
  rendered,
}: {
  commandsRef?: React.RefObject<EditorCommands>;
  source: string;
  /** Host-owned freshness witness for deferred React source echoes. */
  sourceIsCurrent?: (snapshot: string) => boolean;
  documentKey?: string;
  /** Logical syntax/import path only; document/session identity owns history. */
  sourcePath?: string;
  histories?: React.RefObject<EditorHistory>;
  onChange: (value: string) => void;
  busy?: boolean;
  readOnly?: boolean;
  onPendingChange?: (pending: boolean) => void;
  onRetainAttempt?: (
    baseSource: string,
    text: string,
    witness?: SourceWitness,
  ) => Promise<void>;
  onKeepAttempt?: () => Promise<void>;
  onDiscardAttempt?: () => Promise<void>;
  onAnalysisDiagnostic?: (
    path: string,
    source: string,
    message: string | null,
    witness?: SourceWitness,
  ) => void;
  onShowSource?: (
    offset: number,
    snapshot: string,
    witness?: SourceWitness,
  ) => void;
  acceptChange?: (source: string) => boolean;
  wikilinks?: readonly LinkResolution[];
  onOpenNote?: (id: string) => void;
  rendered?: RenderedRuntimeContext & { active: boolean };
} &
  // Sessions apply to the owning Source/Rendered Preview surface. The legacy
  // alternate form/live editors retain their existing, session-free API.
  (
    | { session?: SourceSession; visual?: false; live?: false }
    | { session?: undefined; visual?: boolean; live?: boolean }
  )) {
  const element = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView>(null);
  const presentation = useRef(new Compartment());
  const editable = useRef(new Compartment());
  const change = useRef(onChange);
  const accept = useRef(acceptChange);
  const authority = useRef(session);
  const acceptedWitness = useRef<SourceWitness | undefined>(
    session ? { ...session.witness } : undefined,
  );
  const sessionId = useRef(session?.witness.sessionId);
  const pendingBatch = useRef<SourceBatch | null>(null);
  const publicationFailed = useRef(false);
  const publishing = useRef(false);
  const detached = useRef(false);
  useLayoutEffect(() => {
    authority.current = session;
  }, [session]);

  const protocolMatches = () =>
    !detached.current &&
    (sessionId.current === undefined
      ? authority.current === undefined
      : authority.current?.witness.sessionId === sessionId.current);

  function currentWitness(witness: SourceWitness | undefined): boolean {
    return (
      protocolMatches() &&
      !publicationFailed.current &&
      Boolean(
        witness &&
        validSourceWitness(witness) &&
        acceptedWitness.current &&
        validSourceWitness(acceptedWitness.current) &&
        authority.current &&
        validSourceWitness(authority.current.witness) &&
        witness.sessionId === sessionId.current &&
        sameSourceWitness(witness, acceptedWitness.current) &&
        authority.current?.isCurrent(witness),
      )
    );
  }
  const latestLinks = useRef(wikilinks);
  const navigate = useRef(onOpenNote);
  const isBusy = useRef(busy);
  const locked = useRef(readOnly);
  const pending = useRef(onPendingChange);
  const draftRef = useRef<MathDraft | null>(null);
  const legacyPending = useRef(false);
  const renderedPending = useRef(false);
  const [draft, setDraft] = useState<MathDraft | null>(null);
  const path = sourcePath ?? documentKey ?? 'note.mdx';
  const renderedCommands = useRef<RenderedCommands | null>(null);
  const renderedActive = useRef(Boolean(rendered?.active));
  const renderedMounted = useRef(Boolean(rendered));
  useLayoutEffect(() => {
    renderedActive.current = Boolean(rendered?.active);
    renderedMounted.current = Boolean(rendered);
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
      publicationFailed.current ||
        Boolean(next) ||
        legacyPending.current ||
        renderedPending.current,
    );
  }

  useEffect(() => {
    function beforeUnload(event: BeforeUnloadEvent) {
      if (
        draftRef.current ||
        legacyPending.current ||
        renderedPending.current ||
        publicationFailed.current
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
    composition?: RenderedCompositionPhase,
  ): boolean {
    if (
      locked.current ||
      !protocolMatches() ||
      publicationFailed.current ||
      rawSource(editor.state) !== expected ||
      (isBusy.current && !sourceInput)
    )
      return false;
    if (next === expected) return true;
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
        ...(composition === 'start'
          ? [isolateHistory.of('before')]
          : composition || typing
            ? []
            : [isolateHistory.of('full')]),
      ],
      userEvent: composition
        ? composition === 'start'
          ? 'input.type.compose.start'
          : 'input.type.compose'
        : typing
          ? 'input.type'
          : 'input',
    });
    return (
      rawSource(editor.state) === next &&
      (sessionId.current === undefined ||
        (currentWitness(acceptedWitness.current) &&
          acceptedWitness.current!.source === next))
    );
  }

  function applyRenderedRaw(
    snapshot: string,
    next: string,
    typing: boolean,
    composition?: RenderedCompositionPhase,
  ): boolean {
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
      composition,
    );
  }

  useEffect(() => {
    detached.current = false;
    locked.current = readOnly;
    const cache = histories?.current;
    const historyKey = sessionId.current ?? documentKey;
    const cached =
      historyKey === undefined ? undefined : cache?.get(historyKey);
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
      editable.current.of([
        EditorState.readOnly.of(readOnly),
        EditorView.editable.of(!readOnly),
      ]),
      EditorState.transactionFilter.of((transaction) => {
        if (
          !transaction.docChanged &&
          transaction.annotation(explicitRawSource) === undefined
        )
          return transaction;
        return rawAfterTransaction(transaction) === null ? [] : transaction;
      }),
      EditorView.updateListener.of((update) => {
        const batch = pendingBatch.current;
        if (batch) {
          pendingBatch.current = null;
          try {
            publishing.current = true;
            const receipt = authority.current!.publish(batch);
            if (
              !validSourceWitness(receipt) ||
              receipt.sessionId !== batch.expected.sessionId ||
              receipt.editorRevision <= batch.expected.editorRevision ||
              receipt.source !== batch.source ||
              !authority.current!.isCurrent(receipt)
            )
              throw Error('Invalid source acceptance receipt.');
            acceptedWitness.current = { ...receipt };
          } catch {
            // CM already owns these exact bytes/history. Block acceptance and
            // normal close; a failed publisher must never produce a fake receipt.
            publicationFailed.current = true;
            pending.current?.(true);
            try {
              // The session owner retains this separately from accepted originals,
              // including when a host published its witness and then threw.
              void Promise.resolve(
                authority.current!.retainFailure({
                  expected: { ...batch.expected },
                  source: rawSource(update.state),
                }),
              ).catch(() => {});
            } catch {
              /* Failure stays latched; never claim retained durability. */
            }
          } finally {
            publishing.current = false;
          }
          return;
        }
        if (sessionId.current !== undefined) return;
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
            locked.current ||
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
            locked.current ||
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
      // History bypasses transaction filters. Check each proposed raw transition
      // against the current model before publishing the batch or consuming history.
      dispatchTransactions(transactions, editor) {
        if (
          !protocolMatches() ||
          publishing.current ||
          publicationFailed.current
        )
          return;
        let state = editor.state;
        let localChange = false;
        let externalChange = false;
        for (const tr of transactions) {
          if (tr.startState !== state) return;
          state = tr.state;
          const previous = rawSource(tr.startState);
          const next = rawSource(tr.state);
          if (tr.annotation(external)) {
            externalChange ||= next !== previous;
            continue;
          }
          if (
            locked.current &&
            (tr.docChanged ||
              tr.annotation(explicitRawSource) !== undefined ||
              /^(select\.)?(undo|redo)$/.test(
                tr.annotation(Transaction.userEvent) ?? '',
              ))
          )
            return;
          const historyTraversal =
            /^(undo|redo)$/.test(tr.annotation(Transaction.userEvent) ?? '') &&
            tr.startState.field(historyField) !== tr.state.field(historyField);
          localChange ||= next !== previous || historyTraversal;
          if (
            next !== previous &&
            (locked.current || accept.current?.(next) === false)
          )
            return;
          if (
            (next !== previous || historyTraversal) &&
            sessionId.current !== undefined &&
            (!currentWitness(acceptedWitness.current) ||
              !authority.current!.validate({
                expected: { ...acceptedWitness.current! },
                source: next,
              }))
          )
            return;
        }
        if (sessionId.current !== undefined && localChange) {
          if (
            externalChange ||
            !currentWitness(acceptedWitness.current) ||
            acceptedWitness.current!.source !== rawSource(editor.state)
          )
            return;
          pendingBatch.current = {
            expected: { ...acceptedWitness.current! },
            source: rawSource(state),
          };
        }
        try {
          editor.update(transactions);
        } finally {
          pendingBatch.current = null;
        }
      },
      state: EditorState.create({
        doc: initial.display,
        extensions,
        ...(cached?.source === source ? { selection: cached.selection } : {}),
      }),
    });
    view.current = editor;
    // This observer does not interpret source or replace CodeMirror's observer.
    // It only refuses a same-stack close before native DOM input is processed.
    const domObserver =
      typeof MutationObserver === 'function'
        ? new MutationObserver(() => {})
        : null;
    domObserver?.observe(editor.contentDOM, {
      childList: true,
      characterData: true,
      subtree: true,
    });
    let pendingDom = false;
    let sourceCompositionPending = false;
    let compositionEpoch = 0;
    const compositionStart = () => {
      sourceCompositionPending = true;
      compositionEpoch++;
    };
    const compositionEnd = () => {
      sourceCompositionPending = true;
      const epoch = ++compositionEpoch;
      // Bubble on the outer editor after CodeMirror's content DOM handler: its
      // Linux end-of-composition mutation read has already been queued.
      queueMicrotask(() => {
        if (epoch === compositionEpoch) sourceCompositionPending = false;
      });
    };
    editor.dom.addEventListener('compositionstart', compositionStart);
    editor.dom.addEventListener('compositionend', compositionEnd);
    const hasPendingDom = () => {
      if (pendingDom || !domObserver) return true;
      if (!domObserver.takeRecords().length) return false;
      // takeRecords drains our queue. Keep repeated same-stack attempts refused
      // until the already-queued browser mutation checkpoint has run.
      pendingDom = true;
      queueMicrotask(() => {
        pendingDom = false;
      });
      return true;
    };
    let disposed = false;
    const dispose = () => {
      if (disposed) return;
      disposed = true;
      detached.current = true;
      locked.current = true;
      domObserver?.disconnect();
      editor.dom.removeEventListener('compositionstart', compositionStart);
      editor.dom.removeEventListener('compositionend', compositionEnd);
      if (historyKey !== undefined) {
        if (publicationFailed.current) cache?.delete(historyKey);
        else
          cache?.set(historyKey, {
            source: rawSource(editor.state),
            history: editor.state.field(historyField),
            selection: editor.state.selection,
          });
      }
      if (commandsRef) commandsRef.current = null;
      view.current = null;
      editor.destroy();
    };
    const ownReady = () =>
      view.current === editor &&
      protocolMatches() &&
      !publishing.current &&
      !publicationFailed.current &&
      !pendingBatch.current &&
      !draftRef.current &&
      !legacyPending.current &&
      !renderedPending.current &&
      !sourceCompositionPending &&
      !editor.composing &&
      !editor.compositionStarted &&
      !visual &&
      !live &&
      (sessionId.current === undefined ||
        currentWitness(acceptedWitness.current)) &&
      !hasPendingDom();
    if (commandsRef)
      commandsRef.current = {
        detachIfClean: () => {
          if (disposed) return true;
          if (!ownReady()) return false;
          const child = renderedCommands.current;
          if (
            renderedMounted.current &&
            (!child?.canDetachIfClean?.() || !child.detachIfClean)
          )
            return false;
          // No await or event yield between readiness of both views and teardown.
          if (renderedMounted.current && !child!.detachIfClean!()) return false;
          dispose();
          return true;
        },
        undo: () => {
          if (view.current === editor && !locked.current && !draftRef.current)
            undo(editor);
        },
        redo: () => {
          if (view.current === editor && !locked.current && !draftRef.current)
            redo(editor);
        },
        formatRendered: (action) => {
          if (
            !disposed &&
            !detached.current &&
            !locked.current &&
            !draftRef.current &&
            renderedActive.current
          )
            renderedCommands.current?.format(action);
        },
        revealSource: (offset, expectedSource, witness) => {
          if (view.current !== editor || !protocolMatches()) return;
          if (sessionId.current !== undefined && !currentWitness(witness))
            return;
          if (rawSource(editor.state) !== expectedSource || draftRef.current)
            return;
          const anchor = new RawSourceMap(expectedSource).toDisplay(offset);
          if (anchor === null) return;
          editor.dispatch({ selection: { anchor }, scrollIntoView: true });
          // A formerly hidden source viewport may still contain an old DOM
          // caret. The public geometry read flushes the requested measurement
          // synchronously, so navigation returns with native input ready instead
          // of leaving a frame where immediate typing can go to the old target.
          editor.requestMeasure();
          editor.coordsAtPos(anchor);
          const isCurrentTarget = () =>
            view.current === editor &&
            protocolMatches() &&
            (sessionId.current === undefined || currentWitness(witness)) &&
            rawSource(editor.state) === expectedSource &&
            !draftRef.current &&
            editor.state.selection.main.anchor === anchor &&
            editor.state.selection.main.head === anchor &&
            editor.dom.getClientRects().length > 0;
          if (isCurrentTarget()) {
            editor.focus();
            if (!isCurrentTarget()) return;
            // Focus may reset the browser caret while CodeMirror still caches
            // the requested selection. Reassert the native position through
            // public DOM positions so immediate input uses the revealed target.
            const caret = editor.domAtPos(anchor);
            editor.contentDOM.ownerDocument
              .getSelection()
              ?.collapse(caret.node, caret.offset);
          }
        },
        insertText: (text) => {
          if (view.current !== editor || locked.current || draftRef.current)
            return false;
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
    return dispose;
    // The immutable document identity owns one EditorView. Updates below are transactions.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    // A model may accept more input before an earlier React render commits.
    // Never turn that obsolete echo into an external edit or history event.
    if (!protocolMatches()) return;
    if (sessionId.current !== undefined) {
      const incoming = session?.witness;
      if (
        !incoming ||
        publicationFailed.current ||
        incoming.sessionId !== sessionId.current ||
        incoming.source !== source ||
        !validSourceWitness(incoming) ||
        !session.isCurrent(incoming) ||
        incoming.editorRevision < acceptedWitness.current!.editorRevision
      )
        return;
      acceptedWitness.current = { ...incoming };
    } else if (sourceIsCurrent?.(source) === false) return;
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
  }, [source, sourceIsCurrent, session]);

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
                  locked.current ||
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
                  locked.current ||
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
  useLayoutEffect(() => {
    locked.current = readOnly;
    view.current?.dispatch({
      effects: editable.current.reconfigure([
        EditorState.readOnly.of(readOnly || Boolean(draft)),
        EditorView.editable.of(!readOnly),
      ]),
      annotations: Transaction.addToHistory.of(false),
    });
  }, [readOnly, draft]);

  return (
    <div className="editor-pane">
      {rendered && (
        <RenderedEditor
          source={source}
          sourceIsCurrent={sourceIsCurrent}
          sourceWitness={session?.witness}
          witnessIsCurrent={
            session
              ? (witness) =>
                  !publicationFailed.current &&
                  witness.sessionId === sessionId.current &&
                  session.isCurrent(witness)
              : undefined
          }
          applyWithWitness={
            session
              ? (expected, next, typing, composition): SourceReceipt => {
                  const editor = view.current;
                  if (!editor || !currentWitness(expected))
                    return { accepted: false };
                  if (
                    !applyRenderedRaw(
                      expected.source,
                      next,
                      typing,
                      composition,
                    ) ||
                    !currentWitness(acceptedWitness.current) ||
                    acceptedWitness.current!.source !== next
                  )
                    return { accepted: false };
                  return {
                    accepted: true,
                    witness: { ...acceptedWitness.current! },
                  };
                }
              : undefined
          }
          path={path}
          active={rendered.active}
          disabled={Boolean(readOnly || busy || draft)}
          commandsRef={renderedCommands}
          runtime={rendered}
          onRetainAttempt={onRetainAttempt}
          onKeepAttempt={onKeepAttempt}
          onDiscardAttempt={onDiscardAttempt}
          onAnalysisDiagnostic={onAnalysisDiagnostic}
          wikilinks={wikilinks}
          onPendingChange={(value) => {
            renderedPending.current = value;
            pending.current?.(
              publicationFailed.current ||
                value ||
                legacyPending.current ||
                Boolean(draftRef.current),
            );
          }}
          openNote={onOpenNote}
          undo={() => {
            if (view.current && !locked.current && !draftRef.current)
              undo(view.current);
          }}
          redo={() => {
            if (view.current && !locked.current && !draftRef.current)
              redo(view.current);
          }}
          openSource={(offset, snapshot, witness) => {
            if (sessionId.current === undefined)
              onShowSource?.(offset, snapshot);
            else if (currentWitness(witness))
              onShowSource?.(offset, snapshot, witness);
          }}
          apply={applyRenderedRaw}
        />
      )}
      <div hidden={!visual}>
        <MarkdownEditor
          busy={readOnly || busy || Boolean(draft)}
          onPendingChange={(value) => {
            legacyPending.current = value;
            pending.current?.(
              publicationFailed.current ||
                value ||
                renderedPending.current ||
                Boolean(draftRef.current),
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
