import { isMdxSource } from '../sourceTypes';
import { useEffect, useState } from 'react';
import { validateFiles } from './workspace';

const key = 'programmable-notes:browser-draft:v1';

export function BrowserDraft({
  documentKey,
  name,
  source,
  busy,
  restore,
}: {
  documentKey: string;
  name: string;
  source: string;
  busy: boolean;
  restore: (name: string, source: string) => Promise<void>;
}) {
  const [notice, setNotice] = useState('');
  const [autosave, setAutosave] = useState<{
    documentKey: string;
    previous: string;
  }>();
  const active = autosave?.documentKey === documentKey;

  useEffect(() => {
    if (!autosave || !active) return;
    const next = JSON.stringify({ name, source });
    if (next === autosave.previous) return;
    const timer = window.setTimeout(() => {
      try {
        if (localStorage.getItem(key) !== autosave.previous)
          throw Error('The stored draft changed. Automatic drafts stopped.');
        validateFiles({ draft: source });
        localStorage.setItem(key, next);
        setAutosave({ documentKey, previous: next });
        setNotice('Draft updated in this browser.');
      } catch (error) {
        setAutosave(undefined);
        setNotice(String(error));
      }
    }, 500);
    return () => window.clearTimeout(timer);
  }, [active, autosave, documentKey, name, source]);

  function perform(action: 'keep' | 'restore' | 'delete' | 'enable') {
    try {
      if (action === 'delete') {
        localStorage.removeItem(key);
        setAutosave(undefined);
        setNotice('Local draft deleted.');
        return;
      }
      const existing = localStorage.getItem(key);
      if (action === 'keep' || action === 'enable') {
        if (existing !== null) throw Error('A local draft already exists.');
        validateFiles({ draft: source });
        const snapshot = JSON.stringify({ name, source });
        localStorage.setItem(key, snapshot);
        if (action === 'enable')
          setAutosave({ documentKey, previous: snapshot });
        setNotice('Draft stored in this browser.');
        return;
      }
      if (existing === null) throw Error('No local draft is stored.');
      const draft: unknown = JSON.parse(existing);
      if (
        !draft ||
        typeof draft !== 'object' ||
        !('name' in draft) ||
        typeof draft.name !== 'string' ||
        !/^[^/\\]+\.mdx?$/i.test(draft.name) ||
        !('source' in draft) ||
        typeof draft.source !== 'string'
      )
        throw Error('The local draft is invalid.');
      validateFiles({ draft: draft.source });
      setNotice('');
      setAutosave(undefined);
      void restore(draft.name, draft.source);
    } catch (error) {
      setNotice(
        error instanceof Error ? error.message : 'Draft storage unavailable.',
      );
    }
  }
  return (
    <details>
      <summary>Browser draft</summary>
      <p>
        Keep one copy of this Markdown source in this browser. Restoring opens a
        separate unsaved document.
      </p>
      <button
        disabled={busy || !isMdxSource(name)}
        onClick={() => perform('keep')}
      >
        Keep local draft
      </button>
      <button
        disabled={busy || (!autosave && !isMdxSource(name))}
        onClick={() => {
          if (autosave) {
            setAutosave(undefined);
            setNotice('Automatic drafts stopped.');
          } else {
            perform('enable');
          }
        }}
      >
        {autosave
          ? 'Stop automatic drafts'
          : 'Enable automatic drafts for this document'}
      </button>
      <button disabled={busy} onClick={() => perform('restore')}>
        Restore local draft
      </button>
      <button disabled={busy} onClick={() => perform('delete')}>
        Delete local draft
      </button>
      {notice && <p aria-live="polite">{notice}</p>}
    </details>
  );
}
