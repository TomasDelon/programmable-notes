import {
  Annotation,
  StateEffect,
  StateField,
  type EditorState,
  type Text,
  type Transaction,
} from '@codemirror/state';
import { invertedEffects } from '@codemirror/commands';
import {
  RawSourceMap,
  planRawChanges,
  type DisplayChange,
  type PhysicalBreak,
} from './sourceCoordinates';

/** The LF CodeMirror document is a projection. Only this field owns source bytes. */
export const explicitRawSource = Annotation.define<string>();

type RawHistorySnapshot = {
  // CodeMirror's persistent text tree shares unchanged content with its history.
  doc: Text;
  breaks: readonly PhysicalBreak[];
  preferredBreak: PhysicalBreak;
};
const restorePhysicalBreaks = StateEffect.define<RawHistorySnapshot>();

function restoreSnapshot(snapshot: RawHistorySnapshot): string {
  let index = 0;
  return snapshot.doc
    .toString()
    .replace(/\n/g, () => snapshot.breaks[index++] ?? '\n');
}

function firstPhysicalBreak(source: string): PhysicalBreak | undefined {
  return /\r\n|\r|\n/.exec(source)?.[0] as PhysicalBreak | undefined;
}

// A composition can delete the whole selection before inserting its replacement.
// Keep the document's ending policy through that temporary empty projection.
const preferredPhysicalBreak: StateField<PhysicalBreak> = StateField.define({
  create: (state) => firstPhysicalBreak(state.field(rawSourceField)) ?? '\n',
  update: (preferred, transaction) => {
    const explicit = transaction.annotation(explicitRawSource);
    if (explicit !== undefined)
      return firstPhysicalBreak(explicit) ?? preferred;
    let restored: PhysicalBreak | undefined;
    for (const effect of transaction.effects) {
      if (
        effect.is(restorePhysicalBreaks) &&
        effect.value.doc.eq(transaction.newDoc)
      )
        restored = effect.value.preferredBreak;
    }
    if (restored !== undefined) return restored;
    if (!transaction.docChanged) return preferred;
    return (
      firstPhysicalBreak(transaction.state.field(rawSourceField)) ?? preferred
    );
  },
});

export function rawAfterTransaction(transaction: Transaction): string | null {
  const raw = transaction.startState.field(rawSourceField);
  const display = transaction.newDoc.toString();
  const explicit = transaction.annotation(explicitRawSource);
  if (explicit !== undefined) {
    return new RawSourceMap(explicit).display === display ? explicit : null;
  }
  // Grouped undo effects run newest to oldest. The snapshot whose immutable
  // display text matches the complete undo transaction supplies exact endings.
  let restored: string | undefined;
  for (const effect of transaction.effects) {
    if (
      effect.is(restorePhysicalBreaks) &&
      effect.value.doc.eq(transaction.newDoc)
    ) {
      restored = restoreSnapshot(effect.value);
    }
  }
  if (restored !== undefined) return restored;
  if (!transaction.docChanged) return raw;
  const changes: DisplayChange[] = [];
  transaction.changes.iterChanges((from, to, _fromB, _toB, inserted) => {
    changes.push({ from, to, insert: inserted.toString() });
  });
  // Newly typed line breaks inherit the document's preferred physical ending,
  // including when a preceding composition transaction removed all its breaks.
  // Existing breaks outside an edited span are never normalized. Clipboard
  // and host insertions can instead supply their exact raw bytes explicitly.
  const plan = planRawChanges(
    raw,
    transaction.startState.doc.toString(),
    changes,
    {
      insertedLineBreak: transaction.startState.field(preferredPhysicalBreak),
    },
  );
  return plan.ok && plan.display === display ? plan.raw : null;
}

export const rawSourceField: StateField<string> = StateField.define({
  create: (state) => state.doc.toString(),
  update: (raw, transaction) => rawAfterTransaction(transaction) ?? raw,
  provide: () => preferredPhysicalBreak,
});

/** Inverse physical endings travel with the real CodeMirror undo event. */
export const rawSourceHistory = invertedEffects.of((transaction) => {
  if (
    !transaction.docChanged &&
    transaction.annotation(explicitRawSource) === undefined &&
    // Undo can restore only physical endings. Its restoration needs an inverse
    // too, otherwise Redo silently skips this source-only history event.
    !transaction.effects.some(
      (effect) =>
        effect.is(restorePhysicalBreaks) &&
        effect.value.doc.eq(transaction.newDoc),
    )
  )
    return [];
  const raw = transaction.startState.field(rawSourceField);
  return [
    restorePhysicalBreaks.of({
      doc: transaction.startState.doc,
      breaks: new RawSourceMap(raw).breaks.map((entry) => entry.physical),
      preferredBreak: transaction.startState.field(preferredPhysicalBreak),
    }),
  ];
});

export function rawSource(state: EditorState): string {
  return state.field(rawSourceField);
}
