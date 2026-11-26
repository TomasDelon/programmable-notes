import { invoke } from '@tauri-apps/api/core';
import type {
  SnapshotInput,
  RecoveryInventory,
  SnapshotWritten,
  RecoverySnapshot,
} from './recovery';
import type { NativeDocument } from './workspace';
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
  vaultId: string;
  documents: NativeDocument[];
}
export interface NativeVaultCreated {
  vaultId: string;
  document: NativeDocument;
}
export const nativeDocuments = {
  chooseVault: () => invoke<NativeVaultInfo | null>('choose_vault'),
  vaultInventory: (vaultId: string) =>
    invoke<NativeVaultInventory>('vault_inventory', { vaultId }),
  openVaultSources: (vaultId: string, paths: string[]) =>
    invoke<NativeVaultDocuments>('open_vault_sources', { vaultId, paths }),
  createVaultSource: (vaultId: string, path: string, source: string) =>
    invoke<NativeVaultCreated>('create_vault_source', {
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
  close: (id: string) => invoke<void>('close_document', { id }),
  confirmDiscard: () => invoke<boolean>('confirm_discard'),
  dirty: (dirty: boolean, busy: boolean) =>
    invoke<void>('set_documents_dirty', { dirty, busy }),
};
