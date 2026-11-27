export interface SnapshotInput {
  documentId: string;
  name: string;
  baseline: string | null;
  parent: string | null;
  source: string;
}
export interface RecoverySnapshot {
  file: string;
  id: string;
  metadata: {
    schema: number;
    documentId: string;
    name: string;
    baseline: string | null;
    parent: string | null;
    generation: number;
    createdAtMs: number;
    sourceBytes: number;
  };
}
export interface RecoveryInventory {
  snapshots: RecoverySnapshot[];
  errors: { file: string; message: string }[];
  capacityExceeded: boolean;
}
export interface SnapshotWritten {
  snapshot: RecoverySnapshot;
  durable: boolean;
  warning: string | null;
}

export async function recoveryDigest(text: string) {
  const bytes = await crypto.subtle.digest(
    'SHA-256',
    new TextEncoder().encode(text),
  );
  return Array.from(new Uint8Array(bytes), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}

export interface RecoveryCandidate {
  documentKey: string;
  name: string;
  source: string;
  baseline?: string;
  displayPath?: string;
}

export interface RecoveryCatalog {
  readonly versions: readonly RecoverySnapshot[];
  readonly warning: boolean;
}
