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
  EditorState,
  Selection,
  TextSelection,
  type Command,
} from 'prosemirror-state';
import { EditorView, type NodeView } from 'prosemirror-view';
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
import { EditorState as MathState } from '@codemirror/state';
import { EditorView as MathView, keymap as mathKeymap } from '@codemirror/view';
import { defaultKeymap, history, historyKeymap } from '@codemirror/commands';
import { assetBlob } from '../../assets/catalog';
import type { LinkResolution } from '../../links';
import {
  collectLiveMath,
  planMathReplacement,
  type MathSpan,
} from '../math/mathSource';
import { renderedSchema } from './schema';
import {
  parseRenderedSource,
  serializeRenderedChange,
  rebaseRenderedProjection,
  renderedSourceRange,
} from './sourceBridge';
import {
  RenderedRuntime,
  type RenderedRuntimeContext,
} from './RenderedRuntime';
import './rendered.css';

export interface RenderedCommands {
  insertText: (text: string) => boolean;
  focus: () => void;
  format: (action: string) => void;
}
interface Props {
  source: string;
  sourceIsCurrent?: (snapshot: string) => boolean;
  path: string;
  active: boolean;
  disabled: boolean;
  commandsRef: React.RefObject<RenderedCommands | null>;
  runtime: RenderedRuntimeContext;
  wikilinks: readonly LinkResolution[];
  apply: (expected: string, next: string, typing: boolean) => boolean;
  undo: () => void;
  redo: () => void;
  openSource: (offset: number, source: string) => void;
  openNote?: (id: string) => void;
  onPendingChange?: (pending: boolean) => void;
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
  const [recoveryOpen, setRecoveryOpen] = useState(false);
  const [linkDraft, setLinkDraft] = useState<string | null>(null);
  const [mathEditing, setMathEditing] = useState(false);
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
  } | null>(null);
  useLayoutEffect(() => {
    latest.current = props;
  });
  const hasPendingDraft =
    linkDraft !== null || unappliedText !== null || mathEditing;
  useLayoutEffect(() => {
    latest.current.onPendingChange?.(hasPendingDraft);
  }, [hasPendingDraft]);
  useLayoutEffect(() => () => latest.current.onPendingChange?.(false), []);

  useEffect(() => {
    if (!mount.current) return;
    let projection = parseRenderedSource(
      latest.current.source,
      latest.current.path,
    );
    let acceptedSource = latest.current.source;
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
      new InputRule(/\$([^$\n]+)\$$/, (state, match, start, end) =>
        state.tr.replaceWith(
          start,
          end,
          nodes.inline_math!.create({ value: match[1] }),
        ),
      ),
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

    function sourceOffset(node: ProseNode): number {
      const mapped = renderedSourceRange(projection, node);
      if (mapped) return mapped.from;
      const raw = String(node.attrs.raw ?? node.attrs.value ?? '');
      const expected = Number(node.attrs.sourceFrom ?? 0);
      const source = latest.current.source;
      if (raw && source.slice(expected, expected + raw.length) === raw)
        return expected;
      const found = raw ? source.indexOf(raw) : -1;
      return found < 0 ? 0 : found;
    }
    // One active inline field at a time. A focused equation reveals its
    // original Markdown dollars in place; the existing source transaction
    // remains the sole authority for persistence and undo.
    let activeMath: { commit: () => boolean; cancel: () => void } | null = null;
    const mathEntrances = new WeakMap<Node, (edge: 'start' | 'end') => void>();
    function mathView(
      node: ProseNode,
      _view: EditorView,
      getPos: () => number | undefined,
    ): NodeView {
      const display = node.type === nodes.math_block;
      const wrapper = document.createElement(display ? 'div' : 'span');
      wrapper.className = display
        ? 'rendered-math-host rendered-math-host-block'
        : 'rendered-math-host';
      wrapper.contentEditable = 'false';
      const button = document.createElement('span');
      button.setAttribute('role', 'button');
      button.tabIndex = 0;
      button.className = `rendered-math${display ? ' rendered-math-block' : ''}`;
      let field: MathView | null = null;
      let span: MathSpan | null = null;
      let snapshot: string | null = null;
      let compositionFrame: number | null = null;
      let editContext: EventTarget | null = null;
      function cancelCompositionFrame() {
        if (compositionFrame !== null) cancelAnimationFrame(compositionFrame);
        compositionFrame = null;
      }

      function afterComposition() {
        cancelCompositionFrame();
        // Register after CM's built-in observer/listener, including Android's
        // deferred DOM read. Never close a composing or unread source buffer.
        compositionFrame = requestAnimationFrame(() => {
          compositionFrame = null;
          if (field && !field.hasFocus) {
            // Resume CM's skipped blur cleanup only after its final DOM read.
            // The normal blur handler attempts the guarded commit; a refused
            // draft remains editable with correctly synchronized focus state.
            field.contentDOM.dispatchEvent(new FocusEvent('blur'));
          }
        });
      }
      function detachComposition() {
        cancelCompositionFrame();
        editContext?.removeEventListener('compositionend', afterComposition);
        editContext = null;
      }

      function renderEquation() {
        button.setAttribute(
          'aria-label',
          `Edit ${display ? 'display' : 'inline'} equation: ${String(node.attrs.value).trim()}`,
        );
        const valid = renderMathematics(
          button,
          String(node.attrs.value),
          String(
            node.attrs.raw ||
              (display
                ? `$$\n${node.attrs.value}\n$$`
                : `$${node.attrs.value}$`),
          ),
          display,
          corePluginEnabled(latest.current.runtime.corePlugins, 'mathematics'),
        );
        wrapper.classList.toggle('rendered-math-invalid', !valid);
        wrapper.replaceChildren(button);
      }
      function close() {
        if (!field) return;
        detachComposition();
        const previous = field;
        field = null;
        previous.destroy();
        span = null;
        snapshot = null;
        dismiss(noticeId + '-math');
        if (activeMath === actions) activeMath = null;
        renderEquation();
        setMathEditing(false);
      }
      function showError(reason: string) {
        notify({
          id: noticeId + '-math',
          tone: 'error',
          message: 'Check the equation. Your LaTeX is retained.',
          detail: reason,
          persistent: true,
        });
        field?.contentDOM.setAttribute('aria-invalid', 'true');
        field?.contentDOM.setAttribute('aria-describedby', noticeId + '-math');
        wrapper.classList.add('rendered-math-invalid');
      }
      function commit(): boolean {
        if (!field || !span || snapshot === null) return true;
        // compositionStarted also covers the phase before the first insertion.
        // Every commit path must wait for the final composition DOM read.
        if (field.compositionStarted || compositionFrame !== null) return false;
        if (latest.current.disabled) {
          showError('Editing is unavailable. Your LaTeX text is retained.');
          return false;
        }
        const original = span.originalOuter.replace(/\r\n?|\n/g, '\n');
        const entered = field.state.doc.toString();
        if (entered === original) {
          close();
          return true;
        }
        const delimiters = display ? '$$' : '$';
        if (
          !entered.startsWith(delimiters) ||
          !entered.endsWith(delimiters) ||
          entered.length <= delimiters.length * 2 ||
          (!display && (entered.startsWith('$$') || entered.endsWith('$$')))
        ) {
          showError(
            `Keep the original ${delimiters} delimiters around the LaTeX.`,
          );
          return false;
        }
        const inner = entered.slice(delimiters.length, -delimiters.length);
        const planned = planMathReplacement(
          latest.current.source,
          snapshot,
          span,
          inner,
          latest.current.path,
        );
        if (!planned.ok) {
          showError(planned.reason);
          return false;
        }
        if (
          planned.source !== snapshot &&
          !latest.current.apply(snapshot, planned.source, false)
        ) {
          showError(
            'The note changed or the edit could not be saved. Your LaTeX is retained.',
          );
          return false;
        }
        // The canonical CodeMirror transaction will refresh this NodeView.
        // In the meantime keep the equation visually current.
        node = node.type.create({ ...node.attrs, value: inner, raw: entered });
        close();
        return true;
      }
      function cancel() {
        close();
      }
      const actions = { commit, cancel };
      function activate(entryEdge?: 'start' | 'end') {
        if (field || latest.current.disabled || activeMath) return;
        const source = latest.current.source;
        const math = collectLiveMath(source, latest.current.path);
        const offset = sourceOffset(node);
        const match =
          math.find(
            (candidate) =>
              candidate.from === offset &&
              candidate.kind === (display ? 'display' : 'inline'),
          ) ??
          math.find(
            (candidate) =>
              candidate.originalInner.trim() ===
                String(node.attrs.value).trim() &&
              math.filter(
                (item) =>
                  item.originalInner.trim() === candidate.originalInner.trim(),
              ).length === 1,
          );
        if (!match) return;
        span = match;
        snapshot = source;
        const host = document.createElement(display ? 'div' : 'span');
        host.className = display
          ? 'rendered-math-source rendered-math-source-block'
          : 'rendered-math-source';
        wrapper.classList.toggle(
          'rendered-math-invalid',
          corePluginEnabled(
            latest.current.runtime.corePlugins,
            'mathematics',
          ) && !validLatex(String(node.attrs.value), display),
        );
        wrapper.replaceChildren(host);
        activeMath = actions;
        setMathEditing(true);
        const leave = (direction: -1 | 1) => {
          const position = getPos();
          if (position === undefined || !commit()) return true;
          editor.dispatch(
            editor.state.tr.setSelection(
              TextSelection.near(
                editor.state.doc.resolve(
                  direction < 0 ? position : position + node.nodeSize,
                ),
                direction,
              ),
            ),
          );
          editor.focus();
          return true;
        };
        const edge = (direction: -1 | 1, vertical = false) => {
          if (!field || field.compositionStarted) return false;
          const selection = field.state.selection.main;
          if (!selection.empty) return false;
          const atEdge = vertical
            ? field.state.doc.lineAt(selection.head).number ===
              (direction < 0 ? 1 : field.state.doc.lines)
            : selection.head === (direction < 0 ? 0 : field.state.doc.length);
          return atEdge && leave(direction);
        };
        field = new MathView({
          parent: host,
          state: MathState.create({
            doc: match.originalOuter.replace(/\r\n?|\n/g, '\n'),
            extensions: [
              history(),
              MathView.lineWrapping,
              mathKeymap.of([
                { key: 'ArrowLeft', run: () => edge(-1) },
                { key: 'ArrowRight', run: () => edge(1) },
                { key: 'ArrowUp', run: () => edge(-1, true) },
                { key: 'ArrowDown', run: () => edge(1, true) },
                { key: 'Tab', run: () => leave(1) },
                { key: 'Shift-Tab', run: () => leave(-1) },
                {
                  key: 'Escape',
                  run: () => {
                    cancel();
                    editor.focus();
                    return true;
                  },
                },
                { key: 'Enter', run: () => !display && leave(1) },
                { key: 'Mod-Enter', run: () => leave(1) },
                ...historyKeymap,
                ...defaultKeymap,
              ]),
              MathView.contentAttributes.of({
                'aria-label': display
                  ? 'Display LaTeX source'
                  : 'Inline LaTeX source',
                'aria-description':
                  'Dollar-delimited mathematical source. Move the caret outside to render.',
                spellcheck: 'false',
              }),
              MathView.updateListener.of((update) => {
                if (!update.docChanged) return;
                const raw = update.state.doc.toString();
                const delimiters = display ? '$$' : '$';
                const valid =
                  !corePluginEnabled(
                    latest.current.runtime.corePlugins,
                    'mathematics',
                  ) ||
                  (raw.startsWith(delimiters) &&
                    raw.endsWith(delimiters) &&
                    validLatex(
                      raw.slice(delimiters.length, -delimiters.length),
                      display,
                    ));
                wrapper.classList.toggle('rendered-math-invalid', !valid);
                if (valid)
                  update.view.contentDOM.removeAttribute('aria-invalid');
                else
                  update.view.contentDOM.setAttribute('aria-invalid', 'true');
                update.view.contentDOM.removeAttribute('aria-describedby');
                dismiss(noticeId + '-math');
              }),
              MathView.domEventHandlers({
                blur: () => {
                  if (field && !field.compositionStarted) commit();
                },
                compositionend: afterComposition,
              }),
            ],
          }),
        });
        // Modern Android composition events target the browser EditContext,
        // not necessarily contentDOM. CM has already installed its listeners.
        editContext =
          (
            field.contentDOM as HTMLElement & {
              editContext?: EventTarget | null;
            }
          ).editContext ?? null;
        editContext?.addEventListener('compositionend', afterComposition);
        field.contentDOM.addEventListener(
          'blur',
          (event) => {
            if (field?.compositionStarted || compositionFrame !== null) {
              // CM's ordinary blur observer schedules a focus redraw, which can
              // replace an unread final composition before Android's DOM flush.
              // Native focus still moves; the completion listener owns closing.
              event.stopImmediatePropagation();
            }
          },
          true,
        );
        field.contentDOM.addEventListener(
          'keydown',
          (event) => {
            if (
              event.isComposing ||
              field?.compositionStarted ||
              compositionFrame !== null
            ) {
              // Preserve native IME default behavior, but do not interpret its
              // Enter/Escape/Tab as an editor commit or cancellation command.
              event.stopImmediatePropagation();
            }
          },
          true,
        );
        field.focus();
        field.dispatch({
          selection: {
            anchor:
              entryEdge === 'start'
                ? 0
                : entryEdge === 'end'
                  ? field.state.doc.length
                  : field.state.doc.length - (display ? 2 : 1),
          },
        });
      }
      let mathematicsEnabled = corePluginEnabled(
        latest.current.runtime.corePlugins,
        'mathematics',
      );
      const refresh = () => {
        const enabled = corePluginEnabled(
          latest.current.runtime.corePlugins,
          'mathematics',
        );
        if (enabled === mathematicsEnabled) return;
        mathematicsEnabled = enabled;
        if (!field) renderEquation();
      };
      presentationRefreshers.current.add(refresh);
      mathEntrances.set(wrapper, activate);
      button.addEventListener('click', () => activate());
      button.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          activate();
        }
      });
      renderEquation();
      return {
        dom: wrapper,
        stopEvent: () => true,
        ignoreMutation: () => true,
        selectNode: () => activate(),
        deselectNode: () => {
          if (field && !field.hasFocus) commit();
        },
        update: (next) => {
          if (next.type !== node.type) return false;
          const sameRepresentation =
            next.attrs.value === node.attrs.value &&
            next.attrs.raw === node.attrs.raw;
          node = next;
          if (!field && !sameRepresentation) renderEquation();
          return true;
        },
        destroy: () => {
          presentationRefreshers.current.delete(refresh);
          detachComposition();
          if (field) {
            field.destroy();
            field = null;
            if (activeMath === actions) {
              activeMath = null;
              setMathEditing(false);
            }
          }
        },
      };
    }
    function listItemView(
      node: ProseNode,
      _view: EditorView,
      getPos: () => number | undefined,
    ): NodeView {
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
        if (!editor || latest.current.disabled || pos === undefined) {
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
        if (!latest.current.disabled && resolved?.targetId)
          latest.current.openNote?.(resolved.targetId);
      });
      return { dom: button, stopEvent: () => true, ignoreMutation: () => true };
    }
    // Browsers normalize a native Select All range around display:none and
    // noneditable runtime atoms. Preserve the editor's explicit selection until
    // the user chooses a different caret/range, rather than accepting a partial
    // DOM selection as authorization to replace only part of the document.
    let selectingAll = false;
    const editor = new EditorView(mount.current, {
      state: EditorState.create({
        schema: renderedSchema,
        doc: projection.doc,
        selection: visibleStart(projection.doc),
        plugins: [
          inputRules({ rules }),
          keymap({
            'Mod-a': (state, dispatch) => {
              selectingAll = true;
              dispatch?.(state.tr.setSelection(new AllSelection(state.doc)));
              return true;
            },
            'Mod-z': () => {
              latest.current.undo();
              return true;
            },
            'Mod-y': () => {
              latest.current.redo();
              return true;
            },
            'Mod-Shift-z': () => {
              latest.current.redo();
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
      editable: () => !latest.current.disabled,
      createSelectionBetween: (current) =>
        selectingAll ? new AllSelection(current.state.doc) : null,
      handleDOMEvents: {
        mousedown: () => {
          selectingAll = false;
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
        beforeinput: (_editor, event) => {
          if (latest.current.disabled || event.isComposing) return false;
          if (
            event.inputType !== 'historyUndo' &&
            event.inputType !== 'historyRedo'
          )
            return false;
          event.preventDefault();
          if (event.inputType === 'historyUndo') latest.current.undo();
          else latest.current.redo();
          return true;
        },
      },
      handleTextInput: (current, _from, _to, text) => {
        // Native DOM selection cannot reliably span display:none setup atoms.
        // Honor the editor-owned Select All rather than the browser's collapsed
        // DOM range; the transaction guard below retains invisible setup.
        if (!(current.state.selection instanceof AllSelection)) return false;
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
          event.isComposing ||
          event.shiftKey ||
          event.ctrlKey ||
          event.metaKey ||
          event.altKey ||
          !current.state.selection.empty
        )
          return false;
        const forward = event.key === 'ArrowRight' || event.key === 'ArrowDown';
        const backward = event.key === 'ArrowLeft' || event.key === 'ArrowUp';
        if (!forward && !backward) return false;
        const head = current.state.selection.$head;
        const vertical = event.key === 'ArrowDown' || event.key === 'ArrowUp';
        let position = head.pos;
        let neighbor = forward ? head.nodeAfter : head.nodeBefore;
        if (!vertical && backward && neighbor) position -= neighbor.nodeSize;
        if (
          vertical &&
          head.depth > 0 &&
          (forward
            ? head.parentOffset === head.parent.content.size
            : head.parentOffset === 0)
        ) {
          position = forward ? head.after() : head.before();
          const boundary = current.state.doc.resolve(position);
          neighbor = forward ? boundary.nodeAfter : boundary.nodeBefore;
          if (!forward && neighbor) position -= neighbor.nodeSize;
        }
        if (
          !neighbor ||
          (vertical
            ? neighbor.type !== nodes.math_block
            : neighbor.type !== nodes.inline_math)
        )
          return false;
        const dom = current.nodeDOM(position);
        const enter = dom && mathEntrances.get(dom);
        if (!enter) return false;
        enter(forward ? 'start' : 'end');
        return true;
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
        current.dispatch(
          current.state.tr
            .replaceSelection(new Slice(parsed.doc.content, 0, 0))
            .setMeta('isolated', true),
        );
        return true;
      },
      dispatchTransaction: (transaction) => {
        if (
          transaction.docChanged &&
          (latest.current.disabled ||
            activeMath ||
            retainedDraft.current !== null)
        ) {
          // A failed blur leaves the original equation draft alive. A nearby
          // edit (including Select All / Delete or a browser DOM mutation)
          // must not destroy its NodeView and silently discard that text.
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
            retainedDraft.current = attempted;
            setUnappliedText(attempted);
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
        const nextState = editor.state.apply(transaction);
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
            const rebased = rebaseRenderedProjection(
              projection,
              nextState.doc,
              next,
            );
            if (
              !latest.current.apply(
                acceptedSource,
                next,
                !transaction.getMeta('isolated') &&
                  transaction.steps.every(
                    (step) => step.toJSON().stepType === 'replace',
                  ),
              )
            ) {
              setError(
                'The document changed before this edit could be applied. Your saved source is unchanged.',
              );
              retainedDraft.current = attempted;
              setUnappliedText(attempted);
              editor.updateState(editor.state);
              return;
            }
            acceptedSource = next;
            projection = rebased;
            setError('');
          } catch (reason) {
            setError(
              reason instanceof Error
                ? reason.message
                : 'This edit could not be applied.',
            );
            retainedDraft.current = attempted;
            setUnappliedText(attempted);
            editor.updateState(editor.state);
            return;
          }
        }
        editor.updateState(nextState);
      },
    });
    view.current = editor;
    // Runtime-backed atoms never submit messages or transforms to this editor.
    const onSourceChange = () => {
      const next = latest.current.source;
      if (
        latest.current.sourceIsCurrent?.(next) === false ||
        next === acceptedSource
      )
        return;
      // A Select All intent belongs to its original source revision. Undo,
      // redo or an accepted external refresh must not carry it into new text.
      const previousAllSelection =
        selectingAll || editor.state.selection instanceof AllSelection;
      selectingAll = false;
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
      editor.updateState(editor.state.apply(transaction));
      projection = parsed;
      acceptedSource = next;
    };
    const sourceChanged = () => {
      if (!editor.composing && !activeMath) onSourceChange();
    };
    let compositionFrame: number | null = null;
    const afterComposition = () => {
      if (compositionFrame !== null) cancelAnimationFrame(compositionFrame);
      compositionFrame = requestAnimationFrame(() => {
        compositionFrame = null;
        sourceChanged();
      });
    };
    editor.dom.addEventListener('pn-source-change', sourceChanged);
    editor.dom.addEventListener('compositionend', afterComposition);
    commandsRef.current = {
      focus: () => editor.focus(),
      format: (action) => toolbar.current?.run(action),
      insertText: (text) => {
        if (
          latest.current.disabled ||
          activeMath ||
          retainedDraft.current !== null
        )
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
        if (latest.current.disabled || activeMath) return;
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
              .replaceSelectionWith(nodes.math_block!.create({ value: 'x^2' }))
              .setMeta('isolated', true),
          );
        else if (name === 'link') {
          linkSelection.current = {
            from: state.selection.from,
            to: state.selection.to,
            source: acceptedSource,
          };
          setLinkDraft('https://');
        }
        editor.focus();
      },
      link: (href) => {
        if (activeMath) {
          setError(
            'Finish or cancel the equation edit first. Your URL is retained.',
          );
          return;
        }
        if (!/^(https?:\/\/|mailto:|attachment:)/i.test(href)) {
          setError('Use an https, http, mailto or attachment link.');
          return;
        }
        const selected = linkSelection.current;
        if (!selected || latest.current.disabled) return;
        if (
          selected.source !== acceptedSource ||
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
    // Source refreshes are deferred while a math field owns an uncommitted
    // draft. Closing it must also flush a revision received in the meantime.
  }, [props.source, mathEditing, props.sourceIsCurrent]);
  useEffect(() => {
    view.current?.setProps({ editable: () => !latest.current.disabled });
    for (const refresh of imageRefreshers.current) refresh();
    for (const refresh of presentationRefreshers.current) refresh();
    for (const runtime of runtimeRoots.current)
      runtime.root.render(
        <RenderedRuntime
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
        <Modal title="Retained edit" onClose={() => setRecoveryOpen(false)}>
          <p>
            This text was not saved. Download or copy it before discarding it;
            your accepted source is unchanged.
          </p>
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
          <button type="button" onClick={() => setRecoveryOpen(false)}>
            Keep draft
          </button>
          <button
            type="button"
            onClick={() => {
              setUnappliedText(null);
              retainedDraft.current = null;
              setError('');
              setRecoveryOpen(false);
            }}
          >
            Discard retained draft
          </button>
        </Modal>
      )}
      <div ref={mount} />
    </div>
  );
}
