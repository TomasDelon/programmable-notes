import type { RecoverySnapshot, RecoveryCatalog } from '../documents/recovery';
import type { DocumentSessions } from '../application/documentSessions';
import type {
  SourceBatch,
  SourceSession,
  PrepareExternalHistory,
} from '../editor/sourceWitness';

export interface ProductNavigationEntry {
  readonly logicalPath: string;
  readonly bytes: number;
  readonly loadedSessionId: string | null;
}
export interface LoadedProductDocument {
  readonly sessionId: string;
  readonly logicalPath: string;
}
export interface ProductCloseState {
  readonly phase: 'idle' | 'requested' | 'committing' | 'uncertain';
  readonly request: string | null;
}
export interface ProductCloseResolution {
  readonly status: 'cancelled' | 'committing' | 'refused';
  readonly request: string;
  readonly reason: string | null;
  readonly state: ProductCloseState;
}
/** Fixed native-close lifecycle, privately bound to the negotiated epoch. */
export interface ProductCloseGuard {
  observe(
    changed: (state: ProductCloseState) => void,
    onError: (reason: unknown) => void,
  ): () => void;
  resolve(
    request: string,
    action: 'cancel' | 'commit',
  ): Promise<ProductCloseResolution>;
}
export type ProductCloseOutcome = 'editing' | 'committing' | 'uncertain';
export interface RecoveryCopyAttempt {
  readonly version: RecoverySnapshot;
  readonly path: string;
  readonly source: string;
  readonly uncertain: boolean;
}
export interface ProductRecoveryState extends RecoveryCatalog {
  readonly operation: 'list' | 'read' | 'create' | null;
  readonly attempt: RecoveryCopyAttempt | null;
}
export interface ProductSnapshot {
  readonly recovery?: ProductRecoveryState;
  readonly vaultLabel: string | null;
  readonly entries: readonly ProductNavigationEntry[];
  readonly loadedDocuments: readonly LoadedProductDocument[];
  readonly selectedSessionId: string | null;
  readonly operation: 'choose' | 'index' | 'open' | 'create' | 'close' | null;
  readonly error: string | null;
  readonly unresolvedCleanup: number;
  readonly closing: boolean;
  readonly closeRequestId: string | null;
  readonly closeUncertain: boolean;
}
export interface ProductApplication {
  /** Trusted editor lifecycle only; authored documents never receive these ports. */
  observeExternal?(
    canAdopt: (sessionId: string) => boolean,
    prepareHistory?: PrepareExternalHistory,
  ): () => void;
  reconcileExternal?(): Promise<void>;
  /** A completed durable/readback receipt for the current accepted source only. */
  recoveryAcknowledged?(sessionId: string): boolean;
  refreshRecovery?(signal: AbortSignal): Promise<void>;
  restoreRecoveryCopy?(
    file: string,
    path: string,
    signal: AbortSignal,
  ): Promise<void>;
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
  prepareClose(detachEditor?: () => boolean): Promise<ProductCloseOutcome>;
}
/** Privileged host ports; never passed to authored document code. */
export interface NativeProductServices {
  readonly recovery?: {
    list(): Promise<RecoveryCatalog>;
    read(version: RecoverySnapshot): Promise<string>;
  };
  readonly closeGuard?: ProductCloseGuard;
  setCloseState(state: { dirty: boolean; busy: boolean }): Promise<void>;
  preserveAttempt(input: {
    sessionId: string;
    logicalPath: string;
    batch: SourceBatch;
  }): Promise<{ durable: boolean }>;
}
