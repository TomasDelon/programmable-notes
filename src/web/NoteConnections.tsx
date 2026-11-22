import { ArrowUpRight, Link2 } from 'lucide-react';
import type { WorkspaceLinkIndex } from '../links';
import type { DocumentMetadata } from './workspace';

/** Navigation stays on the trusted editor surface, outside executable MDX. */
export function NoteConnections({
  selected,
  index,
  documents,
  onOpen,
}: {
  selected: string;
  index: WorkspaceLinkIndex;
  documents: Record<string, DocumentMetadata>;
  onOpen: (key: string) => void;
}) {
  const outgoing = index.outgoing[selected] ?? [];
  const incoming = index.backlinks[selected] ?? [];
  const backlinks = [...new Set(incoming.map((link) => link.sourceDocumentId))];
  return (
    <div className="web-connections">
      <section aria-label="Outgoing links">
        <h3>
          <Link2 size={14} /> Linked notes <span>{outgoing.length}</span>
        </h3>
        {outgoing.map((link) => (
          <button
            type="button"
            className="web-connection"
            key={link.span.from}
            disabled={link.status !== 'resolved'}
            title={
              link.status === 'resolved'
                ? `Open ${link.span.target}`
                : `${link.span.target}: ${link.status}`
            }
            onClick={() => {
              if (link.status === 'resolved' && link.targetId)
                onOpen(link.targetId);
            }}
          >
            <span>{link.span.alias ?? link.span.target}</span>
            {link.status === 'resolved' ? (
              <ArrowUpRight size={14} />
            ) : (
              <small>
                {link.status === 'trashed'
                  ? 'In Trash'
                  : link.status === 'ambiguous'
                    ? 'Multiple matches'
                    : 'Not found'}
              </small>
            )}
          </button>
        ))}
        {!outgoing.length && (
          <p>
            Add a <code>[[Note title]]</code> link to connect this note.
          </p>
        )}
        {index.issues[selected] && (
          <p role="status">{index.issues[selected]}</p>
        )}
      </section>
      <section aria-label="Backlinks">
        <h3>
          Backlinks <span>{backlinks.length}</span>
        </h3>
        {backlinks.map((id) => (
          <button
            type="button"
            className="web-connection"
            key={id}
            onClick={() => onOpen(id)}
          >
            <span>
              {documents[id]?.title ?? id}
              <small>{documents[id]?.folder || 'Workspace'}</small>
            </span>
            <ArrowUpRight size={14} />
          </button>
        ))}
        {!backlinks.length && <p>No other notes link here yet.</p>}
      </section>
    </div>
  );
}
