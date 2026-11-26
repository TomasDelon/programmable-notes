/** Trusted editor/application provenance. Never document-runtime authority. */
export interface SourceWitness {
  readonly sessionId: string;
  readonly editorRevision: number;
  readonly source: string;
}

export interface SourceBatch {
  readonly expected: SourceWitness;
  readonly source: string;
}

/** Publication is synchronous and non-reentrant; it returns the host's receipt. */
export interface SourceSession {
  readonly witness: SourceWitness;
  isCurrent(witness: SourceWitness): boolean;
  validate(batch: SourceBatch): boolean;
  publish(batch: SourceBatch): SourceWitness;
  /** Keep an exact failed publication attempt outside accepted-source persistence. */
  retainFailure(batch: SourceBatch): void;
}

export type SourceReceipt =
  | { readonly accepted: true; readonly witness: SourceWitness }
  | { readonly accepted: false };

export function sameSourceWitness(a: SourceWitness, b: SourceWitness): boolean {
  return (
    a.sessionId === b.sessionId &&
    a.editorRevision === b.editorRevision &&
    a.source === b.source
  );
}

export function validSourceWitness(witness: SourceWitness): boolean {
  return (
    typeof witness?.sessionId === 'string' &&
    witness.sessionId.length > 0 &&
    Number.isSafeInteger(witness.editorRevision) &&
    witness.editorRevision >= 0 &&
    typeof witness.source === 'string'
  );
}
