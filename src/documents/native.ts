import { invoke } from '@tauri-apps/api/core';
import type {
  SnapshotInput,
  RecoveryInventory,
  SnapshotWritten,
  RecoverySnapshot,
} from './recovery';
import type { NativeDocument } from './workspace';
import type { NativeSourceObservation } from './nativeObservation';
export interface NativeVaultInfo {
  vaultId: string;
  /** Display label only; the root may have moved since OS authorization. */
  displayPath: string;
}
export interface NativeVaultInventory {
  vaultId: string;
  entries: { logicalPath: string; bytes: number }[];
}
export interface NativeVaultDocuments {
  status: 'acquired';
  vaultId: string;
  documents: NativeDocument[];
}
export interface NativeVaultCreated {
  status: 'acquired';
  vaultId: string;
  document: NativeDocument;
}
export type NativeVaultRefusalCode = 'rejected' | 'io' | 'conflict';
export interface NativeVaultOpenRefused {
  status: 'refused';
  vaultId: string;
  paths: string[];
  code: NativeVaultRefusalCode;
}
export interface NativeVaultCreateRefused {
  status: 'refused';
  vaultId: string;
  path: string;
  code: NativeVaultRefusalCode;
}
export type NativeVaultOpenOutcome =
  NativeVaultDocuments | NativeVaultOpenRefused;
export type NativeVaultCreateOutcome =
  NativeVaultCreated | NativeVaultCreateRefused;
export const nativeDocuments = {
  chooseVault: () => invoke<NativeVaultInfo | null>('choose_vault'),
  vaultInventory: (vaultId: string) =>
    invoke<NativeVaultInventory>('vault_inventory', { vaultId }),
  openVaultSources: (vaultId: string, paths: string[]) =>
    invoke<NativeVaultOpenOutcome>('open_vault_sources', { vaultId, paths }),
  createVaultSource: (vaultId: string, path: string, source: string) =>
    invoke<NativeVaultCreateOutcome>('create_vault_source', {
      vaultId,
      path,
      source,
    }),
  snapshots: () =>
    invoke<RecoveryInventory>('recovery_draft', { action: 'list' }),
  snapshot: (input: SnapshotInput) =>
    invoke<SnapshotWritten>('recovery_draft', { action: 'append', input }),
  restoreSnapshot: (file: string) =>
    invoke<{ name: string; source: string }>('recovery_draft', {
      action: 'restore-version',
      file,
    }),
  deleteSnapshot: (file: string) =>
    invoke<void>('recovery_draft', { action: 'delete-version', file }),
  migrateRecovery: () =>
    invoke<RecoverySnapshot | null>('recovery_draft', { action: 'migrate' }),
  draft: (action: 'keep' | 'restore' | 'delete', source?: string) =>
    invoke<string | null>('recovery_draft', { action, source }),
  open: () => invoke<NativeDocument[]>('open_documents'),
  openFolder: () => invoke<NativeDocument[]>('open_notes_folder'),
  save: (id: string, revision: string, source: string) =>
    invoke<{ revision: string; durable: boolean }>('save_document', {
      id,
      revision,
      source,
    }),
  saveAs: (name: string, source: string) =>
    invoke<NativeDocument | null>('save_document_as', { name, source }),
  reopen: (id: string, revision: string) =>
    invoke<NativeDocument>('reopen_document', { id, revision }),
  observe: (id: string, revision: string) =>
    invoke<NativeSourceObservation>('observe_document', { id, revision }),
  watch: (id: string, revision: string) =>
    invoke<string>('watch_document', { id, revision }),
  pollWatch: (id: string, watchId: string) =>
    invoke<boolean>('poll_document_watch', { id, watchId }),
  unwatch: (id: string, watchId: string) =>
    invoke<void>('unwatch_document', { id, watchId }),
  close: (id: string) => invoke<void>('close_document', { id }),
  confirmDiscard: () => invoke<boolean>('confirm_discard'),
  dirty: (dirty: boolean, busy: boolean) =>
    invoke<void>('set_documents_dirty', { dirty, busy }),
};
