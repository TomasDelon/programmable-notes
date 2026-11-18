import { useCallback, useMemo, useState } from 'react';
import { editableMarkdown, type MarkdownRange } from './markdownEdits';

export function MarkdownEditor({
  source,
  apply,
}: {
  source: string;
  apply: (
    snapshot: string,
    range: MarkdownRange,
    replacement: string,
  ) => boolean;
}) {
  const [shown, show] = useState(false);
  const [edit, setEdit] = useState<{
    source: string;
    range: MarkdownRange;
    value: string;
  }>();
  const [error, setError] = useState('');
  const ranges = useMemo(
    () => (shown ? editableMarkdown(source) : []),
    [shown, source],
  );
  const focusInput = useCallback(
    (input: HTMLInputElement | null) => input?.focus(),
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
        <input
          className="inline-markdown"
          aria-label={`${label} text`}
          value={edit.value}
          ref={focusInput}
          onChange={(event) => setEdit({ ...edit, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing) return;
            if (event.key === 'Escape') {
              setEdit(undefined);
              setError('');
            } else if (event.key === 'Enter') {
              event.preventDefault();
              if (apply(edit.source, edit.range, edit.value)) {
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
      <button
        onClick={() => {
          show(!shown);
          setEdit(undefined);
          setError('');
        }}
      >
        {shown ? 'Hide Markdown editor' : 'Edit rendered Markdown'}
      </button>
      {shown && (
        <>
          <p className="edit-hint">
            Select text to edit it. Enter applies the change. Escape cancels.
          </p>
          {ranges.map((range, index) => {
            if (range.list) {
              const list = range.list;
              if (ranges[index - 1]?.list === list) return null;
              let end = index + 1;
              while (ranges[end]?.list === list) end++;
              const List = list.ordered ? 'ol' : 'ul';
              return (
                <List
                  key={list.from}
                  start={list.ordered ? list.start : undefined}
                >
                  {ranges.slice(index, end).map((item) => (
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
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
