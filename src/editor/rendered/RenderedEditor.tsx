import { useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { useNotifications } from '../../ui/useNotifications';
import { Modal } from '../../ui/Modal';
import { createRoot, type Root } from 'react-dom/client';
import {
  Slice,
  type Node as ProseNode,
  type MarkType,
} from 'prosemirror-model';
import { EditorState, TextSelection, type Command } from 'prosemirror-state';
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
import katex from 'katex';
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
    function mathView(node: ProseNode): NodeView {
      const display = node.type === nodes.math_block;
      const wrapper = document.createElement(display ? 'div' : 'span');
      wrapper.className = display
        ? 'rendered-math-host rendered-math-host-block'
        : 'rendered-math-host';
      wrapper.contentEditable = 'false';
      const button = document.createElement('button');
      button.type = 'button';
      button.className = `rendered-math${display ? ' rendered-math-block' : ''}`;
      let field: HTMLInputElement | HTMLTextAreaElement | null = null;
      let span: MathSpan | null = null;
      let snapshot: string | null = null;

      function renderEquation() {
        button.setAttribute(
          'aria-label',
          `Edit ${display ? 'display' : 'inline'} equation: ${String(node.attrs.value).trim()}`,
        );
        katex.render(String(node.attrs.value), button, {
          displayMode: display,
          throwOnError: false,
          trust: false,
          maxExpand: 1000,
          maxSize: 30,
          strict: 'ignore',
        });
        wrapper.replaceChildren(button);
      }
      function close() {
        if (!field) return;
        field = null;
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
        field?.setAttribute('aria-invalid', 'true');
        field?.setAttribute('aria-describedby', noticeId + '-math');
        wrapper.classList.add('rendered-math-invalid');
      }
      function commit(): boolean {
        if (!field || !span || snapshot === null) return true;
        if (latest.current.disabled) {
          showError('Editing is unavailable. Your LaTeX text is retained.');
          return false;
        }
        const original = span.originalOuter.replace(/\r\n?|\n/g, '\n');
        const entered = field.value.replace(/\r\n?|\n/g, '\n');
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
        try {
          katex.renderToString(inner, {
            displayMode: display,
            throwOnError: true,
            trust: false,
            strict: 'ignore',
            maxExpand: 1000,
            maxSize: 30,
          });
        } catch (reason) {
          showError(
            reason instanceof Error
              ? reason.message
              : 'Invalid LaTeX expression.',
          );
          return false;
        }
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
        node = node.type.create({ ...node.attrs, value: inner });
        close();
        return true;
      }
      function cancel() {
        close();
      }
      const actions = { commit, cancel };
      function activate() {
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
        const input = document.createElement(display ? 'textarea' : 'input');
        if (display) {
          const textarea = input as HTMLTextAreaElement;
          textarea.rows = Math.max(
            3,
            match.originalOuter.split(/\r\n?|\n/).length,
          );
          textarea.spellcheck = false;
        } else (input as HTMLInputElement).type = 'text';
        input.className = display
          ? 'rendered-math-source rendered-math-source-block'
          : 'rendered-math-source';
        input.setAttribute(
          'aria-label',
          display ? 'Display LaTeX source' : 'Inline LaTeX source',
        );
        input.setAttribute(
          'aria-description',
          'Edit the dollar-delimited LaTeX in place. Leave the field to render, or press Escape to cancel.',
        );
        input.value = match.originalOuter;
        field = input;
        const row = document.createElement('span');
        row.className = 'rendered-math-controls';
        const applyButton = document.createElement('button');
        applyButton.type = 'button';
        applyButton.textContent = 'Done';
        applyButton.setAttribute('aria-label', 'Apply inline equation');
        applyButton.addEventListener('pointerdown', (event) =>
          event.preventDefault(),
        );
        applyButton.addEventListener('click', () => {
          if (commit()) button.focus();
        });
        const cancelButton = document.createElement('button');
        cancelButton.type = 'button';
        cancelButton.textContent = 'Cancel';
        cancelButton.setAttribute('aria-label', 'Cancel inline equation');
        cancelButton.addEventListener('pointerdown', (event) =>
          event.preventDefault(),
        );
        cancelButton.addEventListener('click', () => {
          cancel();
          button.focus();
        });
        row.append(applyButton, cancelButton);
        wrapper.classList.remove('rendered-math-invalid');
        wrapper.replaceChildren(input, row);
        activeMath = actions;
        setMathEditing(true);
        input.addEventListener('input', () => {
          wrapper.classList.remove('rendered-math-invalid');
          input.removeAttribute('aria-invalid');
          input.removeAttribute('aria-describedby');
          dismiss(noticeId + '-math');
        });
        input.addEventListener('keydown', (event) => {
          const key = event as KeyboardEvent;
          // IME edits must not be interrupted by Enter or Escape.
          if (key.isComposing) return;
          if (key.key === 'Escape') {
            key.preventDefault();
            cancel();
            button.focus();
          } else if (
            key.key === 'Enter' &&
            (!display || key.ctrlKey || key.metaKey)
          ) {
            key.preventDefault();
            if (commit()) button.focus();
          }
          key.stopPropagation();
        });
        input.addEventListener('blur', (event) => {
          if (!field) return;
          const target = (event as FocusEvent).relatedTarget;
          if (target instanceof Node && wrapper.contains(target)) return;
          commit();
        });
        input.focus();
        const innerEnd = input.value.length - (display ? 2 : 1);
        input.setSelectionRange(innerEnd, innerEnd);
      }
      button.addEventListener('click', activate);
      renderEquation();
      return {
        dom: wrapper,
        stopEvent: () => true,
        ignoreMutation: () => true,
        selectNode: activate,
        deselectNode: () => {
          if (field && document.activeElement !== field) commit();
        },
        update: (next) => {
          if (next.type !== node.type) return false;
          node = next;
          if (!field) renderEquation();
          return true;
        },
        destroy: () => {
          if (field && activeMath === actions) {
            activeMath = null;
            setMathEditing(false);
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
      let runtime: {
        root: Root;
        raw: string;
        report: (message: string) => void;
      } | null = null;
      const executable = kind.startsWith('mdx') && kind !== 'mdxjsEsm';
      if (executable) {
        const target = document.createElement('div');
        dom.append(target);
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
        runtime = { root: createRoot(target), raw, report };
        runtimeRoots.current.add(runtime);
        runtime.root.render(
          <RenderedRuntime
            context={latest.current.runtime}
            raw={raw}
            onError={report}
          />,
        );
      } else {
        const details = document.createElement('details');
        const summary = document.createElement('summary');
        summary.textContent =
          kind === 'mdxjsEsm' ? 'Component setup' : 'Source block';
        const pre = document.createElement('pre');
        pre.textContent = raw;
        details.append(summary, pre);
        dom.append(details);
      }
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.className = 'rendered-source-action';
      edit.textContent = executable
        ? 'Edit component source'
        : 'Edit source block';
      edit.addEventListener('click', () =>
        latest.current.openSource(sourceOffset(node), latest.current.source),
      );
      dom.append(edit);
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
          if (runtime) {
            runtime.report('');
            runtimeRoots.current.delete(runtime);
            const root = runtime.root;
            queueMicrotask(() => root.unmount());
          }
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
    const editor = new EditorView(mount.current, {
      state: EditorState.create({
        schema: renderedSchema,
        doc: projection.doc,
        plugins: [
          inputRules({ rules }),
          keymap({
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
      handleDOMEvents: {
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
      if (next === acceptedSource) return;
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
  }, [props.source, mathEditing]);
  useEffect(() => {
    view.current?.setProps({ editable: () => !latest.current.disabled });
    for (const refresh of imageRefreshers.current) refresh();
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
