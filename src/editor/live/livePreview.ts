import {
  StateEffect,
  StateField,
  type EditorState,
  type Extension,
  type Range,
} from '@codemirror/state';
import {
  Decoration,
  EditorView,
  ViewPlugin,
  WidgetType,
  type DecorationSet,
} from '@codemirror/view';
import { isolateHistory } from '@codemirror/commands';
import katex from 'katex';
import type { LinkResolution } from '../../links';
import {
  parseLiveSource,
  safeMathSpan,
  type MathSpan,
  type SyntaxNode,
} from '../math/mathSource';
import { RawSourceMap } from './sourceCoordinates';
import { rawSource } from './rawSource';

export const liveDataChanged = StateEffect.define<null>();
const compositionChanged = StateEffect.define<boolean>();

interface Token {
  from: number;
  to: number;
  className?: string;
  hide?: { from: number; to: number }[];
  math?: MathSpan;
  line?: boolean;
  block?: { from: number; to: number };
  marker?: { text: string; depth: number };
  task?: { offset: number; checked: boolean; label: string; depth: number };
  code?: string;
  rule?: boolean;
}

type MarkdownNode = SyntaxNode & {
  ordered?: boolean;
  start?: number;
  checked?: boolean | null;
};

/** AST positions alone grant presentation; opaque MDX is never host markup. */
export function liveTokens(source: string, path = 'note.mdx'): Token[] {
  const tree = parseLiveSource(source, path);
  const result: Token[] = [];
  function visit(
    node: MarkdownNode,
    containing?: { from: number; to: number },
    depth = 0,
    ordinal?: number,
    inQuote = false,
  ): void {
    if (node.type.startsWith('mdx') || node.type === 'html') return;
    const from = node.position?.start.offset;
    const to = node.position?.end.offset;
    const block =
      from !== undefined &&
      to !== undefined &&
      (node.type === 'paragraph' || node.type === 'heading')
        ? { from, to }
        : containing;
    if (from !== undefined && to !== undefined && to > from) {
      const raw = source.slice(from, to);
      const math = safeMathSpan(source, node);
      if (math) {
        result.push({ from, to, math });
        return;
      }
      if (node.type === 'listItem') {
        // The parser proves this is a list item. The source prefix alone
        // determines the exact byte range owned by its visual marker.
        const prefix = /^(?:[-+*]|\d+[.)])[ \t]+(?:\[([ xX])\][ \t]+)?/.exec(
          raw,
        );
        if (prefix) {
          const end = from + prefix[0].length;
          const firstLineEnd = raw.search(/[\r\n]/);
          const itemLineEnd =
            from + (firstLineEnd < 0 ? raw.length : firstLineEnd);
          const label = source.slice(end, itemLineEnd).trim();
          const task =
            typeof node.checked === 'boolean' && prefix[1] !== undefined
              ? {
                  offset: from + prefix[0].indexOf('[') + 1,
                  checked: node.checked,
                  label,
                  depth,
                }
              : undefined;
          result.push({
            from,
            to: end,
            line: true,
            className: 'cm-live-list-item',
            block: { from, to: itemLineEnd },
            ...(task
              ? { task }
              : {
                  marker: {
                    text: ordinal === undefined ? '•' : `${ordinal}.`,
                    depth,
                  },
                }),
          });
        }
      }
      if (node.type === 'blockquote' && !inQuote) {
        // Nested quote prefixes share one decoration, never overlapping edits.
        const prefixes = /^(?:[ \t]*>[ \t]?)+/gm;
        for (const match of raw.matchAll(prefixes)) {
          const start = from + match.index;
          result.push({
            from: start,
            to: start + match[0].length,
            line: true,
            className: 'cm-live-blockquote',
            block: { from, to },
            hide: [{ from: start, to: start + match[0].length }],
          });
        }
      }
      if (node.type === 'thematicBreak') {
        result.push({ from, to, rule: true });
        return;
      }
      if (node.type === 'code') {
        // Code remains literal text. Never run it or use it as host HTML.
        if (!depth && !inQuote && node.value !== undefined)
          result.push({ from, to, code: node.value });
        return;
      }
      if (node.type === 'heading' && /^#{1,6}[ \t]+/.test(raw)) {
        const prefix = /^#{1,6}[ \t]+/.exec(raw)![0];
        const hide = [{ from, to: from + prefix.length }];
        const suffix = /[ \t]+#+[ \t]*$/.exec(raw);
        if (suffix && suffix.index >= prefix.length)
          hide.push({ from: from + suffix.index, to });
        result.push({
          from,
          to,
          hide,
          block,
          line: true,
          className: `cm-live-heading cm-live-h${node.depth ?? 1}`,
        });
      }
      if (
        node.type === 'strong' ||
        node.type === 'emphasis' ||
        node.type === 'delete'
      ) {
        const width = node.type === 'emphasis' ? 1 : 2;
        const marker = raw.slice(0, width);
        if (
          /^(?:\*{1,2}|_{1,2}|~~)$/.test(marker) &&
          raw.endsWith(marker) &&
          raw.length > width * 2
        ) {
          result.push({
            from,
            to,
            block,
            className: `cm-live-${node.type}`,
            hide: [
              { from, to: from + width },
              { from: to - width, to },
            ],
          });
        }
      }
      if (node.type === 'inlineCode') {
        const opening = /^`+/.exec(raw)?.[0];
        if (opening && raw.endsWith(opening) && !/[\r\n]/.test(raw)) {
          result.push({
            from,
            to,
            block,
            className: 'cm-live-code',
            hide: [
              { from, to: from + opening.length },
              { from: to - opening.length, to },
            ],
          });
        }
        return;
      }
      if (node.type === 'link')
        result.push({ from, to, className: 'cm-live-markdown-link' });
    }
    node.children?.forEach((child, index) =>
      visit(
        child,
        block,
        depth + (node.type === 'list' ? 1 : 0),
        node.type === 'list' && node.ordered
          ? (node.start ?? 1) + index
          : undefined,
        inQuote || node.type === 'blockquote',
      ),
    );
  }
  if (tree) visit(tree);
  return result;
}

class ListMarkerWidget extends WidgetType {
  constructor(readonly text: string) {
    super();
  }
  eq(other: ListMarkerWidget) {
    return this.text === other.text;
  }
  toDOM(): HTMLElement {
    const marker = document.createElement('span');
    marker.className = 'cm-live-list-marker';
    marker.textContent = this.text;
    marker.setAttribute('aria-hidden', 'true');
    return marker;
  }
  ignoreEvent() {
    return false;
  }
}

class TaskWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly task: NonNullable<Token['task']>,
  ) {
    super();
  }
  eq(other: TaskWidget) {
    return (
      this.source === other.source && this.task.offset === other.task.offset
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const wrapper = document.createElement('span');
    wrapper.className = 'cm-live-task-marker';
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = this.task.checked;
    checkbox.setAttribute(
      'aria-label',
      `Task: ${this.task.label || 'Untitled task'}`,
    );
    checkbox.addEventListener('mousedown', (event) => event.preventDefault());
    checkbox.addEventListener('change', () => {
      // A detached/stale widget or open protected draft cannot overwrite source.
      if (view.state.readOnly || rawSource(view.state) !== this.source) {
        checkbox.checked = this.task.checked;
        return;
      }
      const map = new RawSourceMap(this.source);
      const from = map.toDisplay(this.task.offset);
      if (from === null || !/[ xX]/.test(this.source[this.task.offset] ?? '')) {
        checkbox.checked = this.task.checked;
        return;
      }
      view.dispatch({
        changes: { from, to: from + 1, insert: this.task.checked ? ' ' : 'x' },
        annotations: isolateHistory.of('full'),
        userEvent: 'input.task',
      });
      checkbox.checked = /[xX]/.test(
        rawSource(view.state)[this.task.offset] ?? '',
      );
    });
    wrapper.append(checkbox);
    return wrapper;
  }
  ignoreEvent() {
    return true;
  }
}

class LiteralBlockWidget extends WidgetType {
  constructor(
    readonly kind: 'code' | 'rule',
    readonly text: string,
    readonly from: number,
    readonly source: string,
  ) {
    super();
  }
  eq(other: LiteralBlockWidget) {
    return (
      this.kind === other.kind &&
      this.text === other.text &&
      this.from === other.from &&
      this.source === other.source
    );
  }
  toDOM(view: EditorView): HTMLElement {
    const element: HTMLElement = document.createElement(
      this.kind === 'code' ? 'pre' : 'div',
    );
    element.className = `cm-live-${this.kind}-block`;
    element.tabIndex = 0;
    element.setAttribute(
      'aria-label',
      this.kind === 'code' ? 'Edit code block' : 'Edit horizontal rule',
    );
    if (this.kind === 'code') {
      const code = document.createElement('code');
      code.textContent = this.text;
      element.append(code);
    } else element.setAttribute('role', 'separator');
    const reveal = () => {
      if (rawSource(view.state) !== this.source) return;
      view.dispatch({ selection: { anchor: this.from }, scrollIntoView: true });
      view.focus();
    };
    element.addEventListener('click', reveal);
    element.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' || event.key === ' ') {
        event.preventDefault();
        reveal();
      }
    });
    return element;
  }
  ignoreEvent() {
    return true;
  }
}

class MathWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly span: MathSpan,
    readonly open: (source: string, span: MathSpan) => void,
  ) {
    super();
  }
  eq(other: MathWidget) {
    return (
      this.source === other.source &&
      this.span.from === other.span.from &&
      this.span.to === other.span.to
    );
  }
  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cm-live-math cm-live-math-${this.span.kind}`;
    button.setAttribute(
      'aria-label',
      `Edit ${this.span.kind === 'display' ? 'display' : 'inline'} equation: ${this.span.originalInner.trim()}`,
    );
    button.title = 'Edit LaTeX';
    try {
      katex.render(this.span.originalInner, button, {
        displayMode: this.span.kind === 'display',
        throwOnError: false,
        trust: false,
        strict: 'ignore',
        maxExpand: 1000,
        maxSize: 30,
        output: 'htmlAndMathml',
      });
    } catch {
      button.textContent = this.span.originalInner;
    }
    button.addEventListener('click', () => this.open(this.source, this.span));
    return button;
  }
  ignoreEvent() {
    return true;
  }
}

class WikilinkWidget extends WidgetType {
  constructor(
    readonly source: string,
    readonly link: LinkResolution,
    readonly open: (source: string, link: LinkResolution) => void,
  ) {
    super();
  }
  eq(other: WikilinkWidget) {
    return (
      this.source === other.source &&
      this.link.span.from === other.link.span.from &&
      this.link.status === other.link.status &&
      this.link.targetId === other.link.targetId
    );
  }
  toDOM(): HTMLElement {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = `cm-live-wikilink is-${this.link.status}`;
    button.textContent = this.link.span.alias ?? this.link.span.target;
    button.title =
      this.link.status === 'resolved'
        ? `Open ${this.link.span.target}`
        : `${this.link.span.target}: ${this.link.status}`;
    button.setAttribute('aria-label', button.title);
    button.setAttribute(
      'aria-disabled',
      String(this.link.status !== 'resolved'),
    );
    button.addEventListener('click', () => {
      if (this.link.status === 'resolved') this.open(this.source, this.link);
    });
    return button;
  }
  ignoreEvent() {
    return true;
  }
}

export function livePreview(options: {
  path: string;
  getLinks: () => readonly LinkResolution[];
  openMath: (source: string, span: MathSpan) => void;
  openLink: (source: string, link: LinkResolution) => void;
}): Extension {
  let cachedSource: string | undefined;
  let cachedTokens: Token[] = [];
  const composing = StateField.define<boolean>({
    create: () => false,
    update: (value, transaction) =>
      transaction.effects.reduce(
        (current, effect) =>
          effect.is(compositionChanged) ? effect.value : current,
        value,
      ),
  });
  function decorations(state: EditorState): DecorationSet {
    if (state.field(composing)) return Decoration.none;
    const source = rawSource(state);
    const map = new RawSourceMap(source);
    if (source !== cachedSource) {
      cachedSource = source;
      cachedTokens = liveTokens(source, options.path);
    }
    const ranges: Range<Decoration>[] = [];
    const active = (from: number, to: number) =>
      state.selection.ranges.some(
        (selection) => selection.from <= to && selection.to >= from,
      );
    const convert = (from: number, to: number) => {
      const start = map.toDisplay(from),
        end = map.toDisplay(to);
      return start === null || end === null || start >= end
        ? null
        : { from: start, to: end };
    };
    for (const token of cachedTokens) {
      const range = convert(token.from, token.to);
      if (!range) continue;
      if (token.code !== undefined || token.rule) {
        if (!active(range.from, range.to))
          ranges.push(
            Decoration.replace({
              block: true,
              widget: new LiteralBlockWidget(
                token.rule ? 'rule' : 'code',
                token.code ?? '',
                range.from,
                source,
              ),
            }).range(range.from, range.to),
          );
        continue;
      }
      if (token.math) {
        if (!active(range.from, range.to))
          ranges.push(
            Decoration.replace({
              block: token.math.kind === 'display',
              widget: new MathWidget(source, token.math, options.openMath),
            }).range(range.from, range.to),
          );
        continue;
      }
      if (token.className) {
        ranges.push(
          token.line
            ? Decoration.line({ class: token.className }).range(
                state.doc.lineAt(range.from).from,
              )
            : Decoration.mark({ class: token.className }).range(
                range.from,
                range.to,
              ),
        );
      }
      const block = token.block
        ? convert(token.block.from, token.block.to)
        : range;
      if (!block || active(block.from, block.to)) continue;
      if (token.task || token.marker) {
        ranges.push(
          Decoration.replace({
            widget: token.task
              ? new TaskWidget(source, token.task)
              : new ListMarkerWidget(token.marker!.text),
          }).range(range.from, range.to),
        );
      }
      for (const hidden of token.hide ?? []) {
        const marker = convert(hidden.from, hidden.to);
        if (marker)
          ranges.push(Decoration.replace({}).range(marker.from, marker.to));
      }
    }
    for (const link of options.getLinks()) {
      if (source.slice(link.span.from, link.span.to) !== link.span.raw)
        continue;
      const range = convert(link.span.from, link.span.to);
      if (range && !active(range.from, range.to))
        ranges.push(
          Decoration.replace({
            widget: new WikilinkWidget(source, link, options.openLink),
          }).range(range.from, range.to),
        );
    }
    return Decoration.set(ranges, true);
  }
  const field = StateField.define<DecorationSet>({
    create: decorations,
    update: (value, transaction) =>
      transaction.docChanged ||
      transaction.selection ||
      transaction.effects.some(
        (effect) => effect.is(liveDataChanged) || effect.is(compositionChanged),
      )
        ? decorations(transaction.state)
        : value,
    provide: (field) => EditorView.decorations.from(field),
  });
  const compositionEvents = ViewPlugin.fromClass(
    class {
      frame: number | null = null;
      constructor(readonly view: EditorView) {}
      cancel() {
        if (this.frame !== null) cancelAnimationFrame(this.frame);
        this.frame = null;
      }
      finish() {
        this.cancel();
        // compositionend may precede the final DOM mutation observation.
        // Restore decorations only after CodeMirror can commit that input.
        this.frame = requestAnimationFrame(() => {
          this.frame = null;
          if (!this.view.compositionStarted)
            this.view.dispatch({ effects: compositionChanged.of(false) });
        });
      }
      destroy() {
        this.cancel();
      }
    },
    {
      eventHandlers: {
        compositionstart(_event, view) {
          this.cancel();
          view.dispatch({ effects: compositionChanged.of(true) });
          return false;
        },
        compositionend() {
          this.finish();
          return false;
        },
      },
    },
  );
  return [composing, field, compositionEvents];
}
