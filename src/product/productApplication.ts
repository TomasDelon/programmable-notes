import type { DocumentSessions } from '../application/documentSessions';
import type { SourceBatch, SourceSession } from '../editor/sourceWitness';

export interface ProductNavigationEntry {
  readonly logicalPath: string;
  readonly bytes: number;
  readonly loadedSessionId: string | null;
}
export interface LoadedProductDocument {
  readonly sessionId: string;
  readonly logicalPath: string;
}
export interface ProductSnapshot {
  readonly vaultLabel: string | null;
  readonly entries: readonly ProductNavigationEntry[];
  readonly loadedDocuments: readonly LoadedProductDocument[];
  readonly selectedSessionId: string | null;
  readonly operation: 'choose' | 'index' | 'open' | 'create' | 'close' | null;
  readonly error: string | null;
  readonly unresolvedCleanup: number;
  readonly closing: boolean;
}
export interface ProductApplication {
  snapshot(): ProductSnapshot;
  subscribe(changed: () => void): () => void;
  readonly documents: Pick<
    DocumentSessions,
    'state' | 'subscribe' | 'setUnapplied'
  >;
  session(sessionId: string): SourceSession;
  loadedDocument(sessionId: string): LoadedProductDocument;
  chooseVault(): Promise<void>;
  refreshInventory(): Promise<void>;
  open(logicalPath: string): Promise<void>;
  create(logicalPath: string, initialSource: string): Promise<void>;
  select(sessionId: string): void;
  retrySave(sessionId: string): Promise<void>;
  retainAttempt(sessionId: string, batch: SourceBatch): Promise<void>;
  resolveAttempt(
    sessionId: string,
    batch: SourceBatch,
    action: 'keep' | 'discard',
  ): Promise<void>;
  closeDocument(sessionId: string): Promise<void>;
  prepareClose(): Promise<void>;
}
/** Privileged host ports; never passed to authored document code. */
export interface NativeProductServices {
  setCloseState(state: { dirty: boolean; busy: boolean }): Promise<void>;
  preserveAttempt(input: {
    sessionId: string;
    logicalPath: string;
    batch: SourceBatch;
  }): Promise<{ durable: boolean }>;
}
