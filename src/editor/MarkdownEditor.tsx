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
}: {
  source: string;
  active: boolean;
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
          ref={focusInput}
          onChange={(event) => setEdit({ ...edit, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              focusTarget.current = range.from;
              setEdit(undefined);
              setError('');
            } else if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault();
              if (apply(edit.source, edit.range, edit.value)) {
                focusTarget.current = range.from;
                setEdit(undefined);
                setError('');
              } else {
                setError(
                  `${label} changed or contains unsupported syntax. Reopen it to retry.`,
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
