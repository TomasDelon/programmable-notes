import { useCallback, useMemo, useState, useRef } from 'react';
import {
  editableMarkdown,
  markdownBlocks,
  type MarkdownRange,
} from './markdownEdits';

export function MarkdownEditor({
  source,
  active,
  apply,
  busy = false,
  onPendingChange,
}: {
  source: string;
  active: boolean;
  busy?: boolean;
  onPendingChange?: (pending: boolean) => void;
  apply: (
    snapshot: string,
    range: MarkdownRange,
    replacement: string,
  ) => boolean;
}) {
  const [edit, setEdit] = useState<{
    source: string;
    range: MarkdownRange;
    value: string;
  }>();
  const focusTarget = useRef<number | undefined>(undefined);
  const [error, setError] = useState('');
  const pending = edit !== undefined && edit.value !== edit.range.text;
  const blocks = useMemo(() => {
    if (!active) return [];
    const ranges = editableMarkdown(source);
    let index = 0;
    return markdownBlocks(source).map((block) => {
      const items: MarkdownRange[] = [];
      while (index < ranges.length && ranges[index]!.from < block.to) {
        const range = ranges[index++]!;
        if (range.from >= block.from && range.to <= block.to) items.push(range);
      }
      return { ...block, items };
    });
  }, [active, source]);
  const focusInput = useCallback(
    (input: HTMLTextAreaElement | null) => input?.focus(),
    [],
  );
  function editableText(range: MarkdownRange) {
    const label = range.list
      ? 'List item'
      : range.headingDepth
        ? 'Heading'
        : 'Paragraph';
    if (edit?.range.from === range.from) {
      return (
        <textarea
          className="inline-markdown"
          rows={Math.max(1, edit.value.split('\n').length)}
          aria-label={`${label} text`}
          value={edit.value}
          disabled={busy}
          ref={focusInput}
          onChange={(event) => {
            setEdit({ ...edit, value: event.target.value });
            onPendingChange?.(event.target.value !== edit.range.text);
          }}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              focusTarget.current = range.from;
              setEdit(undefined);
              onPendingChange?.(false);
              setError('');
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (apply(edit.source, edit.range, edit.value)) {
                focusTarget.current = range.from;
                setEdit(undefined);
                onPendingChange?.(false);
                setError('');
              } else {
                setError(
                  `${label} changed, contains unsupported syntax, or has ambiguous line endings. Use Source for this edit.`,
                );
              }
            }
          }}
        />
      );
    }
    return (
      <button
        className="rendered-text"
        disabled={busy || pending}
        ref={(button) => {
          if (button && focusTarget.current === range.from) {
            button.focus();
            focusTarget.current = undefined;
          }
        }}
        onClick={() => {
          setError('');
          setEdit({ source, range, value: range.text });
        }}
      >
        {range.text}
      </button>
    );
  }
  return (
    <section aria-label="Markdown editing">
      <p className="edit-hint">
        Click text to edit. Enter applies, Shift+Enter adds a line, Escape
        cancels. React and formatted blocks stay opaque; use Source to edit
        them.
      </p>
      {!blocks.length && (
        <p role="note">
          No safe visual mapping is available. Use Source to edit this document.
        </p>
      )}
      {edit &&
        !blocks.some((block) =>
          block.items.some((range) => range.from === edit.range.from),
        ) && (
          <div>
            <p role="note">
              Source changed while this text was being edited. Your pending text
              is kept below. Copy it or press Escape to cancel.
            </p>
            {editableText(edit.range)}
          </div>
        )}
      {blocks.map((block) => {
        const { items } = block;
        if (!items.length)
          return (
            <details className="opaque-block" key={block.from}>
              <summary>Source block · read only</summary>
              <pre>{source.slice(block.from, block.to)}</pre>
            </details>
          );
        return (
          <div key={block.from}>
            {items.map((range, index) => {
              if (range.list) {
                const list = range.list;
                if (items[index - 1]?.list === list) return null;
                let end = index + 1;
                while (items[end]?.list === list) end++;
                const List = list.ordered ? 'ol' : 'ul';
                return (
                  <List
                    key={list.from}
                    start={list.ordered ? list.start : undefined}
                  >
                    {items.slice(index, end).map((item) => (
                      <li key={item.from}>{editableText(item)}</li>
                    ))}
                  </List>
                );
              }
              const Block = range.headingDepth
                ? (`h${range.headingDepth}` as const)
                : 'p';
              return <Block key={range.from}>{editableText(range)}</Block>;
            })}
          </div>
        );
      })}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
