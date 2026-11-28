import {
  Annotation,
  EditorState,
  type EditorSelection,
  type TransactionSpec,
} from '@codemirror/state';
import { history, historyField, isolateHistory } from '@codemirror/commands';
import { RawSourceMap } from './live/sourceCoordinates';
import {
  explicitRawSource,
  rawSource,
  rawSourceField,
  rawSourceHistory,
} from './live/rawSource';
import type { SourceWitness } from './sourceWitness';

export const externalSourceChange = Annotation.define<boolean>();

/** Map the LF display while retaining the complete, exact host source separately. */
export function externalSourceTransaction(
  state: EditorState,
  source: string,
): TransactionSpec {
  const previous = state.doc.toString();
  const next = new RawSourceMap(source).display;
  let from = 0;
  while (
    from < previous.length &&
    from < next.length &&
    previous[from] === next[from]
  )
    from++;
  let end = previous.length;
  let nextEnd = next.length;
  while (
    end > from &&
    nextEnd > from &&
    previous[end - 1] === next[nextEnd - 1]
  ) {
    end--;
    nextEnd--;
  }
  // A common UTF-16 prefix/suffix can end between an emoji's surrogate pair.
  if (
    from > 0 &&
    /[\uD800-\uDBFF]/.test(previous[from - 1]!) &&
    /[\uDC00-\uDFFF]/.test(previous[from] ?? '')
  )
    from--;
  if (
    end < previous.length &&
    /[\uD800-\uDBFF]/.test(previous[end - 1] ?? '') &&
    /[\uDC00-\uDFFF]/.test(previous[end]!)
  ) {
    end++;
    nextEnd++;
  }
  return {
    changes: { from, to: end, insert: next.slice(from, nextEnd) },
    annotations: [
      externalSourceChange.of(true),
      explicitRawSource.of(source),
      isolateHistory.of('full'),
    ],
  };
}
// Preserve the real immutable history field, not its JSON serialization:
// CodeMirror intentionally omits custom inverse effects when serializing JSON.
export type EditorHistory = Map<
  string,
  { source: string; history: unknown; selection: EditorSelection }
>;

/** Record each background adoption in the existing genuine CodeMirror history. */
export function prepareExternalSourceHistory(
  cache: EditorHistory,
  before: SourceWitness,
  source: string,
): (() => void) | null {
  const cached = cache.get(before.sessionId);
  if (cached && cached.source !== before.source) return null;
  const state = EditorState.create({
    doc: new RawSourceMap(before.source).display,
    extensions: [
      rawSourceField.init(() => before.source),
      rawSourceHistory,
      history(),
      ...(cached ? [historyField.init(() => cached.history)] : []),
    ],
    ...(cached ? { selection: cached.selection } : {}),
  });
  const next = state.update(externalSourceTransaction(state, source)).state;
  const checkpoint = {
    source: rawSource(next),
    history: next.field(historyField),
    selection: next.selection,
  };
  // Preparation may refuse before canonical adoption. Publication only stores
  // already-created immutable history; no callbacks or awaits can intervene.
  return () => {
    cache.set(before.sessionId, checkpoint);
  };
}
