import { useEffect, useMemo, useRef } from 'react';
import katex from 'katex';
import type { MathSpan } from './mathSource';

export interface MathDraft {
  source: string;
  span: MathSpan;
  value: string;
  error: string;
}

export function MathEditor({
  draft,
  onChange,
  onApply,
  onCancel,
}: {
  draft: MathDraft;
  onChange: (value: string) => void;
  onApply: () => void;
  onCancel: () => void;
}) {
  const input = useRef<HTMLTextAreaElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const preview = useMemo(() => {
    try {
      return {
        html: katex.renderToString(draft.value, {
          displayMode: draft.span.kind === 'display',
          throwOnError: true,
          trust: false,
          strict: 'ignore',
          maxExpand: 1000,
          maxSize: 30,
          output: 'htmlAndMathml',
        }),
        error: '',
      };
    } catch (reason) {
      return {
        html: '',
        error:
          reason instanceof Error
            ? reason.message
            : 'This LaTeX could not be rendered.',
      };
    }
  }, [draft.value, draft.span.kind]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    input.current?.focus();
    return () => {
      if (previous?.isConnected) previous.focus();
    };
  }, []);
  return (
    <div
      className="live-math-overlay"
      onMouseDown={(event) => event.stopPropagation()}
    >
      <div
        className="live-math-dialog"
        role="dialog"
        aria-modal="true"
        aria-label="Edit equation"
        ref={panel}
        onKeyDown={(event) => {
          event.stopPropagation();
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') {
            event.preventDefault();
            onCancel();
          }
          if (event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
            event.preventDefault();
            if (!preview.error) onApply();
          }
          if (event.key === 'Tab') {
            const items = [
              ...panel.current!.querySelectorAll<HTMLElement>(
                'textarea,button:not(:disabled)',
              ),
            ];
            const first = items[0],
              last = items.at(-1);
            if (event.shiftKey && document.activeElement === first) {
              event.preventDefault();
              last?.focus();
            } else if (!event.shiftKey && document.activeElement === last) {
              event.preventDefault();
              first?.focus();
            }
          }
        }}
      >
        <h2>Edit equation</h2>
        <p id="live-math-help">
          Edit the original LaTeX. Ctrl+Enter applies; Escape cancels.
        </p>
        <label htmlFor="live-math-source">LaTeX source</label>
        <textarea
          id="live-math-source"
          ref={input}
          rows={Math.max(3, Math.min(12, draft.value.split('\n').length))}
          spellCheck={false}
          value={draft.value}
          aria-describedby="live-math-help"
          onChange={(event) => onChange(event.target.value)}
        />
        <div
          className="live-math-preview"
          aria-label="Equation preview"
          dangerouslySetInnerHTML={{ __html: preview.html }}
        />
        {(preview.error || draft.error) && (
          <p className="live-math-error" role="alert">
            {preview.error || draft.error}
          </p>
        )}
        <div className="live-math-actions">
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={Boolean(preview.error)}
            onClick={onApply}
          >
            Apply equation
          </button>
        </div>
      </div>
    </div>
  );
}
