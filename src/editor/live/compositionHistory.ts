import {
  StateEffect,
  StateField,
  Transaction,
  EditorState,
} from '@codemirror/state';
import { isolateHistory } from '@codemirror/commands';
import { EditorView, ViewPlugin } from '@codemirror/view';

const compositionBoundary = StateEffect.define<boolean>();
const firstCompositionChange = StateField.define<boolean>({
  create: () => false,
  update: (first, transaction) => {
    for (const effect of transaction.effects)
      if (effect.is(compositionBoundary)) first = effect.value;
    if (transaction.docChanged && transaction.isUserEvent('input'))
      return false;
    return first;
  },
});

/** Shared boundary for DOM composition and the public Android EditContext channel. */
export function setCompositionHistoryBoundary(
  view: EditorView,
  first: boolean,
) {
  view.dispatch({
    effects: compositionBoundary.of(first),
    annotations: Transaction.addToHistory.of(false),
  });
}

/** Keep one composition separate from earlier typing or a redone visual edit. */
export function compositionHistory() {
  return [
    firstCompositionChange,
    EditorState.transactionFilter.of((transaction) => {
      if (
        !transaction.docChanged ||
        !transaction.isUserEvent('input') ||
        !transaction.startState.field(firstCompositionChange)
      )
        return transaction;
      // Firefox may label the first insertion as compose, without compose.start.
      // CodeMirror always joins compose to the prior event, even after Redo.
      // Prepend the public annotations so this first change opens its own group.
      return [
        {
          annotations: [
            Transaction.userEvent.of('input.type.compose.start'),
            isolateHistory.of('before'),
          ],
        },
        transaction,
      ];
    }),
    ViewPlugin.fromClass(
      class {
        frame: number | null = null;
        constructor(readonly view: EditorView) {}
        cancel() {
          if (this.frame !== null) cancelAnimationFrame(this.frame);
          this.frame = null;
        }
        destroy() {
          this.cancel();
        }
      },
      {
        // Plugin observers run before CodeMirror's built-in observer, which
        // deletes a multiline selection at compositionstart. Mark the boundary
        // first so that deletion and the following insertion share one event.
        eventObservers: {
          compositionstart(_event, view) {
            this.cancel();
            setCompositionHistoryBoundary(view, true);
          },
          compositionend(_event, view) {
            this.cancel();
            // The final DOM insertion may be reconciled after compositionend.
            this.frame = requestAnimationFrame(() => {
              this.frame = null;
              if (!view.compositionStarted)
                setCompositionHistoryBoundary(view, false);
            });
          },
        },
      },
    ),
  ];
}
