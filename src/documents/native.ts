import { invoke } from '@tauri-apps/api/core';
import type { NativeDocument } from './workspace';
export const nativeDocuments = {
  draft: (action: 'keep' | 'restore' | 'delete', source?: string) =>
    invoke<string | null>('recovery_draft', { action, source }),
  open: () => invoke<NativeDocument[]>('open_documents'),
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
