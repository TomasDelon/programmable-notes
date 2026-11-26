import { corePluginEnabled } from '../../plugins/coreRegistry';
import { previewSourcePolicy } from '../../plugins/core/react';
import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNotifications } from '../../ui/useNotifications';
import { Modal } from '../../ui/Modal';
import { createRoot, type Root } from 'react-dom/client';
import {
  Slice,
  Fragment,
  type Node as ProseNode,
  type MarkType,
} from 'prosemirror-model';
import {
  AllSelection,
  Plugin,
  EditorState,
  Selection,
  TextSelection,
  type Command,
  type Transaction,
} from 'prosemirror-state';
import {
  Decoration,
  DecorationSet,
  EditorView,
  type NodeView,
} from 'prosemirror-view';
import {
  baseKeymap,
  chainCommands,
  setBlockType,
  toggleMark,
  wrapIn,
} from 'prosemirror-commands';
import { keymap } from 'prosemirror-keymap';
import {
  InputRule,
  inputRules,
  textblockTypeInputRule,
  wrappingInputRule,
} from 'prosemirror-inputrules';
import {
  liftListItem,
  sinkListItem,
  splitListItem,
  wrapInList,
} from 'prosemirror-schema-list';
import { addRowAfter, goToNextCell, tableEditing } from 'prosemirror-tables';
import { renderMathematics, validLatex } from '../../plugins/core/math';
import { assetBlob } from '../../assets/catalog';
import type { LinkResolution } from '../../links';
import {
  collectLiveMath,
  completedMath,
  preserveMathBreaks,
  mathSourceContextPreserved,
} from '../math/mathSource';
import { renderedSchema } from './schema';
import {
  parseRenderedSource,
  escapeRenderedText,
  renderedTextSourceOffset,
  renderedPositionFromSourceOffset,
  serializeRenderedChange,
  rebaseRenderedProjection,
  reparseRenderedMathEdit,
} from './sourceBridge';
import {
  RenderedRuntime,
  type RenderedRuntimeContext,
} from './RenderedRuntime';
import './rendered.css';
import {
  sameSourceWitness,
  validSourceWitness,
  type SourceWitness,
  type SourceReceipt,
} from '../sourceWitness';

export type RenderedCompositionPhase = 'start' | 'update';

export interface RenderedCommands {
  insertText: (text: string) => boolean;
  focus: () => void;
  format: (action: string) => void;
}
interface Props {
  source: string;
  sourceIsCurrent?: (snapshot: string) => boolean;
  sourceWitness?: SourceWitness;
  witnessIsCurrent?: (witness: SourceWitness) => boolean;
  applyWithWitness?: (
    expected: SourceWitness,
    next: string,
    typing: boolean,
    composition?: RenderedCompositionPhase,
  ) => SourceReceipt;
  path: string;
  active: boolean;
  disabled: boolean;
  commandsRef: React.RefObject<RenderedCommands | null>;
  runtime: RenderedRuntimeContext;
  wikilinks: readonly LinkResolution[];
  apply: (
    expected: string,
    next: string,
    typing: boolean,
    composition?: RenderedCompositionPhase,
  ) => boolean;
  undo: () => void;
  redo: () => void;
  openSource: (offset: number, source: string, witness?: SourceWitness) => void;
  openNote?: (id: string) => void;
  onPendingChange?: (pending: boolean) => void;
  onAnalysisDiagnostic?: (
    path: string,
    source: string,
    message: string | null,
    witness?: SourceWitness,
  ) => void;
  onRetainAttempt?: (
    baseSource: string,
    text: string,
    witness?: SourceWitness,
  ) => Promise<void>;
  onDiscardAttempt?: () => Promise<void>;
  onKeepAttempt?: () => Promise<void>;
}

function markRule(expression: RegExp, mark: MarkType) {
  return new InputRule(expression, (state, match, start, end) => {
    const value = match[1];
    if (!value) return null;
    return state.tr
      .insertText(value, start, end)
      .addMark(start, start + value.length, mark.create())
      .removeStoredMark(mark);
  });
}

