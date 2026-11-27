import { useEffect, type ComponentType } from 'react';
import { Search, ArrowRight } from 'lucide-react';
import { ProductDialog } from '../ui/ProductDialog';

export interface DocumentCommand {
  id: string;
  name: string;
  description: string;
  icon: ComponentType<{ size?: number }>;
  enabled?: boolean;
}
export function DocumentCommandPalette({
  query,
  index,
  results,
  onQuery,
  onIndex,
  onRun,
  onClose,
  shouldRestoreFocus,
}: {
  query: string;
  index: number;
  results: readonly DocumentCommand[];
  onQuery(value: string): void;
  onIndex(value: number): void;
  onRun(command: DocumentCommand): void;
  onClose(): void;
  shouldRestoreFocus?: () => boolean;
}) {
  useEffect(() => {
    document
      .querySelector('.web-command-dialog .keyboard-selected')
      ?.scrollIntoView?.({ block: 'nearest' });
  }, [index]);
  return (
    <ProductDialog
      title="Command palette"
      onClose={onClose}
      className="web-command-dialog"
      shouldRestoreFocus={shouldRestoreFocus}
    >
      <div className="modal-search">
        <Search size={20} />
        <input
          data-autofocus
          placeholder="Search notes or run a command…"
          aria-label="Search commands and notes"
          value={query}
          onChange={(event) => {
            onQuery(event.target.value);
            onIndex(0);
          }}
          onKeyDown={(event) => {
            if (event.key === 'ArrowDown') {
              event.preventDefault();
              onIndex(Math.min(index + 1, results.length - 1));
            }
            if (event.key === 'ArrowUp') {
              event.preventDefault();
              onIndex(Math.max(0, index - 1));
            }
            if (event.key === 'Enter') {
              event.preventDefault();
              const result = results[index];
              if (result && result.enabled !== false) onRun(result);
            }
          }}
        />
        <kbd>ESC</kbd>
      </div>
      <div className="modal-content">
        {results.map((result, position) => (
          <button
            type="button"
            key={result.id}
            disabled={result.enabled === false}
            className={
              'cmd-result ' + (position === index ? 'keyboard-selected' : '')
            }
            onClick={() => onRun(result)}
          >
            <result.icon size={16} />
            <span>
              {result.name}
              <small>{result.description}</small>
            </span>
            <ArrowRight size={14} />
          </button>
        ))}
        {!results.length && (
          <p className="no-results">No matching notes or commands.</p>
        )}
      </div>
      <div className="modal-footer">
        <span>
          <kbd>↑ ↓</kbd> Navigate
        </span>
        <span>
          <kbd>↵</kbd> Select
        </span>
        <span>
          <kbd>ESC</kbd> Close
        </span>
      </div>
    </ProductDialog>
  );
}
