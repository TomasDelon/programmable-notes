import { useCallback, useEffect, useRef, useState } from 'react';
import {
  MAX_FILE_BYTES,
  MAX_FILES,
  MAX_TOTAL_BYTES,
} from '../documents/workspace';
import { isSupportedSource } from '../sourceTypes';
import {
  attachmentMarkdown,
  downloadAttachment,
  prepareAttachment,
  verifyAssetCatalog,
  type StoredAsset,
} from '../assets/catalog';
import {
  parsePortableBackup,
  serializePortableBackup,
  type BackupRecovery,
} from '../backup/portable';
import {
  addFolder,
  createDocument,
  createWebState,
  importSources,
  MAX_BACKUP_BYTES,
  moveDocument,
  renameDocument,
  repositionTreeEntry,
  restoreDocument,
  selectDocument,
  trashDocument,
  updateDocumentSource,
  type ImportedSource,
  type TreeEntry,
  type TreePlacement,
  type WebState,
} from './workspace';
import {
  listRecoveryVersions,
  readRecoveryVersion,
  readRecoverySnapshots,
  RecoveryReadUnavailableError,
  readWorkspace,
  readWorkspaceRevision,
  WorkspaceConflictError,
  writeWorkspace,
} from './persistence';

export type SaveStatus = 'loading' | 'saving' | 'saved' | 'error' | 'conflict';

/** Appearance and navigation do not constitute a competing document edit. */
function documentContent(state: WebState): string {
  return JSON.stringify({
    ...state,
    theme: null,
    mode: null,
    recentIds: null,
    workspace: { ...state.workspace, selected: null, entry: null },
  });
}

/** Keep this tab's reading position while adopting verified remote content. */
function retainView(content: WebState, view: WebState): WebState {
  const available = (key: string) =>
    Object.hasOwn(content.documents, key) && !content.documents[key]!.trashedAt;
  return {
    ...content,
    theme: view.theme,
    mode: view.mode,
    recentIds: view.recentIds.filter(available),
    workspace: {
      ...content.workspace,
      selected: available(view.workspace.selected)
        ? view.workspace.selected
        : content.workspace.selected,
      entry: available(view.workspace.entry)
        ? view.workspace.entry
        : content.workspace.entry,
    },
  };
}

function errorMessage(error: unknown): string {
  if (error instanceof DOMException && error.name === 'QuotaExceededError') {
    return 'This browser has no storage space available. Your previous saved workspace is intact and your edits remain here. Export a backup before closing this tab.';
  }
  return error instanceof Error
    ? error.message
    : 'The operation failed. Your current notes were retained.';
}

async function downloadBackup(state: WebState): Promise<string> {
  let recovery: BackupRecovery[];
  let recoveryIncluded = true;
  try {
    recovery = await readRecoverySnapshots();
  } catch (reason) {
    if (!(reason instanceof RecoveryReadUnavailableError)) throw reason;
    recovery = [];
    recoveryIncluded = false;
  }
  const text = await serializePortableBackup(state, recovery, {
    recoveryIncluded,
  });
  const url = URL.createObjectURL(
    new Blob([text], {
      type: 'application/json;charset=utf-8',
    }),
  );
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = `programmable-notes-${new Date().toISOString().slice(0, 10)}${recoveryIncluded ? '' : '-rescue'}.json`;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
  return recoveryIncluded
    ? 'Backup exported with current notes, attachments, Trash and recovery history.'
    : 'Rescue backup exported with all current notes, metadata, Trash and attachments. Browser recovery history could not be read and is not included. Keep this file before closing the tab.';
}

