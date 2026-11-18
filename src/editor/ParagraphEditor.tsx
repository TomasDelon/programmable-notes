import { useState } from 'react';
import { paragraphs, type Paragraph } from './paragraphs';

export function ParagraphEditor({
  source,
  apply,
}: {
  source: string;
  apply: (snapshot: string, range: Paragraph, replacement: string) => boolean;
}) {
  const [shown, show] = useState(false);
  const [edit, setEdit] = useState<{ source: string; range: Paragraph }>();
  const [error, setError] = useState('');
  return (
    <section aria-label="Paragraph editing">
      <button
        onClick={() => {
          show(!shown);
          setEdit(undefined);
          setError('');
        }}
      >
        {shown ? 'Hide paragraph editor' : 'Edit rendered paragraphs'}
      </button>
      {shown && (
        <>
          {paragraphs(source).map((range) => (
            <p key={range.from}>
              <button
                onClick={() => {
                  setError('');
                  setEdit({ source, range });
                }}
              >
                {range.text}
              </button>
            </p>
          ))}
          {edit && (
            <form
              onSubmit={(event) => {
                event.preventDefault();
                const value = new FormData(event.currentTarget).get(
                  'paragraph',
                );
                if (
                  typeof value === 'string' &&
                  apply(edit.source, edit.range, value)
                ) {
                  setEdit(undefined);
                  setError('');
                } else {
                  setError(
                    'Paragraph changed or contains unsupported syntax. Select it again to retry.',
                  );
                }
              }}
            >
              <label>
                Paragraph text
                <input
                  key={edit.range.from}
                  name="paragraph"
                  defaultValue={edit.range.text}
                  required
                />
              </label>
              <button>Apply paragraph edit</button>
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