/** Host-owned structured editing. The CodeMirror source transaction owns persistence and undo. */
export function RenderedEditor({ commandsRef, ...props }: Props) {
  const { notify, dismiss } = useNotifications();
  const noticeId = useId();
  const mount = useRef<HTMLDivElement>(null);
  const view = useRef<EditorView | null>(null);
  const latest = useRef(props);
  const runtimeRoots = useRef(
    new Set<{ root: Root; raw: string; report: (message: string) => void }>(),
  );
  const runtimeCounter = useRef(0);
  const imageRefreshers = useRef(new Set<() => void>());
  const presentationRefreshers = useRef(new Set<() => void>());
  const [error, setError] = useState('');
  const [unappliedText, setUnappliedText] = useState<string | null>(null);
  const retainedDraft = useRef<string | null>(null);
  const recoveryGeneration = useRef(0);
  const recoveryAction = useRef(false);
  const [recoveryBusy, setRecoveryBusy] = useState(false);
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [recoveryCopy, setRecoveryCopy] = useState<
    'memory' | 'saving' | 'saved' | 'failed'
  >('memory');
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [documentComposing, setDocumentComposing] = useState(false);
  useEffect(() => {
    if (error || unappliedText !== null)
      notify({
        id: noticeId,
        tone: 'error',
        persistent: unappliedText !== null,
        dismissible: unappliedText === null,
        message:
          unappliedText !== null ? 'Your edit was kept for recovery.' : error,
        detail: unappliedText !== null ? error : undefined,
        actions:
          unappliedText !== null
            ? [{ label: 'Review draft', run: () => setRecoveryOpen(true) }]
            : undefined,
      });
    else dismiss(noticeId);
  }, [error, unappliedText, noticeId, notify, dismiss]);
  useEffect(
    () => () => {
      dismiss(noticeId);
      dismiss(noticeId + '-math');
    },
    [dismiss, noticeId],
  );
  const linkSelection = useRef<{
    from: number;
    to: number;
    source: string;
    witness?: SourceWitness;
  } | null>(null);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const hasPendingDraft =
    linkDraft !== null || unappliedText !== null || documentComposing;
  useLayoutEffect(() => {
    latest.current.onPendingChange?.(hasPendingDraft);
  }, [hasPendingDraft]);
  useLayoutEffect(() => () => latest.current.onPendingChange?.(false), []);

  async function releaseRecovery(discard: boolean) {
    if (recoveryAction.current) return;
    const generation = recoveryGeneration.current;
    recoveryAction.current = true;
    setRecoveryBusy(true);
    try {
      const action = discard
        ? latest.current.onDiscardAttempt
        : latest.current.onKeepAttempt;
      if (action) await action();
      if (recoveryGeneration.current !== generation) return;
      recoveryGeneration.current++;
      retainedDraft.current = null;
      setUnappliedText(null);
      setError('');
      setRecoveryOpen(false);
      setRecoveryCopy('memory');
    } catch (reason) {
      if (recoveryGeneration.current === generation) {
        if (!discard) setRecoveryCopy('failed');
        setError(
          reason instanceof Error
            ? reason.message
            : 'The recovery copy could not be verified.',
        );
      }
    } finally {
      recoveryAction.current = false;
      setRecoveryBusy(false);
    }
  }

  useEffect(() => {
    if (!mount.current) return;
    let projection = parseRenderedSource(
      latest.current.source,
      latest.current.path,
    );
    let acceptedSource = projection.mapping.source;
    let projectionWitness = latest.current.sourceWitness
      ? { ...latest.current.sourceWitness }
      : undefined;
    const sessionAware = projectionWitness !== undefined;
    const protocolMatches = () =>
      sessionAware
        ? latest.current.sourceWitness?.sessionId ===
            projectionWitness?.sessionId &&
          latest.current.applyWithWitness !== undefined
        : latest.current.sourceWitness === undefined &&
          latest.current.applyWithWitness === undefined;
    const projectionIsCurrent = () =>
      protocolMatches() &&
      (!sessionAware ||
        Boolean(
          projectionWitness &&
          validSourceWitness(projectionWitness) &&
          latest.current.sourceWitness &&
          validSourceWitness(latest.current.sourceWitness) &&
          projectionWitness.source === acceptedSource &&
          latest.current.witnessIsCurrent?.(projectionWitness),
        ));
    function applyCanonical(
      next: string,
      typing: boolean,
      composition?: RenderedCompositionPhase,
    ): { accepted: boolean; witness?: SourceWitness } {
      if (!protocolMatches()) return { accepted: false };
      if (!sessionAware)
        return {
          accepted:
            composition === undefined
              ? latest.current.apply(acceptedSource, next, typing)
              : latest.current.apply(acceptedSource, next, typing, composition),
        };
      if (
        !projectionIsCurrent() ||
        !projectionWitness ||
        !latest.current.applyWithWitness
      )
        return { accepted: false };
      const receipt = latest.current.applyWithWitness(
        { ...projectionWitness },
        next,
        typing,
        composition,
      );
      if (
        !receipt.accepted ||
        !validSourceWitness(receipt.witness) ||
        receipt.witness.sessionId !== projectionWitness.sessionId ||
        receipt.witness.source !== next ||
        receipt.witness.editorRevision < projectionWitness.editorRevision ||
        (next !== acceptedSource &&
          receipt.witness.editorRevision ===
            projectionWitness.editorRevision) ||
        !latest.current.witnessIsCurrent?.(receipt.witness)
      )
        return { accepted: false };
      return { accepted: true, witness: { ...receipt.witness } };
    }
    let pendingDollars = new Set<number>();
    // Equal source bytes can belong to different history entries. Remember
    // empty provenance too, and permanently refuse ambiguous ownership.
    const pendingHistory = new Map<string, number[] | null>([
      [acceptedSource, []],
    ]);
    let pendingHistoryAvailable = true;
    let restoringPendingHistory = false;
    let pendingHistoryTimer: number | null = null;
    function rememberPendingDollars() {
      if (!pendingHistoryAvailable) return;
      const offsets = [...pendingDollars].sort((a, b) => a - b);
      const existing = pendingHistory.get(acceptedSource);
      if (existing !== null) {
        const matches =
          existing === undefined ||
          (existing.length === offsets.length &&
            existing.every((offset, index) => offset === offsets[index]));
        pendingHistory.set(acceptedSource, matches ? offsets : null);
      }
      let retained = 0;
      for (const source of pendingHistory.keys()) retained += source.length;
      if (retained > 2_000_000 || pendingHistory.size > 32) {
        // Evicting ambiguity witnesses could revive a foreign dollar later.
        // Only history restoration is disabled; live ownership remains intact.
        pendingHistoryAvailable = false;
        pendingHistory.clear();
      }
    }
    function navigateHistory(action: () => void) {
      restoringPendingHistory = true;
      if (pendingHistoryTimer !== null)
        window.clearTimeout(pendingHistoryTimer);
      // Canonical history updates React's source in this event. A no-op must
      // not authorize a later unrelated external/source-editor revision.
      pendingHistoryTimer = window.setTimeout(() => {
        restoringPendingHistory = false;
        pendingHistoryTimer = null;
      }, 0);
      action();
    }
    function publishAnalysisDiagnostic() {
      if (
        !projectionIsCurrent() ||
        (!sessionAware &&
          latest.current.sourceIsCurrent?.(acceptedSource) === false)
      )
        return;
      latest.current.onAnalysisDiagnostic?.(
        projection.mapping.path,
        acceptedSource,
        projection.analysisDiagnostic,
        ...(sessionAware ? [{ ...projectionWitness! }] : []),
      );
    }
    function pendingAfterPatch(from: number, to: number, newEnd: number) {
      return new Set(
        [...pendingDollars].flatMap((offset) =>
          offset + 2 <= from
            ? [offset]
            : offset >= to
              ? [offset + newEnd - to]
              : [],
        ),
      );
    }
    function pendingAfterTransaction(
      next: typeof projection,
      transaction: Transaction,
    ) {
      const retained = new Set<number>();
      // A structural canonicalization can replace the whole projection. Refuse
      // provenance rather than infer character ownership from repeated bytes.
      if (!next.doc.eq(transaction.doc)) return retained;
      for (const offset of pendingDollars) {
        const position = renderedPositionFromSourceOffset(projection, offset);
        if (position === null) continue;
        const start = transaction.mapping.mapResult(position, 1);
        const end = transaction.mapping.mapResult(position + 1, -1);
        if (start.deleted || end.deleted || end.pos !== start.pos + 1) continue;
        const mapped = renderedTextSourceOffset(next, start.pos, -1);
        if (
          mapped !== null &&
          next.mapping.source.slice(mapped, mapped + 2) === '\\$'
        )
          retained.add(mapped);
      }
      return retained;
    }
    function acceptProjection(
      next: typeof projection,
      pending = new Set<number>(),
      witness = projectionWitness,
    ) {
      const report =
        projection.analysisDiagnostic !== null ||
        next.analysisDiagnostic !== null;
      projection = next;
      acceptedSource = next.mapping.source;
      projectionWitness = witness ? { ...witness } : undefined;
      pendingDollars = pending;
      rememberPendingDollars();
      if (report) publishAnalysisDiagnostic();
    }
    const retainAttempt = (attempted: string) => {
      const generation = ++recoveryGeneration.current;
      retainedDraft.current = attempted;
      setUnappliedText(attempted);
      const persist = latest.current.onRetainAttempt;
      if (!persist) {
        setRecoveryCopy('memory');
        return;
      }
      const base = acceptedSource;
      const witness = projectionWitness ? { ...projectionWitness } : undefined;
      setRecoveryCopy('saving');
      void Promise.resolve()
        .then(() =>
          sessionAware
            ? persist(base, attempted, witness)
            : persist(base, attempted),
        )
        .then(
          () => {
            if (recoveryGeneration.current === generation)
              setRecoveryCopy('saved');
          },
          () => {
            if (recoveryGeneration.current === generation)
              setRecoveryCopy('failed');
          },
        );
    };
    const nodes = renderedSchema.nodes;
    const marks = renderedSchema.marks;
    function hiddenSource(node: ProseNode): boolean {
      if (node.type !== nodes.source_block && node.type !== nodes.source_inline)
        return false;
      return previewSourcePolicy(
        String(node.attrs.kind),
        String(node.attrs.raw ?? node.attrs.value ?? ''),
        corePluginEnabled(latest.current.runtime.corePlugins, 'react'),
        latest.current.runtime.showComponentSource === true,
      ).hidden;
    }
    function hiddenSourcePreserved(
      before: ProseNode,
      after: ProseNode,
    ): boolean {
      const protectedNodes: ProseNode[] = [];
      before.descendants((node) => {
        if (hiddenSource(node)) protectedNodes.push(node);
      });
      if (!protectedNodes.length) return true;
      let matched = 0;
      after.descendants((node) => {
        const expected = protectedNodes[matched];
        if (
          expected &&
          node.type === expected.type &&
          node.attrs.kind === expected.attrs.kind &&
          node.attrs.raw === expected.attrs.raw &&
          node.attrs.value === expected.attrs.value
        )
          matched++;
      });
      return matched === protectedNodes.length;
    }
    function visibleStart(doc: ProseNode) {
      let from = 0;
      for (
        let index = 0;
        index < doc.childCount && hiddenSource(doc.child(index));
        index++
      )
        from += doc.child(index).nodeSize;
      return from < doc.content.size
        ? (Selection.findFrom(doc.resolve(from), 1, true) ?? undefined)
        : undefined;
    }
    function hiddenEdges(doc: ProseNode) {
      const prefix: ProseNode[] = [],
        suffix: ProseNode[] = [];
      let left = 0,
        right = doc.childCount - 1;
      while (left <= right && hiddenSource(doc.child(left)))
        prefix.push(doc.child(left++));
      while (right >= left && hiddenSource(doc.child(right)))
        suffix.unshift(doc.child(right--));
      return { prefix, suffix };
    }

    const taskList: Command = (state, dispatch) => {
      for (let depth = state.selection.$from.depth; depth > 0; depth--) {
        const node = state.selection.$from.node(depth);
        if (node.type === nodes.list_item) {
          dispatch?.(
            state.tr.setNodeMarkup(
              state.selection.$from.before(depth),
              undefined,
              {
                ...node.attrs,
                checked: node.attrs.checked === null ? false : null,
              },
            ),
          );
          return true;
        }
      }
      return wrapInList(nodes.bullet_list!)(state, (transaction) => {
        const after = state.apply(transaction);
        for (let depth = after.selection.$from.depth; depth > 0; depth--) {
          const node = after.selection.$from.node(depth);
          if (node.type === nodes.list_item) {
            transaction.setNodeMarkup(
              after.selection.$from.before(depth),
              undefined,
              { ...node.attrs, checked: false },
            );
            break;
          }
        }
        dispatch?.(transaction);
      });
    };
    const rules = [
      textblockTypeInputRule(/^(#{1,6})\s$/, nodes.heading!, (match) => ({
        level: match[1]!.length,
      })),
      wrappingInputRule(/^\s*>\s$/, nodes.blockquote!),
      wrappingInputRule(/^\s*([-+*])\s$/, nodes.bullet_list!),
      wrappingInputRule(/^(\d+)\.\s$/, nodes.ordered_list!, (match) => ({
        order: +match[1]!,
      })),
      textblockTypeInputRule(/^```([\w-]*)\s$/, nodes.code_block!, (match) => ({
        language: match[1] || '',
      })),
      markRule(/\*\*([^*]+)\*\*$/, marks.strong!),
      markRule(/__([^_]+)__$/, marks.strong!),
      markRule(/(?<!\*)\*([^*]+)\*$/, marks.em!),
      markRule(/`([^`]+)`$/, marks.code!),
      markRule(/~~([^~]+)~~$/, marks.strike!),
      new InputRule(/^\[( |x|X)\]\s$/, (state, match, start, end) => {
        const transaction = state.tr.delete(start, end);
        for (let depth = state.selection.$from.depth; depth > 0; depth--) {
          if (state.selection.$from.node(depth).type === nodes.list_item) {
            const node = state.selection.$from.node(depth);
            return transaction.setNodeMarkup(
              state.selection.$from.before(depth),
              undefined,
              { ...node.attrs, checked: match[1] !== ' ' },
            );
          }
        }
        return null;
      }),
      new InputRule(/\[\[([^\]\n]+)\]\]$/, (state, match, start, end) => {
        const [target, ...alias] = match[1]!.split('|');
        return state.tr.replaceWith(
          start,
          end,
          nodes.wikilink!.create({
            target,
            alias: alias.length ? alias.join('|') : null,
          }),
        );
      }),
    ];

    // Mathematical source is child text owned by this same ProseMirror view.
    // Rendering is presentation only: selection changes never edit source/history.
    function mathView(
      initial: ProseNode,
      current: EditorView,
      getPos: () => number | undefined,
    ): NodeView {
      let node = initial;
      let alive = true;
      const display = node.type === nodes.math_block;
      const dom = document.createElement(display ? 'div' : 'span');
      dom.className = display
        ? 'rendered-math-host rendered-math-host-block'
        : 'rendered-math-host';
      dom.dataset.math = display ? 'display' : 'inline';
      const contentDOM = document.createElement(display ? 'div' : 'span');
      contentDOM.className = 'rendered-math-source';
      const rendered = document.createElement(display ? 'div' : 'span');
      rendered.className = 'rendered-math-render';
      rendered.contentEditable = 'false';
      dom.append(contentDOM, rendered);
      let cachedRaw: string | null = null;
      let cachedPair: ReturnType<typeof completedMath> = null;
      let cachedValid = false;
      let renderedRaw: string | null = null;
      function refresh() {
        const position = getPos();
        if (position === undefined) return;
        const raw = node.textContent;
        if (cachedRaw !== raw) {
          cachedRaw = raw;
          cachedPair = completedMath(raw);
          cachedValid =
            !!cachedPair && validLatex(cachedPair.originalInner, display);
        }
        const paired = cachedPair;
        const enabled = corePluginEnabled(
          latest.current.runtime.corePlugins,
          'mathematics',
        );
        const valid = cachedValid;
        const { selection } = current.state;
        const from = position + 1,
          to = from + node.content.size;
        const intersects = selection.empty
          ? selection.from >= from && selection.from <= to
          : selection.from < to && selection.to > from;
        const showSource = !enabled || !valid || intersects;
        dom.classList.toggle(
          'rendered-math-invalid',
          enabled && !!paired && !valid,
        );
        dom.classList.toggle('rendered-math-revealed', showSource);
        contentDOM.hidden = !showSource;
        rendered.hidden = showSource;
        if (!showSource && renderedRaw !== raw) {
          renderMathematics(rendered, paired!.originalInner, raw, display);
          renderedRaw = raw;
        } else if (showSource && renderedRaw !== null) {
          rendered.replaceChildren();
          renderedRaw = null;
        }
      }
      rendered.addEventListener('mousedown', (event) => {
        if (
          !(event instanceof MouseEvent) ||
          !alive ||
          !projectionIsCurrent() ||
          event.button !== 0 ||
          latest.current.disabled
        )
          return;
        const position = getPos();
        if (position === undefined) return;
        event.preventDefault();
        const delimiter = node.textContent.startsWith('$$') ? 2 : 1;
        current.dispatch(
          current.state.tr.setSelection(
            TextSelection.create(
              current.state.doc,
              position + 1 + Math.min(delimiter, node.content.size),
            ),
          ),
        );
        current.focus();
      });
      presentationRefreshers.current.add(refresh);
      refresh();
      return {
        dom,
        contentDOM,
        update(next) {
          if (next.type !== node.type) return false;
          node = next;
          refresh();
          return true;
        },
        ignoreMutation(mutation) {
          // Let PM observe every actual source text/composition mutation.
          if (mutation.type === 'selection') return false;
          return (
            rendered.contains(mutation.target) ||
            (mutation.type === 'attributes' &&
              (mutation.target === dom || mutation.target === contentDOM))
          );
        },
        destroy() {
          alive = false;
          presentationRefreshers.current.delete(refresh);
        },
      };
    }
    function listItemView(
      node: ProseNode,
      _view: EditorView,
      getPos: () => number | undefined,
    ): NodeView {
      let alive = true;
      const li = document.createElement('li');
      const contentDOM = document.createElement('div');
      const checkbox = document.createElement('input');
      checkbox.type = 'checkbox';
      checkbox.className = 'rendered-task-toggle';
      checkbox.contentEditable = 'false';
      function update(current: ProseNode) {
        if (current.type !== nodes.list_item) return false;
        node = current;
        if (typeof node.attrs.checked === 'boolean') {
          li.dataset.task = String(node.attrs.checked);
          checkbox.checked = node.attrs.checked;
          checkbox.setAttribute('aria-label', `Task: ${node.textContent}`);
          if (!checkbox.parentNode) li.prepend(checkbox);
        } else {
          delete li.dataset.task;
          checkbox.remove();
        }
        return true;
      }
      checkbox.addEventListener('change', () => {
        const editor = view.current;
        const pos = getPos();
        if (
          !alive ||
          editor !== _view ||
          !projectionIsCurrent() ||
          !editor ||
          latest.current.disabled ||
          pos === undefined
        ) {
          checkbox.checked = Boolean(node.attrs.checked);
          return;
        }
        editor.dispatch(
          editor.state.tr
            .setNodeMarkup(pos, undefined, {
              ...node.attrs,
              checked: checkbox.checked,
            })
            .setMeta('isolated', true),
        );
      });
      li.append(contentDOM);
      update(node);
      return {
        dom: li,
        contentDOM,
        update,
        destroy: () => {
          alive = false;
        },
        stopEvent: (event) => event.target === checkbox,
        ignoreMutation: (mutation) =>
          mutation.type !== 'selection' &&
          (mutation.target === checkbox || mutation.target === li),
      };
    }
    function imageView(node: ProseNode): NodeView {
      const dom = document.createElement('span');
      dom.className = 'rendered-image';
      dom.contentEditable = 'false';
      let url: string | null = null;
      const refresh = () => {
        if (url) return;
        const asset = latest.current.runtime.images.find(
          (item) => `attachment:${item.id}` === node.attrs.src,
        );
        if (asset && asset.mime !== 'application/pdf') {
          const img = document.createElement('img');
          url = URL.createObjectURL(assetBlob(asset));
          img.src = url;
          img.alt = String(node.attrs.alt || asset.name);
          img.width = asset.width!;
          img.height = asset.height!;
          dom.replaceChildren(img);
        } else dom.textContent = String(node.attrs.alt || 'Image unavailable');
      };
      refresh();
      imageRefreshers.current.add(refresh);
      return {
        dom,
        ignoreMutation: () => true,
        destroy: () => {
          imageRefreshers.current.delete(refresh);
          if (url) URL.revokeObjectURL(url);
        },
      };
    }
    function sourceView(node: ProseNode): NodeView {
      const dom = document.createElement(node.isInline ? 'span' : 'div');
      dom.contentEditable = 'false';
      dom.className = 'rendered-source-block';
      const raw = String(node.attrs.raw ?? node.attrs.value ?? '');
      const kind = String(node.attrs.kind);

      const code = document.createElement('pre');
      const literal = document.createElement('code');
      literal.textContent = raw;
      code.append(literal);
      const target = document.createElement('div');
      dom.append(code, target);
      let runtime: {
        root: Root;
        raw: string;
        report: (message: string) => void;
      } | null = null;
      const release = () => {
        if (!runtime) return;
        runtime.report('');
        runtimeRoots.current.delete(runtime);
        const root = runtime.root;
        runtime = null;
        queueMicrotask(() => root.unmount());
      };
      const refresh = () => {
        const policy = previewSourcePolicy(
          kind,
          raw,
          corePluginEnabled(latest.current.runtime.corePlugins, 'react'),
          latest.current.runtime.showComponentSource === true,
        );
        const showSource = policy.source;
        const run = policy.render;
        code.hidden = !showSource;
        target.hidden = !run;
        dom.hidden = !showSource && !run;
        if (!run) release();
        else if (!runtime) {
          const id = noticeId + '-runtime-' + ++runtimeCounter.current;
          const report = (message: string) => {
            if (message)
              notify({
                id,
                tone: 'error',
                persistent: true,
                message: 'Preview needs attention',
                detail: message,
              });
            else dismiss(id);
          };
          // A new DOM target avoids reusing a root still awaiting safe unmount.
          const host = document.createElement('div');
          target.replaceChildren(host);
          runtime = { root: createRoot(host), raw, report };
          runtimeRoots.current.add(runtime);
          runtime.root.render(
            <RenderedRuntime
              key={latest.current.runtime.rebuildVersion ?? 0}
              context={latest.current.runtime}
              raw={raw}
              onError={report}
            />,
          );
        }
      };
      refresh();
      presentationRefreshers.current.add(refresh);
      return {
        dom,
        update: (next) => {
          if (
            next.type !== node.type ||
            String(next.attrs.raw ?? next.attrs.value ?? '') !== raw ||
            next.attrs.kind !== kind
          )
            return false;
          node = next;
          return true;
        },
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => {
          presentationRefreshers.current.delete(refresh);
          release();
        },
      };
    }
    function wikiView(node: ProseNode): NodeView {
      let alive = true;
      const button = document.createElement('button');
      button.contentEditable = 'false';
      button.type = 'button';
      button.className = 'rendered-wikilink';
      button.textContent = String(node.attrs.alias || node.attrs.target);
      button.title = `Open ${node.attrs.target}`;
      const link = () =>
        latest.current.wikilinks.find(
          (candidate) =>
            candidate.span.target === node.attrs.target &&
            candidate.status === 'resolved',
        );
      if (!link()) button.dataset.missing = 'true';
      button.addEventListener('click', () => {
        const resolved = link();
        if (
          alive &&
          projectionIsCurrent() &&
          !latest.current.disabled &&
          resolved?.targetId
        )
          latest.current.openNote?.(resolved.targetId);
      });
      return {
        dom: button,
        stopEvent: () => true,
        ignoreMutation: () => true,
        destroy: () => {
          alive = false;
        },
      };
    }
    // Browsers normalize a native Select All range around display:none and
    // noneditable runtime atoms. Preserve the editor's explicit selection until
    // the user chooses a different caret/range, rather than accepting a partial
    // DOM selection as authorization to replace only part of the document.
    let selectingAll = false;
    let compositionBase: EditorState | null = null;
    let compositionFrame: number | null = null;
    function ownedNativeInputRange(
      current: EditorView,
    ): { from: number; to: number } | null {
      const native = current.dom.ownerDocument.getSelection();
      if (
        !native?.anchorNode ||
        !native.focusNode ||
        !current.dom.contains(native.anchorNode) ||
        !current.dom.contains(native.focusNode)
      )
        return null;
      for (const node of [native.anchorNode, native.focusNode]) {
        const element = node instanceof Element ? node : node.parentElement;
        if (element?.closest('[contenteditable="false"]')) return null;
      }
      try {
        const anchor = current.posAtDOM(native.anchorNode, native.anchorOffset);
        const head = current.posAtDOM(native.focusNode, native.focusOffset);
        const from = Math.min(anchor, head),
          to = Math.max(anchor, head);
        return from >= 0 && to <= current.state.doc.content.size
          ? { from, to }
          : null;
      } catch {
        return null;
      }
    }
    function insertDollar(
      current: EditorView,
      from: number,
      to: number,
      text: string,
    ): boolean {
      if (
        !text.includes('$') ||
        current.composing ||
        compositionBase ||
        latest.current.disabled ||
        retainedDraft.current !== null
      )
        return false;
      let crossesOpaque = false;
      current.state.doc.nodesBetween(from, to, (node) => {
        if (
          node.type === nodes.source_block ||
          node.type === nodes.source_inline
        )
          crossesOpaque = true;
      });
      if (crossesOpaque) return false;
      const point = current.state.doc.resolve(from);
      const parent = point.parent;
      if (
        [point.nodeBefore, point.nodeAfter].some((node) =>
          node?.marks.some((mark) => mark.type === marks.math_source),
        )
      )
        return insertMathDollar(current, from, to, text);
      if (parent.type === nodes.inline_math || parent.type === nodes.math_block)
        return insertMathDollar(current, from, to, text);
      if (
        parent.type.spec.code ||
        current.state.doc
          .resolve(from)
          .marks()
          .some((mark) => mark.type === marks.code)
      )
        return false;
      let offset = renderedTextSourceOffset(projection, from, -1);
      const end = renderedTextSourceOffset(projection, to, -1);
      if (offset === null || end === null || end < offset) return false;
      let replacement = escapeRenderedText(
        text,
        to === current.state.doc.resolve(to).end(),
      );
      let promoted = false;
      // Only this editor's own dollars may become delimiters. Source-authored
      // escapes have identical spelling, but never receive this provenance.
      // Bound speculative parsing even in a long sequence of unpaired runs.
      let candidateBudget = 500_000;
      for (const opening of [...pendingDollars]
        .filter((value) => value <= offset! && !pendingDollars.has(value - 2))
        .sort((a, b) => b - a)
        .slice(0, 32)) {
        const position = renderedPositionFromSourceOffset(projection, opening);
        if (position === null || position > from) continue;
        candidateBudget -= from - position + text.length;
        if (candidateBudget < 0) break;
        let opaque = false;
        current.state.doc.nodesBetween(position, to, (node) => {
          if (
            node.type === nodes.source_inline ||
            node.type === nodes.source_block ||
            node.type.spec.code ||
            node.marks.some((mark) => mark.type !== marks.math_source)
          )
            opaque = true;
        });
        if (opaque) continue;
        // A deliberate Source escape inside the candidate remains literal.
        let foreignDollar = false;
        for (let index = opening; index < end; index++) {
          if (acceptedSource[index] === '$' && !pendingDollars.has(index - 1))
            foreignDollar = true;
        }
        if (foreignDollar) continue;
        const visible =
          current.state.doc.textBetween(position, from, '\n\n', '') + text;
        const pair = completedMath(visible);
        if (!pair || !pair.originalInner.trim()) continue;
        offset = opening;
        replacement = preserveMathBreaks(
          acceptedSource.slice(opening, end),
          visible,
        );
        promoted = true;
        break;
      }
      if (!promoted) {
        const pair = completedMath(text);
        if (pair?.originalInner.trim()) {
          replacement = text;
          promoted = true;
        }
      }
      const next =
        acceptedSource.slice(0, offset) +
        replacement +
        acceptedSource.slice(end);
      if (
        !mathSourceContextPreserved(
          acceptedSource,
          next,
          offset,
          end,
          latest.current.path,
        )
      )
        return false;
      const parsed = reparseRenderedMathEdit(
        projection,
        next,
        offset,
        end,
        offset + replacement.length,
      );
      const caret = renderedPositionFromSourceOffset(
        parsed,
        offset + replacement.length,
      );
      if (caret === null) return false;
      const receipt = applyCanonical(next, true);
      if (!receipt.accepted) return false;
      const pending = [...pendingDollars].flatMap((value) =>
        value + 2 <= offset!
          ? [value]
          : value >= end
            ? [value + offset! + replacement.length - end]
            : [],
      );
      if (!promoted)
        for (let index = 0; index < replacement.length - 1; index++)
          if (replacement[index] === '\\' && replacement[index + 1] === '$')
            pending.push(offset + index);
      selectingAll = false;
      const transaction = current.state.tr.replaceWith(
        0,
        current.state.doc.content.size,
        parsed.doc.content,
      );
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(caret)),
      );
      const nextState = current.state.apply(transaction);
      acceptProjection(
        rebaseRenderedProjection(parsed, nextState.doc, next),
        new Set(pending),
        receipt.witness,
      );
      current.updateState(nextState);
      return true;
    }
    function insertMathDollar(
      current: EditorView,
      from: number,
      to: number,
      text: string,
    ): boolean {
      if (
        !text.includes('$') ||
        current.composing ||
        compositionBase ||
        latest.current.disabled ||
        retainedDraft.current !== null
      )
        return false;
      const offset = renderedTextSourceOffset(projection, from, -1);
      const end = renderedTextSourceOffset(projection, to, -1);
      if (offset === null || end === null || end < offset) return false;
      let crossesOpaque = false;
      current.state.doc.nodesBetween(from, to, (node) => {
        if (
          node.type === nodes.source_block ||
          node.type === nodes.source_inline
        )
          crossesOpaque = true;
      });
      if (crossesOpaque) return false;
      let replacement = text;
      if (text.includes('\n') && !text.includes('\r')) {
        // Browsers expose editable newlines as LF. Keep the selected source's
        // physical breaks; a collapsed insertion inherits its local block.
        // Explicit CR/CRLF input remains authored bytes rather than inferred.
        let physical = acceptedSource.slice(offset, end);
        if (!/[\r\n]/.test(physical)) {
          const parent = projection.mapping.ranges.get(
            current.state.doc.resolve(from).parent,
          );
          if (parent) physical = acceptedSource.slice(parent.from, parent.to);
        }
        if (!/[\r\n]/.test(physical))
          physical =
            /\r\n|\r|\n/.exec(acceptedSource.slice(offset))?.[0] ??
            /\r\n|\r|\n/.exec(acceptedSource)?.[0] ??
            '\n';
        replacement = preserveMathBreaks(physical, text);
      }
      const next =
        acceptedSource.slice(0, offset) +
        replacement +
        acceptedSource.slice(end);
      if (
        !mathSourceContextPreserved(
          acceptedSource,
          next,
          offset,
          end,
          latest.current.path,
        )
      )
        return false;
      const parsed = reparseRenderedMathEdit(
        projection,
        next,
        offset,
        end,
        offset + replacement.length,
      );
      const target = collectLiveMath(next, latest.current.path, true).find(
        (span) => span.from <= offset && span.to >= offset + replacement.length,
      );
      const caret = renderedPositionFromSourceOffset(
        parsed,
        offset + replacement.length,
      );
      if (caret === null || !target) return false;
      const receipt = applyCanonical(next, true);
      if (!receipt.accepted) return false;
      selectingAll = false;
      const transaction = current.state.tr.replaceWith(
        0,
        current.state.doc.content.size,
        parsed.doc.content,
      );
      transaction.setSelection(
        TextSelection.near(transaction.doc.resolve(caret)),
      );
      const nextState = current.state.apply(transaction);
      acceptProjection(
        rebaseRenderedProjection(parsed, nextState.doc, next),
        pendingAfterPatch(offset, end, offset + replacement.length),
        receipt.witness,
      );
      current.updateState(nextState);
      return true;
    }
    const editor = new EditorView(mount.current, {
      state: EditorState.create({
        schema: renderedSchema,
        doc: projection.doc,
        selection: visibleStart(projection.doc),
        plugins: [
          new Plugin({
            props: {
              decorations(state) {
                const active: Decoration[] = [];
                const { selection } = state;
                state.doc.descendants((node, position) => {
                  if (
                    node.type !== nodes.inline_math &&
                    node.type !== nodes.math_block
                  )
                    return;
                  const from = position + 1,
                    to = from + node.content.size;
                  const intersects = selection.empty
                    ? selection.from >= from && selection.from <= to
                    : selection.from < to && selection.to > from;
                  if (intersects)
                    active.push(
                      Decoration.node(position, position + node.nodeSize, {
                        'data-math-selection': 'active',
                      }),
                    );
                  return false;
                });
                // Selection-driven node decoration updates run NodeView.update
                // before PM writes the native caret. Revealing in plugin.view
                // update is too late: WebKit can report a caret inside display:
                // none text while its real visual caret remains stuck there.
                return active.length
                  ? DecorationSet.create(state.doc, active)
                  : DecorationSet.empty;
              },
            },
          }),
          inputRules({ rules }),
          keymap({
            'Mod-a': (state, dispatch) => {
              selectingAll = true;
              dispatch?.(state.tr.setSelection(new AllSelection(state.doc)));
              return true;
            },
            'Mod-z': () => {
              if (!latest.current.disabled && !compositionBase)
                navigateHistory(() => latest.current.undo());
              return true;
            },
            'Mod-y': () => {
              if (!latest.current.disabled && !compositionBase)
                navigateHistory(() => latest.current.redo());
              return true;
            },
            'Mod-Shift-z': () => {
              if (!latest.current.disabled && !compositionBase)
                navigateHistory(() => latest.current.redo());
              return true;
            },
            'Mod-b': toggleMark(marks.strong!),
            'Mod-i': toggleMark(marks.em!),
            'Mod-`': toggleMark(marks.code!),
            'Mod-Shift-7': (state, dispatch) =>
              wrapInList(nodes.ordered_list!)(state, dispatch),
            'Mod-Shift-8': (state, dispatch) =>
              wrapInList(nodes.bullet_list!)(state, dispatch),
            'Mod-Shift-k': () => {
              toolbar.current?.run('link');
              return true;
            },
            'Shift-Enter': (state, dispatch) => {
              if (state.selection.$from.parent.type.spec.code) return false;
              dispatch?.(
                state.tr
                  .replaceSelectionWith(nodes.hard_break!.create())
                  .scrollIntoView(),
              );
              return true;
            },
            Enter: chainCommands((state, dispatch) => {
              for (
                let depth = state.selection.$from.depth;
                depth > 0;
                depth--
              ) {
                const item = state.selection.$from.node(depth);
                if (item.type === nodes.list_item)
                  return splitListItem(nodes.list_item!, {
                    checked: item.attrs.checked === null ? null : false,
                  })(state, dispatch);
              }
              return false;
            }, baseKeymap.Enter!),
            Tab: chainCommands(goToNextCell(1), sinkListItem(nodes.list_item!)),
            'Shift-Tab': chainCommands(
              goToNextCell(-1),
              liftListItem(nodes.list_item!),
            ),
            'Mod-Alt-0': setBlockType(nodes.paragraph!),
            'Mod-Alt-1': setBlockType(nodes.heading!, { level: 1 }),
            'Mod-Alt-2': setBlockType(nodes.heading!, { level: 2 }),
          }),
          keymap(baseKeymap),
          tableEditing(),
        ],
      }),
      attributes: {
        'aria-label': 'Editable document',
        role: 'textbox',
        'aria-multiline': 'true',
        spellcheck: 'true',
      },
      // Let an already-owned IME finish its atomic DOM read before making
      // the surface read-only. Source writes still obey latest.disabled.
      editable: () => !latest.current.disabled || compositionBase !== null,
      createSelectionBetween: (current) =>
        selectingAll ? new AllSelection(current.state.doc) : null,
      handleDOMEvents: {
        compositionstart: (current) => {
          if (compositionFrame !== null) {
            // The next IME session can begin before the previous end's frame.
            // Publish its observed final state before acquiring a new base.
            cancelAnimationFrame(compositionFrame);
            finishComposition();
          }
          if (latest.current.disabled || retainedDraft.current !== null)
            return true;
          if (!compositionBase) compositionBase = current.state;
          current.setProps({});
          // Own the whole IME from its first DOM mutation until its final
          // native read, including when a competing revision locks the editor.
          latest.current.onPendingChange?.(true);
          setDocumentComposing(true);
          return false;
        },
        mousedown: (current, event) => {
          selectingAll = false;
          if (
            current.editable &&
            !current.composing &&
            event.button === 0 &&
            event.target instanceof HTMLElement &&
            event.target.isContentEditable &&
            current.state.selection.empty &&
            !current.hasFocus()
          ) {
            // WebKit can reset the DOM caret to the first block on refocus.
            // A click at the existing model position skips PM's selection
            // write, so sync the caret before PM handles the pointer normally.
            current.focus();
          }
          return false;
        },
        touchstart: () => {
          selectingAll = false;
          return false;
        },
        blur: () => {
          selectingAll = false;
          return false;
        },
        input: (current, event) => {
          if (
            !selectingAll ||
            latest.current.disabled ||
            current.composing ||
            !(event instanceof InputEvent) ||
            event.isComposing ||
            event.inputType !== 'insertText' ||
            typeof event.data !== 'string' ||
            !(current.state.selection instanceof AllSelection)
          )
            return false;
          // Some insertion APIs emit only input. Reconcile that native DOM
          // mutation through the same owned selection and guarded source patch.
          current.dispatch(current.state.tr.insertText(event.data));
          return true;
        },
        beforeinput: (current, event) => {
          if (
            event.inputType === 'historyUndo' ||
            event.inputType === 'historyRedo'
          ) {
            event.preventDefault();
            if (
              !compositionBase &&
              !event.isComposing &&
              !latest.current.disabled
            ) {
              if (event.inputType === 'historyUndo')
                navigateHistory(() => latest.current.undo());
              else navigateHistory(() => latest.current.redo());
            }
            return true;
          }
          if (latest.current.disabled || event.isComposing) return false;
          if (
            event.inputType === 'insertText' &&
            typeof event.data === 'string' &&
            event.data.includes('$')
          ) {
            // selectionchange is asynchronous: the native range may already be
            // in a different paragraph than the cached PM selection. Map the
            // owned pre-input range through public APIs before a source write.
            // Explicit Select All remains authoritative around hidden atoms.
            const range =
              selectingAll && current.state.selection instanceof AllSelection
                ? current.state.selection
                : ownedNativeInputRange(current);
            if (
              range &&
              insertDollar(current, range.from, range.to, event.data)
            ) {
              event.preventDefault();
              return true;
            }
          }
          if (
            selectingAll &&
            current.state.selection instanceof AllSelection &&
            event.inputType === 'insertText' &&
            typeof event.data === 'string'
          ) {
            // WebKit may not report a useful DOM mutation for its normalized
            // native range. Apply the host-owned selection before DOM editing.
            event.preventDefault();
            current.dispatch(current.state.tr.insertText(event.data));
            return true;
          }
          return false;
        },
      },
      handleTextInput: (current, from, to, text) => {
        if (insertDollar(current, from, to, text)) return true;
        // Native DOM selection cannot reliably span display:none setup atoms.
        // Honor the editor-owned Select All rather than the browser's collapsed
        // DOM range; the transaction guard below retains invisible setup.
        if (!selectingAll || !(current.state.selection instanceof AllSelection))
          return false;
        current.dispatch(current.state.tr.insertText(text));
        return true;
      },
      handleKeyDown: (current, event) => {
        if (event.isComposing || current.composing) return false;
        if (
          /^(?:Arrow(?:Left|Right|Up|Down)|PageUp|PageDown|Home|End|Escape|Tab)$/.test(
            event.key,
          )
        ) {
          selectingAll = false;
          if (
            current.state.selection instanceof AllSelection &&
            event.key !== 'Escape' &&
            event.key !== 'Tab' &&
            !event.shiftKey &&
            !event.ctrlKey &&
            !event.metaKey &&
            !event.altKey
          ) {
            // The browser may hold an empty native range around invisible
            // setup. Collapse the actual editor selection to editable text.
            const forward = /(?:Right|Down|End)$/.test(event.key);
            const edge = forward ? current.state.doc.content.size : 0;
            const caret = Selection.findFrom(
              current.state.doc.resolve(edge),
              forward ? -1 : 1,
              true,
            );
            if (caret) {
              current.dispatch(
                current.state.tr.setSelection(caret).scrollIntoView(),
              );
              return true;
            }
          }
        }
        if (
          !latest.current.disabled &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          (event.key === 'ArrowRight' || event.key === 'ArrowLeft') &&
          current.state.selection instanceof TextSelection &&
          (current.state.selection.empty || event.shiftKey)
        ) {
          const selection = current.state.selection;
          const forward = event.key === 'ArrowRight';
          const neighbor = forward
            ? selection.$head.nodeAfter
            : selection.$head.nodeBefore;
          if (
            neighbor &&
            neighbor.type === nodes.inline_math &&
            neighbor.content.size
          ) {
            const position = forward
              ? selection.head
              : selection.head - neighbor.nodeSize;
            // The hidden source and inert KaTeX sibling can make native arrows
            // skip an inline node or enter its wrong edge. Cross that one model
            // boundary while consuming exactly one visible dollar character.
            // Inside source and when leaving it, native text movement remains.
            const target =
              position + 1 + (forward ? 1 : neighbor.content.size - 1);
            current.dispatch(
              current.state.tr.setSelection(
                TextSelection.create(
                  current.state.doc,
                  event.shiftKey ? selection.anchor : target,
                  target,
                ),
              ),
            );
            current.focus();
            return true;
          }
        }
        if (
          !latest.current.disabled &&
          !event.ctrlKey &&
          !event.metaKey &&
          !event.altKey &&
          /^Arrow(?:Right|Left|Down|Up)$/.test(event.key) &&
          current.state.selection instanceof TextSelection &&
          (current.state.selection.empty || event.shiftKey)
        ) {
          const selection = current.state.selection;
          const head = selection.$head;
          const forward =
            event.key === 'ArrowRight' || event.key === 'ArrowDown';
          if (head.depth > 0 && head.parent.isTextblock) {
            let position = forward ? head.after() : head.before();
            const boundary = current.state.doc.resolve(position);
            const neighbor = forward ? boundary.nodeAfter : boundary.nodeBefore;
            const direction =
              event.key === 'ArrowDown'
                ? 'down'
                : event.key === 'ArrowUp'
                  ? 'up'
                  : forward
                    ? 'forward'
                    : 'backward';
            if (
              neighbor &&
              neighbor.type === nodes.math_block &&
              neighbor.content.size &&
              current.endOfTextblock(direction)
            ) {
              if (!forward) position -= neighbor.nodeSize;
              // Enter only an adjacent hidden display block at a proven text
              // boundary. Wrapped lines and movement inside source stay native.
              const target =
                position +
                1 +
                (forward
                  ? Math.min(2, neighbor.content.size)
                  : Math.max(0, neighbor.content.size - 2));
              current.dispatch(
                current.state.tr.setSelection(
                  TextSelection.create(
                    current.state.doc,
                    event.shiftKey ? selection.anchor : target,
                    target,
                  ),
                ),
              );
              current.focus();
              return true;
            }
          }
        }
        if (
          event.isComposing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !current.state.selection.empty
        )
          return false;
        if (
          (event.key === 'Home' || event.key === 'End') &&
          current.state.selection instanceof TextSelection
        ) {
          const head = current.state.selection.$head;
          let textOnly = head.parent.isTextblock;
          head.parent.forEach((child) => {
            if (!child.isText) textOnly = false;
          });
          if (textOnly) {
            const start = head.start();
            const end = head.end();
            const first = current.coordsAtPos(start, 1);
            const last = current.coordsAtPos(end, -1);
            if (
              first.bottom > first.top &&
              last.bottom > last.top &&
              Math.abs(first.top - last.top) < 1 &&
              Math.abs(first.bottom - last.bottom) < 1
            ) {
              // Native Home/End can normalize the DOM caret around hidden
              // setup atoms. Own the unambiguous single-line text selection;
              // wrapped lines and inline node views keep browser navigation.
              current.dispatch(
                current.state.tr
                  .setSelection(
                    TextSelection.create(
                      current.state.doc,
                      event.key === 'Home' ? start : end,
                    ),
                  )
                  .scrollIntoView(),
              );
              // Also repair a native caret when the model selection was already
              // at this endpoint (an equal-selection dispatch skips DOM sync).
              current.focus();
              return true;
            }
          }
        }
        return false;
      },
      // Drop HTML before ProseMirror creates DOM from clipboard markup. Even
      // detached img elements can issue requests before a node view is created.
      transformPastedHTML: () => '',
      nodeViews: {
        inline_math: mathView,
        math_block: mathView,
        image: imageView,
        list_item: listItemView,
        source_block: sourceView,
        source_inline: sourceView,
        wikilink: wikiView,
      },
      handlePaste: (current, event) => {
        const text = event.clipboardData?.getData('text/plain');
        if (!text || event.clipboardData?.files.length) return false;
        if (event.clipboardData?.getData('text/html')) {
          current.dispatch(
            current.state.tr.insertText(text).setMeta('isolated', true),
          );
          return true;
        }
        if (!/[\n\r]|^#{1,6}\s|\*\*|^[-*+] |\[\[/.test(text)) return false;
        const parsed = parseRenderedSource(text, 'paste.md');
        // A single paragraph supplies inline content. Closing its wrapper
        // leaves the insertion endpoint between blocks, beyond the pasted text.
        const open =
          parsed.doc.childCount === 1 &&
          parsed.doc.firstChild?.type === nodes.paragraph
            ? 1
            : 0;
        current.dispatch(
          current.state.tr
            .replaceSelection(new Slice(parsed.doc.content, open, open))
            .setMeta('isolated', true),
        );
        return true;
      },
      dispatchTransaction: (transaction) => {
        if (
          transaction.docChanged &&
          ((latest.current.disabled && compositionBase === null) ||
            retainedDraft.current !== null)
        ) {
          // Only an already-owned IME may finish a provisional DOM read while
          // disabled; its finalizer retains the whole attempt without applying.
          // Retain a refused source patch until explicit recovery; a later DOM
          // mutation must not replace the user's unapplied text.
          editor.updateState(editor.state);
          return;
        }
        if (
          transaction.docChanged &&
          editor.state.selection instanceof AllSelection &&
          !hiddenSourcePreserved(editor.state.doc, transaction.doc)
        ) {
          // Select All refers to the visible body. Prefix/suffix setup remains
          // byte-for-byte source; interleaved hidden code still fails closed.
          const { prefix, suffix } = hiddenEdges(editor.state.doc);
          const body = transaction.doc;
          const content = Fragment.fromArray([
            ...prefix,
            ...Array.from({ length: body.childCount }, (_, index) =>
              body.child(index),
            ),
            ...suffix,
          ]);
          if (editor.state.doc.type.validContent(content)) {
            const restored = editor.state.doc.copy(content);
            if (hiddenSourcePreserved(editor.state.doc, restored)) {
              const end =
                prefix.reduce((size, node) => size + node.nodeSize, 0) +
                body.content.size;
              const replacement = editor.state.tr
                .replaceWith(0, editor.state.doc.content.size, content)
                .setMeta('isolated', true);
              replacement.setSelection(
                TextSelection.near(replacement.doc.resolve(end), -1),
              );
              transaction = replacement;
            }
          }
        }
        if (
          transaction.docChanged &&
          !hiddenSourcePreserved(editor.state.doc, transaction.doc)
        ) {
          // A boundary Backspace/Delete must never erase invisible setup. Treat
          // this as a source-neutral no-op; subsequent ordinary typing is free.
          const onlyInvisibleChange =
            editor.state.doc.textBetween(
              0,
              editor.state.doc.content.size,
              '\n\n',
            ) ===
            transaction.doc.textBetween(
              0,
              transaction.doc.content.size,
              '\n\n',
            );
          if (!editor.state.selection.empty && !onlyInvisibleChange) {
            let attempted = transaction.doc.textBetween(
              0,
              transaction.doc.content.size,
              '\n\n',
            );
            try {
              attempted = serializeRenderedChange(
                projection,
                transaction.doc,
                transaction,
              );
            } catch {
              /* Preserve at least the exact attempted visible text. */
            }
            retainAttempt(attempted);
            setError(
              'This selection includes hidden component source. The source is unchanged and your attempted edit was retained. Use Source to change that code.',
            );
          }
          const visible = !editor.state.selection.$head.parent.inlineContent
            ? (Selection.findFrom(editor.state.selection.$from, 1, true) ??
              Selection.findFrom(editor.state.selection.$from, -1, true))
            : null;
          editor.updateState(
            visible
              ? editor.state.apply(editor.state.tr.setSelection(visible))
              : editor.state,
          );
          return;
        }
        if (transaction.docChanged) selectingAll = false;
        let nextState = editor.state.apply(transaction);
        if (transaction.docChanged && compositionBase) {
          // An IME can temporarily remove dollars, then continue mutating the
          // same source text. Keep that owned DOM alive until its final read;
          // commit one source transaction after composition ends.
          editor.updateState(nextState);
          return;
        }
        if (transaction.docChanged) {
          let attempted = nextState.doc.textBetween(
            0,
            nextState.doc.content.size,
            '\n\n',
          );
          try {
            const next = serializeRenderedChange(
              projection,
              nextState.doc,
              transaction,
            );
            attempted = next;
            let rebased;
            try {
              rebased = rebaseRenderedProjection(
                projection,
                nextState.doc,
                next,
              );
            } catch (reason) {
              // Removing a delimiter intentionally changes math into ordinary
              // text. Only canonicalize an owned edit wholly inside its exact
              // original source span; every unrelated MDX byte stays guarded.
              const oldHead = editor.state.selection.$head;
              const oldMath = oldHead.parent;
              const complete =
                oldMath.type === nodes.inline_math ||
                oldMath.type === nodes.math_block;
              const around = [oldHead.nodeBefore, oldHead.nodeAfter].find(
                (node) =>
                  node?.isText &&
                  node.marks.some((mark) => mark.type === marks.math_source),
              );
              // Adjacent resolved text may be a cut text node; use its original
              // parent child identity so provenance is never guessed by string.
              let draftNode: ProseNode | null = null;
              if (around)
                oldMath.forEach((node, start) => {
                  if (
                    node.isText &&
                    node.marks.some(
                      (mark) => mark.type === marks.math_source,
                    ) &&
                    start <= oldHead.parentOffset &&
                    start + node.nodeSize >= oldHead.parentOffset
                  )
                    draftNode = node;
                });
              const mathRange = projection.mapping.ranges.get(
                complete ? oldMath : draftNode!,
              );
              if (
                (!complete && !draftNode) ||
                !mathRange ||
                !next.startsWith(acceptedSource.slice(0, mathRange.from)) ||
                !next.endsWith(acceptedSource.slice(mathRange.to)) ||
                !mathSourceContextPreserved(
                  acceptedSource,
                  next,
                  mathRange.from,
                  mathRange.to,
                  latest.current.path,
                )
              )
                throw reason;
              let changedFrom = 0;
              while (
                changedFrom < acceptedSource.length &&
                changedFrom < next.length &&
                acceptedSource[changedFrom] === next[changedFrom]
              )
                changedFrom++;
              let oldEnd = acceptedSource.length,
                newEnd = next.length;
              while (
                oldEnd > changedFrom &&
                newEnd > changedFrom &&
                acceptedSource[oldEnd - 1] === next[newEnd - 1]
              ) {
                oldEnd--;
                newEnd--;
              }
              const parsed = reparseRenderedMathEdit(
                projection,
                next,
                changedFrom,
                oldEnd,
                newEnd,
              );
              const caret = renderedPositionFromSourceOffset(parsed, newEnd);
              if (caret === null) throw reason;
              const canonical = nextState.tr.replaceWith(
                0,
                nextState.doc.content.size,
                parsed.doc.content,
              );
              canonical.setSelection(
                TextSelection.near(canonical.doc.resolve(caret)),
              );
              nextState = nextState.apply(canonical);
              rebased = parsed;
            }
            const typing =
              !transaction.getMeta('isolated') &&
              transaction.steps.every(
                (step) => step.toJSON().stepType === 'replace',
              );
            const receipt = applyCanonical(
              next,
              typing,
              transaction.getMeta('renderedCompositionCommit')
                ? 'start'
                : undefined,
            );
            if (!receipt.accepted) {
              setError(
                'The document changed before this edit could be applied. Your saved source is unchanged.',
              );
              retainAttempt(attempted);
              editor.updateState(editor.state);
              return;
            }
            acceptProjection(
              rebased,
              pendingAfterTransaction(rebased, transaction),
              receipt.witness,
            );
            setError('');
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'This edit could not be applied.',
            );
            retainAttempt(attempted);
            editor.updateState(editor.state);
            return;
          }
        }
        editor.updateState(nextState);
      },
    });
    view.current = editor;
    publishAnalysisDiagnostic();
    // Runtime-backed atoms never submit messages or transforms to this editor.
    const onSourceChange = () => {
      if (!protocolMatches()) return;
      const next = latest.current.source;
      const incoming = latest.current.sourceWitness;
      if (sessionAware) {
        if (
          !incoming ||
          !projectionWitness ||
          !validSourceWitness(incoming) ||
          incoming.source !== next ||
          incoming.sessionId !== projectionWitness.sessionId ||
          incoming.editorRevision < projectionWitness.editorRevision ||
          !latest.current.witnessIsCurrent?.(incoming)
        )
          return;
        if (sameSourceWitness(incoming, projectionWitness)) return;
      }
      if (
        !sessionAware &&
        (latest.current.sourceIsCurrent?.(next) === false ||
          next === acceptedSource)
      )
        return;
      // A Select All intent belongs to its original source revision. Undo,
      // redo or an accepted external refresh must not carry it into new text.
      const previousAllSelection =
        selectingAll || editor.state.selection instanceof AllSelection;
      selectingAll = false;
      const restoredPending = restoringPendingHistory
        ? pendingHistory.get(next)
        : undefined;
      if (!restoringPendingHistory) {
        pendingHistoryAvailable = false;
        pendingHistory.clear();
      }
      restoringPendingHistory = false;
      pendingDollars.clear();
      const parsed = parseRenderedSource(next, latest.current.path);
      const position = Math.min(
        editor.state.selection.from,
        parsed.doc.content.size,
      );
      const transaction = editor.state.tr.replaceWith(
        0,
        editor.state.doc.content.size,
        parsed.doc.content,
      );
      transaction.setSelection(
        (previousAllSelection ? visibleStart(transaction.doc) : undefined) ??
          TextSelection.near(transaction.doc.resolve(position)),
      );
      const nextState = editor.state.apply(transaction);
      acceptProjection(
        rebaseRenderedProjection(parsed, nextState.doc, next),
        new Set(restoredPending ?? []),
        incoming,
      );
      editor.updateState(nextState);
    };
    let deferredSourceChange = false;
    const sourceChanged = () => {
      if (editor.composing || compositionBase) {
        deferredSourceChange = sessionAware
          ? Boolean(
              latest.current.sourceWitness &&
              projectionWitness &&
              !sameSourceWitness(
                latest.current.sourceWitness,
                projectionWitness,
              ),
            )
          : latest.current.source !== acceptedSource;
      } else {
        deferredSourceChange = false;
        onSourceChange();
      }
    };
    function finishComposition() {
      compositionFrame = null;
      if (compositionBase) {
        const base = compositionBase;
        compositionBase = null;
        const final = editor.state;
        if (latest.current.disabled && !final.doc.eq(base.doc)) {
          let attempted = final.doc.textBetween(
            0,
            final.doc.content.size,
            '\n\n',
          );
          try {
            attempted = serializeRenderedChange(projection, final.doc);
          } catch {
            /* Retain the complete visible attempt when source mapping refuses. */
          }
          retainAttempt(attempted);
          setError(
            'Editing became unavailable during composition. Your text was retained for recovery.',
          );
          editor.updateState(base);
        } else if (!final.doc.eq(base.doc)) {
          // The canonical apply still compares the original source revision;
          // a concurrent external update refuses this patch and retains it.
          editor.updateState(base);
          const transaction = base.tr.replaceWith(
            0,
            base.doc.content.size,
            final.doc.content,
          );
          transaction.setSelection(
            Selection.fromJSON(transaction.doc, final.selection.toJSON()),
          );
          editor.dispatch(
            transaction.setMeta('renderedCompositionCommit', true),
          );
        }
        setDocumentComposing(false);
        // Refresh EditorView's cached editable flag even if the composition
        // made no document change and props did not change again.
        editor.setProps({});
      }
      // A successful apply can precede its React source echo. Replay only
      // an actual external update that arrived during this composition.
      if (deferredSourceChange) sourceChanged();
    }
    const afterComposition = () => {
      if (compositionFrame !== null) cancelAnimationFrame(compositionFrame);
      compositionFrame = requestAnimationFrame(finishComposition);
    };
    editor.dom.addEventListener('pn-source-change', sourceChanged);
    editor.dom.addEventListener('compositionend', afterComposition);
    commandsRef.current = {
      focus: () => editor.focus(),
      format: (action) => toolbar.current?.run(action),
      insertText: (text) => {
        if (latest.current.disabled || retainedDraft.current !== null)
          return false;
        const before = acceptedSource;
        const parsed = parseRenderedSource(text, latest.current.path);
        editor.dispatch(
          editor.state.tr
            .replaceSelection(new Slice(parsed.doc.content, 0, 0))
            .setMeta('isolated', true)
            .scrollIntoView(),
        );
        editor.focus();
        return acceptedSource !== before;
      },
    };
    // Expose commands only within this component, never on window or iframe APIs.
    toolbar.current = {
      run: (name) => {
        if (latest.current.disabled) return;
        const state = editor.state;
        const dispatch = editor.dispatch.bind(editor);
        const commands: Record<string, Command> = {
          bold: toggleMark(marks.strong!),
          italic: toggleMark(marks.em!),
          code: toggleMark(marks.code!),
          bullet: wrapInList(nodes.bullet_list!),
          ordered: wrapInList(nodes.ordered_list!),
          task: taskList,
          quote: wrapIn(nodes.blockquote!),
          row: addRowAfter,
        };
        if (commands[name]) commands[name](state, dispatch, editor);
        else if (name === 'table') {
          const row = (header: boolean) =>
            nodes.table_row!.create(
              null,
              Array.from({ length: 2 }, () =>
                (header
                  ? nodes.table_header!
                  : nodes.table_cell!
                ).createAndFill()!,
              ),
            );
          dispatch(
            state.tr
              .replaceSelectionWith(
                nodes.table!.create(null, [row(true), row(false)]),
              )
              .setMeta('isolated', true)
              .scrollIntoView(),
          );
        } else if (name === 'math')
          dispatch(
            state.tr
              .replaceSelectionWith(
                nodes.math_block!.create(
                  { value: 'x^2' },
                  renderedSchema.text('$$\nx^2\n$$'),
                ),
              )
              .setMeta('isolated', true),
          );
        else if (name === 'link') {
          linkSelection.current = {
            from: state.selection.from,
            to: state.selection.to,
            source: acceptedSource,
            witness: projectionWitness ? { ...projectionWitness } : undefined,
          };
          setLinkDraft('https://');
        }
        editor.focus();
      },
      link: (href) => {
        if (!/^(https?:\/\/|mailto:|attachment:)/i.test(href)) {
          setError('Use an https, http, mailto or attachment link.');
          return;
        }
        const selected = linkSelection.current;
        if (!selected || latest.current.disabled) return;
        if (
          selected.source !== acceptedSource ||
          (sessionAware &&
            (!selected.witness ||
              !projectionWitness ||
              !sameSourceWitness(selected.witness, projectionWitness) ||
              !projectionIsCurrent())) ||
          selected.to > editor.state.doc.content.size
        ) {
          setError(
            'The text changed while the link was being edited. Your URL is retained. Cancel and select the text again.',
          );
          return;
        }
        const transaction = editor.state.tr;
        if (selected.from === selected.to)
          transaction.insertText(href, selected.from);
        transaction.addMark(
          selected.from,
          selected.to === selected.from
            ? selected.from + href.length
            : selected.to,
          marks.link!.create({ href }),
        );
        editor.dispatch(transaction.setMeta('isolated', true));
        setLinkDraft(null);
        editor.focus();
      },
    };
    return () => {
      if (pendingHistoryTimer !== null)
        window.clearTimeout(pendingHistoryTimer);
      editor.dom.removeEventListener('pn-source-change', sourceChanged);
      editor.dom.removeEventListener('compositionend', afterComposition);
      if (compositionFrame !== null) cancelAnimationFrame(compositionFrame);
      editor.destroy();
      view.current = null;
      commandsRef.current = null;
      toolbar.current = null;
    };
    // The host switches presentation without replacing the canonical source/history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [props.path, commandsRef]);

  const toolbar = useRef<{
    run: (name: string) => void;
    link: (href: string) => void;
  } | null>(null);
  useLayoutEffect(() => {
    view.current?.dom.dispatchEvent(new Event('pn-source-change'));
  }, [
    props.source,
    props.sourceIsCurrent,
    props.sourceWitness,
    props.witnessIsCurrent,
  ]);
  useEffect(() => {
    // Preserve the editor-owned atomic-IME editable predicate.
    view.current?.setProps({});
    for (const refresh of imageRefreshers.current) refresh();
    for (const refresh of presentationRefreshers.current) refresh();
    for (const runtime of runtimeRoots.current)
      runtime.root.render(
        <RenderedRuntime
          key={props.runtime.rebuildVersion ?? 0}
          context={props.runtime}
          raw={runtime.raw}
          onError={runtime.report}
        />,
      );
  }, [props.runtime, props.disabled, props.wikilinks]);
  return (
    <div className="rendered-editor" hidden={!props.active}>
      {linkDraft !== null && (
        <form
          className="rendered-link-form"
          onSubmit={(event) => {
            event.preventDefault();
            toolbar.current?.link(linkDraft);
          }}
        >
          <label htmlFor="rendered-link-url">Link URL</label>
          <input
            id="rendered-link-url"
            autoFocus
            value={linkDraft}
            onChange={(event) => setLinkDraft(event.target.value)}
          />
          <button type="submit">Apply link</button>
          <button type="button" onClick={() => setLinkDraft(null)}>
            Cancel
          </button>
        </form>
      )}
      {recoveryOpen && unappliedText !== null && (
        <Modal
          title="Retained edit"
          onClose={() => {
            if (!recoveryAction.current) setRecoveryOpen(false);
          }}
        >
          <p>
            This edit was not applied to your note. Your accepted source is
            unchanged; download or copy the retained text whenever you need an
            independent copy.
          </p>
          {recoveryCopy === 'saving' && (
            <p role="status">Saving recovery copy…</p>
          )}
          {recoveryCopy === 'saved' && (
            <p role="status">Recovery copy saved.</p>
          )}
          {recoveryCopy === 'failed' && (
            <p role="alert">
              Recovery copy could not be saved. Download or copy this text
              before leaving.
            </p>
          )}
          <textarea
            aria-label="Unapplied text"
            readOnly
            value={unappliedText}
          />
          <button
            type="button"
            onClick={() => {
              const url = URL.createObjectURL(
                new Blob([unappliedText], {
                  type: 'text/plain;charset=utf-8',
                  endings: 'transparent',
                }),
              );
              const anchor = document.createElement('a');
              anchor.href = url;
              anchor.download =
                'recovered-' + (props.path.split('/').pop() || 'note.mdx');
              anchor.click();
              setTimeout(() => URL.revokeObjectURL(url), 1000);
            }}
          >
            Download retained source
          </button>
          <button
            type="button"
            disabled={recoveryBusy}
            onClick={() => setRecoveryOpen(false)}
          >
            Keep draft
          </button>
          {props.onKeepAttempt && recoveryCopy !== 'saving' && (
            <button
              type="button"
              disabled={recoveryBusy}
              onClick={() => void releaseRecovery(false)}
            >
              {recoveryCopy === 'saved'
                ? 'Keep recovery copy and continue'
                : 'Retry recovery copy and continue'}
            </button>
          )}
          <button
            type="button"
            disabled={recoveryBusy}
            onClick={() => void releaseRecovery(true)}
          >
            Discard retained draft
          </button>
        </Modal>
      )}
      <div ref={mount} />
    </div>
  );
}