export function useWebWorkspace() {
  const [state, setState] = useState<WebState | null>(null);
  const [loading, setLoading] = useState(true);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>('loading');
  const [error, setError] = useState('');
  const [backupNotice, setBackupNotice] = useState('');
  const [conflict, setConflict] = useState(false);
  const [persistentStorage, setPersistentStorage] = useState<boolean | null>(
    null,
  );
  const current = useRef<WebState | null>(null);
  const savedState = useRef<WebState | null>(null);
  const mounted = useRef(false);
  const generation = useRef(0);
  const savedGeneration = useRef(0);
  const revision = useRef(0);
  const conflicting = useRef(false);
  // Equation/link/recovery drafts can be dirty before they change source.
  // Keep this synchronous so a focus read cannot race the editor's render.
  const pendingEditorDraft = useRef(false);
  const operationBusy = useRef(false);
  const saving = useRef<Promise<void> | null>(null);
  const storagePermission = useRef<Promise<void> | null>(null);
  const loadSequence = useRef(0);
  // Async imports may coexist with edits, but never cross a workspace replacement.
  const workspaceEpoch = useRef(0);

  const setPendingEditorDraft = useCallback((pending: boolean) => {
    pendingEditorDraft.current = pending;
  }, []);

  const report = useCallback((reason: unknown) => {
    if (!mounted.current) return;
    setError(errorMessage(reason));
    if (reason instanceof WorkspaceConflictError) {
      conflicting.current = true;
      setConflict(true);
      setSaveStatus('conflict');
    } else setSaveStatus('error');
  }, []);

  const persist = useCallback((): Promise<void> => {
    if (saving.current) return saving.current;
    if (!current.current || conflicting.current || operationBusy.current)
      return Promise.resolve();
    if (savedGeneration.current >= generation.current) return Promise.resolve();
    const task = (async () => {
      try {
        let rebases = 0;
        while (
          current.current &&
          savedGeneration.current < generation.current
        ) {
          const snapshot = current.current;
          const snapshotGeneration = generation.current;
          if (mounted.current) setSaveStatus('saving');
          let result;
          try {
            result = await writeWorkspace(snapshot, revision.current);
          } catch (reason) {
            if (
              !(reason instanceof WorkspaceConflictError) ||
              !savedState.current ||
              rebases++ >= 3
            )
              throw reason;
            const stored = await readWorkspace();
            const latest = current.current;
            if (!stored || !latest) throw reason;
            const baseline = documentContent(savedState.current);
            const localChanged = documentContent(latest) !== baseline;
            const remoteChanged = documentContent(stored.state) !== baseline;
            // A pending editor draft is also local work, even when the source
            // is unchanged. Adopting remote content could invalidate its range
            // or unmount its note. Remote view-only writes remain safe to rebase.
            if (remoteChanged && (localChanged || pendingEditorDraft.current))
              throw reason;
            const rebased = retainView(
              localChanged ? latest : stored.state,
              latest,
            );
            current.current = rebased;
            savedState.current = stored.state;
            revision.current = stored.revision;
            if (remoteChanged) workspaceEpoch.current++;
            if (mounted.current) setState(rebased);
            continue;
          }
          revision.current = result.revision;
          savedState.current = result.state;
          savedGeneration.current = snapshotGeneration;
        }
        if (mounted.current) {
          setSaveStatus('saved');
          setError('');
        }
      } catch (reason) {
        report(reason);
      } finally {
        saving.current = null;
      }
    })();
    saving.current = task;
    return task;
  }, [report]);

  const load = useCallback(async () => {
    workspaceEpoch.current++;
    const token = ++loadSequence.current;
    const startingGeneration = generation.current;
    if (mounted.current) setLoading(true);
    try {
      const stored = await readWorkspace();
      if (!mounted.current || token !== loadSequence.current) return;
      if (generation.current !== startingGeneration) {
        throw new Error(
          'The workspace changed while reloading. Your newer edits were retained. Save or export them before trying again.',
        );
      }
      const next = stored?.state ?? createWebState();
      workspaceEpoch.current++;
      current.current = next;
      savedState.current = stored?.state ?? null;
      revision.current = stored?.revision ?? 0;
      generation.current++;
      savedGeneration.current = stored
        ? generation.current
        : generation.current - 1;
      conflicting.current = false;
      setConflict(false);
      setState(next);
      setError('');
      setSaveStatus(stored ? 'saved' : 'saving');
      void navigator.storage
        ?.persisted?.()
        .then((persisted) => {
          if (mounted.current) setPersistentStorage(persisted);
        })
        .catch(() => {});
    } catch (reason) {
      if (token === loadSequence.current) report(reason);
    } finally {
      if (mounted.current && token === loadSequence.current) setLoading(false);
    }
  }, [report]);

  useEffect(() => {
    mounted.current = true;
    let active = true;
    queueMicrotask(() => {
      if (active) void load();
    });
    return () => {
      active = false;
      mounted.current = false;
    };
  }, [load]);

  useEffect(() => {
    async function refreshCleanTab() {
      if (
        !current.current ||
        !savedState.current ||
        savedGeneration.current < generation.current ||
        saving.current ||
        conflicting.current ||
        pendingEditorDraft.current ||
        operationBusy.current
      )
        return;
      const startingGeneration = generation.current;
      const startingRevision = revision.current;
      try {
        const stored = await readWorkspace();
        // Input or a save arriving during the read always wins. A subsequent
        // CAS save still distinguishes view changes from competing edits.
        if (
          !mounted.current ||
          !stored ||
          !current.current ||
          stored.revision <= startingRevision ||
          generation.current !== startingGeneration ||
          revision.current !== startingRevision ||
          saving.current ||
          operationBusy.current ||
          pendingEditorDraft.current ||
          conflicting.current
        )
          return;
        const next = retainView(stored.state, current.current);
        workspaceEpoch.current++;
        current.current = next;
        savedState.current = stored.state;
        revision.current = stored.revision;
        generation.current++;
        savedGeneration.current = generation.current;
        setState(next);
        setSaveStatus('saved');
        setError('');
      } catch (reason) {
        report(reason);
      }
    }
    const onFocus = () => void refreshCleanTab();
    const onVisible = () => {
      if (document.visibilityState === 'visible') void refreshCleanTab();
    };
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [report]);

  useEffect(() => {
    if (!state || loading || conflict || saveStatus === 'error') return;
    const timer = setTimeout(() => void persist(), 250);
    return () => clearTimeout(timer);
  }, [state, loading, conflict, saveStatus, persist]);

  useEffect(() => {
    const beforeUnload = (event: BeforeUnloadEvent) => {
      if (
        savedGeneration.current < generation.current ||
        pendingEditorDraft.current ||
        operationBusy.current
      ) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    const onVisibility = () => {
      if (document.visibilityState === 'hidden') void persist();
    };
    window.addEventListener('beforeunload', beforeUnload);
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, [persist]);

  const mutate = useCallback(
    (update: (previous: WebState) => WebState): void => {
      if (!current.current || operationBusy.current) return;
      try {
        const next = update(current.current);
        if (next === current.current) return;
        current.current = next;
        generation.current++;
        setState(next);
        if (!conflicting.current) {
          setSaveStatus('saving');
          setError('');
        }
      } catch (reason) {
        report(reason);
      }
    },
    [report],
  );

  const saveNow = useCallback(async () => {
    await persist();
    const saved =
      Boolean(current.current) &&
      savedGeneration.current >= generation.current &&
      !conflicting.current &&
      !operationBusy.current;
    if (!saved) return false;
    // Persistent-storage permission is an optional preference, not a write.
    // Some browsers leave this promise pending while waiting for a user prompt.
    // Deduplicate that request without holding Save or app updates open.
    if (navigator.storage?.persist && !storagePermission.current) {
      try {
        const request = navigator.storage
          .persist()
          .then((granted) => {
            if (mounted.current) setPersistentStorage(granted);
          })
          .catch(() => {
            /* The completed browser write does not require this permission. */
          })
          .finally(() => {
            if (storagePermission.current === request)
              storagePermission.current = null;
          });
        storagePermission.current = request;
      } catch {
        /* Backup remains available when persistent storage is unsupported. */
      }
    }
    // Drain actual writes again before permitting a reload. Input arriving
    // during either write must be persisted, independently of permission UI.
    await persist();
    const complete =
      Boolean(current.current) &&
      savedGeneration.current >= generation.current &&
      !conflicting.current &&
      !operationBusy.current;
    if (complete && mounted.current) {
      setSaveStatus('saved');
      setError('');
    }
    return complete;
  }, [persist]);

  async function importFiles(list: FileList | File[]): Promise<void> {
    const files = Array.from(list);
    if (!files.length || !current.current || operationBusy.current) return;
    const importEpoch = workspaceEpoch.current;
    try {
      if (pendingEditorDraft.current)
        throw new Error(
          'Finish the current editor draft before importing notes. No files were imported.',
        );
      if (files.length > MAX_FILES)
        throw new Error('Import up to 32 related source files at a time.');
      if (
        files.some(
          (file) => !isSupportedSource(file.webkitRelativePath || file.name),
        )
      )
        throw new Error(
          'Select Markdown, MDX, JavaScript or TypeScript source files.',
        );
      if (files.some((file) => file.size > MAX_FILE_BYTES))
        throw new Error('A source exceeds the 500 KB import limit.');
      if (files.reduce((bytes, file) => bytes + file.size, 0) > MAX_TOTAL_BYTES)
        throw new Error('A connected import exceeds 8 MiB.');
      const sources: ImportedSource[] = [];
      for (const file of files) {
        let source: string;
        try {
          source = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: true,
          }).decode(await file.arrayBuffer());
        } catch {
          throw new Error(
            `Could not read ${file.name} as UTF-8 text. No files were imported.`,
          );
        }
        sources.push({
          logicalPath: file.webkitRelativePath || file.name,
          source,
        });
      }
      if (!mounted.current) return;
      if (workspaceEpoch.current !== importEpoch || operationBusy.current)
        throw new Error(
          'The workspace changed while the source files were being read. No files were imported. Select them again in the current workspace.',
        );
      if (pendingEditorDraft.current)
        throw new Error(
          'An editor draft opened while the source files were being read. No files were imported. Finish the draft, then select the files again.',
        );
      mutate((previous) => importSources(previous, sources));
    } catch (reason) {
      report(reason);
    }
  }

  async function replaceWorkspace(
    next: WebState,
    recovery: readonly BackupRecovery[] = [],
  ): Promise<void> {
    if (operationBusy.current) return;
    if (
      current.current &&
      !window.confirm(
        'Replace this workspace with the selected backup? Export a backup first if you want to keep your current notes.',
      )
    )
      return;
    await persist();
    if (operationBusy.current) return;
    operationBusy.current = true;
    workspaceEpoch.current++;
    if (mounted.current) {
      setLoading(true);
      setSaveStatus('saving');
    }
    try {
      const expectedRevision = await readWorkspaceRevision();
      const stored = await writeWorkspace(
        next,
        expectedRevision,
        true,
        recovery,
      );
      if (!mounted.current) return;
      workspaceEpoch.current++;
      current.current = next;
      savedState.current = stored.state;
      generation.current++;
      savedGeneration.current = generation.current;
      revision.current = stored.revision;
      conflicting.current = false;
      setConflict(false);
      setError('');
      setState(next);
      setSaveStatus('saved');
    } catch (reason) {
      report(reason);
    } finally {
      operationBusy.current = false;
      if (mounted.current) setLoading(false);
    }
  }

  async function restoreBackup(file: File): Promise<void> {
    try {
      if (file.size > MAX_BACKUP_BYTES)
        throw new Error('The backup exceeds the 32 MiB import limit.');
      const text = new TextDecoder('utf-8', { fatal: true }).decode(
        await file.arrayBuffer(),
      );
      const decoded = await parsePortableBackup(text);
      // Restored images pass the same real decoder check as freshly imported images.
      const allAssets = Object.assign(
        {},
        ...decoded.recovery.map((item) => item.state.assets),
        decoded.state.assets,
      );
      await verifyAssetCatalog(allAssets, true);
      await replaceWorkspace(decoded.state, decoded.recovery);
    } catch (reason) {
      report(reason);
    }
  }

  async function restoreRecovery(version: number): Promise<void> {
    try {
      const stored = await readRecoveryVersion(version);
      await replaceWorkspace(stored.state);
    } catch (reason) {
      report(reason);
    }
  }

  async function listRecovery(): Promise<
    { revision: number; updated: number }[]
  > {
    try {
      return await listRecoveryVersions();
    } catch (reason) {
      report(reason);
      return [];
    }
  }

  async function reloadFromStorage(): Promise<void> {
    if (operationBusy.current) return;
    const preservePendingDraft = () => {
      if (!pendingEditorDraft.current) return false;
      report(
        new Error(
          'Finish the current editor draft before reloading. The workspace was not replaced.',
        ),
      );
      return true;
    };
    if (preservePendingDraft()) return;
    if (
      savedGeneration.current < generation.current &&
      !window.confirm(
        'Reload the saved workspace? Unsaved changes in this tab will be replaced. Export a backup first to keep them.',
      )
    )
      return;
    if (saving.current) await saving.current;
    // The editor stays mounted while a save drains. A draft may have opened
    // during that await, before load() would replace it with the loading UI.
    if (preservePendingDraft()) return;
    await load();
  }

  async function importAttachments(
    list: FileList | File[],
    documentId = current.current?.workspace.selected,
  ): Promise<void> {
    const files = Array.from(list);
    if (
      !files.length ||
      !documentId ||
      !current.current ||
      operationBusy.current
    )
      return;
    const importEpoch = workspaceEpoch.current;
    try {
      if (files.length > 16)
        throw new Error('Import up to 16 attachments at a time.');
      const prepared: StoredAsset[] = [];
      // Every file must pass before the catalog or source changes at all.
      for (const file of files) prepared.push(await prepareAttachment(file));
      if (!mounted.current) return;
      if (workspaceEpoch.current !== importEpoch || operationBusy.current)
        throw new Error(
          'The workspace changed while the attachments were being checked. No files were imported. Select them again in the current workspace.',
        );
      mutate((previous) => {
        if (
          !previous.documents[documentId] ||
          previous.documents[documentId]!.trashedAt
        )
          throw new Error(
            'The target note was removed while the attachments were being checked. No files were inserted.',
          );
        const assets = { ...previous.assets };
        for (const asset of prepared) assets[asset.id] ??= asset;
        const original = previous.workspace.files[documentId]!;
        const eol = original.match(/\r\n|\r|\n/)?.[0] ?? '\n';
        const references = prepared
          .map((asset) => attachmentMarkdown(assets[asset.id]!))
          .join(eol + eol);
        return updateDocumentSource(
          { ...previous, assets: Object.freeze(assets) },
          documentId,
          original + (original ? eol + eol : '') + references + eol,
        );
      });
    } catch (reason) {
      report(reason);
    }
  }

  return {
    state,
    loading,
    saveStatus,
    error,
    backupNotice,
    conflict,
    setPendingEditorDraft,
    persistentStorage,
    // Read-only freshness witness. It grants no mutation or storage authority.
    isCurrentSource: (key: string, source: string): boolean =>
      current.current?.workspace.files[key] === source,
    canUpdateSource: (key: string, source: string): boolean => {
      if (!current.current || operationBusy.current) return false;
      try {
        updateDocumentSource(current.current, key, source);
        return true;
      } catch (reason) {
        queueMicrotask(() =>
          report(
            new Error(
              `${errorMessage(reason)} The edit was not inserted; the previous source was retained.`,
            ),
          ),
        );
        return false;
      }
    },
    updateSource: (key: string, source: string) =>
      mutate((previous) => updateDocumentSource(previous, key, source)),
    select: (key: string) =>
      mutate((previous) => selectDocument(previous, key)),
    createNote: (title?: string, folder?: string): string | null => {
      let key: string | null = null;
      mutate((previous) => {
        const created = createDocument(previous, title, folder);
        key = created.key;
        return created.state;
      });
      return key;
    },
    rename: (key: string, title: string) =>
      mutate((previous) => renameDocument(previous, key, title)),
    move: (key: string, folder: string) =>
      mutate((previous) => moveDocument(previous, key, folder)),
    reorderTree: (
      source: TreeEntry,
      target: TreeEntry | null,
      placement: TreePlacement,
    ) =>
      mutate((previous) =>
        repositionTreeEntry(previous, source, target, placement),
      ),
    createFolder: (path: string) =>
      mutate((previous) => addFolder(previous, path)),
    trash: (key: string) => mutate((previous) => trashDocument(previous, key)),
    restore: (key: string) =>
      mutate((previous) => restoreDocument(previous, key)),
    removeRecent: (key: string) =>
      mutate((previous) => ({
        ...previous,
        recentIds: previous.recentIds.filter((id) => id !== key),
      })),
    setMode: (mode: WebState['mode']) =>
      mutate((previous) =>
        previous.mode === mode ? previous : { ...previous, mode },
      ),
    setTheme: (theme: WebState['theme']) =>
      mutate((previous) =>
        previous.theme === theme ? previous : { ...previous, theme },
      ),
    importFiles,
    importAttachments,
    downloadAttachment: (id: string) => {
      const asset = current.current?.assets?.[id];
      if (asset) downloadAttachment(asset);
      else
        report(
          new Error(
            'The attachment bytes are missing. Restore a complete backup to recover them.',
          ),
        );
    },
    exportBackup: async () => {
      try {
        if (current.current) {
          const notice = await downloadBackup(current.current);
          if (mounted.current) setBackupNotice(notice);
        }
      } catch (reason) {
        if (mounted.current) setBackupNotice('');
        report(reason);
      }
    },
    restoreBackup,
    saveNow,
    reloadFromStorage,
    listRecovery,
    restoreRecovery,
  };
}
