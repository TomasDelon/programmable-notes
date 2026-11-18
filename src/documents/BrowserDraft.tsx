import { useState } from 'react';
import { validateFiles } from './workspace';

const key = 'programmable-notes:browser-draft:v1';

export function BrowserDraft({
  name,
  source,
  busy,
  restore,
}: {
  name: string;
  source: string;
  busy: boolean;
  restore: (name: string, source: string) => Promise<void>;
}) {
  const [notice, setNotice] = useState('');
  function perform(action: 'keep' | 'restore' | 'delete') {
    try {
      if (action === 'delete') {
        localStorage.removeItem(key);
        setNotice('Local draft deleted.');
        return;
      }
      const existing = localStorage.getItem(key);
      if (action === 'keep') {
        if (existing !== null) throw Error('A local draft already exists.');
        validateFiles({ draft: source });
        localStorage.setItem(key, JSON.stringify({ name, source }));
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
        !/^[^/\\]+\.mdx?$/.test(draft.name) ||
        !('source' in draft) ||
        typeof draft.source !== 'string'
      )
        throw Error('The local draft is invalid.');
      validateFiles({ draft: draft.source });
      setNotice('');
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
        disabled={busy || !/\.mdx?$/.test(name)}
        onClick={() => perform('keep')}
      >
        Keep local draft
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
