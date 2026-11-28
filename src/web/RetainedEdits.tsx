import { useRef, useState } from 'react';
import { isMdxSource } from '../sourceTypes';
import type { RetainedAttempt } from './persistence';

interface Props {
  attempts: readonly RetainedAttempt[];
  error: string;
  disabled?: boolean;
  onRestore?: (id: string) => Promise<boolean>;
  onDiscard?: (id: string) => Promise<void>;
  onRestored?: () => void;
}

function characterCount(text: string) {
  let count = 0;
  for (let offset = 0; offset < text.length; count++) {
    offset += text.codePointAt(offset)! > 0xffff ? 2 : 1;
  }
  return count;
}

export function RetainedEdits({
  attempts,
  error,
  disabled,
  onRestore,
  onDiscard,
  onRestored,
}: Props) {
  const [busy, setBusy] = useState(false);
  const [actionError, setActionError] = useState('');
  const writing = useRef(false);

  async function change(run: () => Promise<void>) {
    if (disabled || writing.current) return;
    writing.current = true;
    setBusy(true);
    setActionError('');
    try {
      await run();
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'The retained edit is still available.',
      );
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  function download(attempt: RetainedAttempt) {
    try {
      const url = URL.createObjectURL(
        new Blob([attempt.text], {
          type: 'text/plain;charset=utf-8',
          endings: 'transparent',
        }),
      );
      try {
        const anchor = document.createElement('a');
        anchor.href = url;
        anchor.download =
          'recovered-' +
          (attempt.documentKey.split('/').pop() || 'note.mdx').replace(
            /[\\:*?"<>|]/g,
            '-',
          );
        anchor.click();
      } finally {
        setTimeout(() => URL.revokeObjectURL(url), 1000);
      }
    } catch (reason) {
      setActionError(
        reason instanceof Error
          ? reason.message
          : 'The retained source could not be downloaded.',
      );
    }
  }

  return (
    <section aria-label="Retained edits">
      <h3>Retained edits</h3>
      <p>
        These drafts contain text the editor could not apply. Each draft is
        saved separately from its note.
      </p>
      {(error || actionError) && <p role="alert">{error || actionError}</p>}
      {!attempts.length && !error && <p>No retained edits.</p>}
      <div className="web-recovery-list">
        {attempts.map((attempt) => (
          <article key={attempt.id}>
            <div className="web-list-row">
              <span>
                <strong>{attempt.documentKey}</strong>
                <small>
                  {new Date(attempt.updated).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}{' '}
                  · Base revision {attempt.baseRevision} ·{' '}
                  {characterCount(attempt.text).toLocaleString()} characters
                </small>
              </span>
            </div>
            <div className="web-inline-actions">
              <button
                type="button"
                className="web-button"
                onClick={() => download(attempt)}
              >
                Download retained source
              </button>
              {onRestore && isMdxSource(attempt.documentKey) && (
                <button
                  type="button"
                  className="web-button"
                  disabled={disabled || busy}
                  onClick={() =>
                    void change(async () => {
                      if (await onRestore(attempt.id)) onRestored?.();
                      else
                        setActionError(
                          'The recovered copy could not be created. The retained edit is still available.',
                        );
                    })
                  }
                >
                  Restore as new note
                </button>
              )}
              {onDiscard && (
                <button
                  type="button"
                  className="web-button"
                  disabled={disabled || busy}
                  onClick={() => {
                    if (
                      window.confirm(
                        'Discard this retained edit? Download it first to keep a copy.',
                      )
                    )
                      void change(() => onDiscard(attempt.id));
                  }}
                >
                  Discard retained edit
                </button>
              )}
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
