import { useMemo, useState } from 'react';
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
  const label = edit?.range.list
    ? 'List item'
    : edit?.range.headingDepth
      ? 'Heading'
      : 'Paragraph';
  function editButton(range: MarkdownRange) {
    return (
      <button
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
                    <li key={item.from}>{editButton(item)}</li>
                  ))}
                </List>
              );
            }
            const Block = range.headingDepth
              ? (`h${range.headingDepth}` as const)
              : 'p';
            return <Block key={range.from}>{editButton(range)}</Block>;
          })}
          {edit && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                if (apply(edit.source, edit.range, edit.value)) {
                  setEdit(undefined);
                  setError('');
                } else {
                  setError(
                    `${label} changed or contains unsupported syntax. Select it again to retry.`,
                  );
                }
              }}
            >
              <label>
                {label} text
                <input
                  value={edit.value}
                  onChange={(event) =>
                    setEdit({ ...edit, value: event.target.value })
                  }
                  required
                />
              </label>
              <button>Apply {label.toLowerCase()} edit</button>
              <button
                type="button"
                onClick={() => {
                  setEdit(undefined);
                  setError('');
                }}
              >
                Cancel
              </button>
            </form>
          )}
          {error && <p role="alert">{error}</p>}
        </>
      )}
    </section>
  );
}
