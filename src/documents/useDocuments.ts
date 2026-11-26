import { isMdxSource, isSupportedSource } from '../sourceTypes';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { nativeDocuments } from './native';
import { recoveryDigest, type SnapshotWritten } from './recovery';
import {
  addDocuments,
  completeSave,
  initialWorkspace,
  isDirty,
  removeDocument,
  validateFiles,
  createNote,
  MAX_FILES,
  MAX_FILE_BYTES,
  MAX_TOTAL_BYTES,
  type NativeDocument,
  type Workspace,
} from './workspace';

interface VisualRecovery {
  key: string;
  documentId: string;
  name: string;
  baseline: string;
  source: string;
  writing?: Promise<SnapshotWritten>;
  written?: SnapshotWritten;
}

async function saveVisualRecovery(attempt: VisualRecovery) {
  if (attempt.written?.durable) return;
  const writing = (attempt.writing ??= (async () =>
    nativeDocuments.snapshot({
      documentId: attempt.documentId,
      name: attempt.name,
      source: attempt.source,
      baseline: await recoveryDigest(attempt.baseline),
      parent: attempt.written?.snapshot.id ?? null,
    }))());
  try {
    attempt.written = await writing;
    if (!attempt.written.durable)
      throw Error(
        attempt.written.warning ||
          'A durable recovery copy could not be confirmed. The draft remains open.',
      );
  } finally {
    attempt.writing = undefined;
  }
}

export function useDocuments(
  initialFiles: Record<string, string>,
  initialEntry: string,
  unappliedVisualEdit = false,
) {
  const [workspace, setWorkspace] = useState(() =>
    initialWorkspace(initialFiles, initialEntry),
  );
  const running = useRef(false);
  const current = useRef(workspace);
  const pendingVisual = useRef(unappliedVisualEdit);
  const visualRecovery = useRef<VisualRecovery | null>(null);
  useLayoutEffect(() => {
    current.current = workspace;
    pendingVisual.current = unappliedVisualEdit;
  }, [workspace, unappliedVisualEdit]);
  const [busy, setBusy] = useState(false),
    [fileError, setFileError] = useState(''),
    [fileNotice, setFileNotice] = useState<{
      key: string;
      source: string;
      text: string;
    } | null>(null);
  const [notesFolder, setNotesFolder] = useState<string | null>(null);
  const native = isTauri(),
    dirty = isDirty(workspace) || unappliedVisualEdit;
  // Native close protection covers all buffers, including edits during an async save.
  useEffect(() => {
    if (native)
      void nativeDocuments
        .dirty(dirty, busy)
        .catch((error) =>
          setFileError(`Close protection unavailable: ${String(error)}`),
        );
  }, [native, dirty, busy]);
  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (isDirty(current.current) || pendingVisual.current) {
        event.preventDefault();
        event.returnValue = '';
      }
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, []);
  const allowDocumentOperation = useCallback(() => {
    if (!pendingVisual.current) return true;
    setFileError(
      'Apply or cancel the visual edit before changing documents or saving.',
    );
    return false;
  }, []);
  const operation = useCallback(
    async (task: () => Promise<void>) => {
      if (running.current || !allowDocumentOperation()) return;
      running.current = true;
      setBusy(true);
      setFileError('');
      setFileNotice(null);
      try {
        await task();
      } catch (error) {
        setFileError(`${String(error)} Source retained.`);
      } finally {
        running.current = false;
        setBusy(false);
      }
    },
    [allowDocumentOperation],
  );
  async function openSelection(
    pick: () => Promise<NativeDocument[]>,
    folder = false,
  ) {
    await operation(async () => {
      if (!native)
        throw Error('Opening native sources requires the desktop editor.');
      const docs = await pick();
      if (!docs.length) return;
      let next: Workspace;
      try {
        next = addDocuments(
          current.current,
          docs.map((doc) => ({
            logicalPath: doc.logicalPath,
            source: doc.source,
            native: doc,
          })),
        );
      } catch (error) {
        await Promise.allSettled(
          docs.map((doc) => nativeDocuments.close(doc.id)),
        );
        throw error;
      }
      setWorkspace(next);
      if (folder) {
        const { displayPath, logicalPath } = docs[0]!;
        const suffix = '/' + logicalPath;
        // Display text only. This path never authorizes another file operation.
        setNotesFolder(
          displayPath.endsWith(suffix)
            ? displayPath.slice(0, -suffix.length) || '/'
            : null,
        );
      }
    });
  }
  const openNative = () => openSelection(nativeDocuments.open);
  const openFolder = () => openSelection(nativeDocuments.openFolder, true);
  function newNote() {
    if (running.current || !allowDocumentOperation()) return;
    setFileError('');
    setFileNotice(null);
    setWorkspace(createNote);
  }
  async function restoreNativeVersion(file: string) {
    await operation(async () => {
      if (!native)
        throw Error('Native draft recovery requires the desktop editor.');
      const restored = await nativeDocuments.restoreSnapshot(file);
      const next = addDocuments(current.current, [
        { logicalPath: restored.name, source: restored.source },
      ]);
      delete next.saved[next.selected];
      setWorkspace(next);
      setFileNotice({
        key: next.selected,
        source: next.files[next.selected]!,
        text: 'Recovery version opened as a separate unsaved document.',
      });
    });
  }
  async function nativeDraft(action: 'keep' | 'restore' | 'delete') {
    await operation(async () => {
      if (!native)
        throw Error('Native draft recovery requires the desktop editor.');
      const state = current.current;
      const source = await nativeDocuments.draft(
        action,
        action === 'keep' ? state.files[state.selected] : undefined,
      );
      if (action === 'restore') {
        if (source === null) throw Error('No recovery draft is stored.');
        const next = addDocuments(current.current, [
          { logicalPath: 'recovered.mdx', source },
        ]);
        delete next.saved[next.selected];
        setWorkspace(next);
        setFileNotice({
          key: next.selected,
          source,
          text: 'Recovery draft opened as an unsaved document.',
        });
      } else {
        setFileNotice({
          key: state.selected,
          source: state.files[state.selected]!,
          text:
            action === 'keep'
              ? 'Recovery draft stored.'
              : 'Recovery draft deleted.',
        });
      }
    });
  }
  async function restoreBrowserDraft(name: string, source: string) {
    await operation(async () => {
      if (native) throw Error('Browser drafts are unavailable on desktop.');
      const next = addDocuments(current.current, [
        { logicalPath: name, source },
      ]);
      delete next.saved[next.selected];
      setWorkspace(next);
    });
  }
  async function openBrowser(list: FileList | null) {
    if (!list?.length) return;
    await operation(async () => {
      const existing = current.current.files;
      if (Object.keys(existing).length + list.length > MAX_FILES)
        throw Error('Workspace exceeds 32 files; close unused sources.');
      const selectedFiles = Array.from(list);
      if (
        selectedFiles.some(
          (file) => !isSupportedSource(file.webkitRelativePath || file.name),
        )
      )
        throw Error('Select a supported Markdown or source module file.');
      if (selectedFiles.some((file) => file.size > MAX_FILE_BYTES))
        throw Error('File exceeds 500 KB limit.');
      validateFiles(existing);
      const encoder = new TextEncoder();
      const bytes =
        Object.values(existing).reduce(
          (total, source) => total + encoder.encode(source).byteLength,
          0,
        ) + selectedFiles.reduce((total, file) => total + file.size, 0);
      if (bytes > MAX_TOTAL_BYTES)
        throw Error('Workspace exceeds 8 MiB of source; close unused sources.');
      const docs = [];
      for (const file of selectedFiles) {
        const bytes = await file.arrayBuffer();
        let source: string;
        try {
          source = new TextDecoder('utf-8', {
            fatal: true,
            ignoreBOM: true,
          }).decode(bytes);
        } catch {
          throw Error(`File is not valid UTF-8: ${file.name}`);
        }
        docs.push({
          logicalPath: file.webkitRelativePath || file.name,
          source,
        });
      }
      setWorkspace(addDocuments(current.current, docs));
    });
  }
  async function save(asNew = false) {
    await operation(async () => {
      const state = current.current,
        key = state.selected,
        source = state.files[key]!;
      validateFiles({ [key]: source });
      const old = state.bindings[key];
      if (!native) {
        const url = URL.createObjectURL(
          new Blob([source], { type: 'text/plain;charset=utf-8' }),
        );
        const a = document.createElement('a');
        a.href = url;
        a.download = key.split('/').pop()!;
        a.click();
        setTimeout(() => URL.revokeObjectURL(url), 1000);
        setWorkspace((next) => completeSave(next, key, source));
        setFileNotice({ key, source, text: 'Source download requested.' });
        return;
      }
      if (old && !asNew) {
        const saved = await nativeDocuments.save(old.id, old.revision, source);
        setWorkspace((next) =>
          completeSave(
            next,
            key,
            source,
            { ...old, revision: saved.revision },
            old.id,
          ),
        );
        setFileNotice({
          key,
          source,
          text: saved.durable
            ? 'Saved.'
            : 'Saved, but crash durability could not be confirmed.',
        });
      } else {
        const doc = await nativeDocuments.saveAs(
          old?.name || key.split('/').pop()!,
          source,
        );
        if (!doc) return;
        setWorkspace((next) =>
          completeSave(
            next,
            key,
            source,
            {
              id: doc.id,
              revision: doc.revision,
              name: doc.name,
              displayPath: doc.displayPath,
            },
            old?.id,
          ),
        );
        setFileNotice({
          key,
          source,
          text: doc.durabilityWarning
            ? 'Saved, but crash durability could not be confirmed.'
            : 'Saved.',
        });
        if (old) await nativeDocuments.close(old.id);
      }
    });
  }
  async function reopen() {
    await operation(async () => {
      const state = current.current,
        key = state.selected,
        binding = state.bindings[key];
      if (!binding) throw Error('Open a native file before reopening.');
      const source = state.files[key];
      if (
        source !== state.saved[key] &&
        !(await nativeDocuments.confirmDiscard())
      )
        return;
      if (current.current.files[key] !== source)
        throw Error('Source changed while confirming; reopen again.');
      const doc = await nativeDocuments.reopen(binding.id, binding.revision);
      setWorkspace((next) => {
        if (
          next.bindings[key]?.id !== binding.id ||
          next.bindings[key]?.revision !== binding.revision
        )
          return next;
        return {
          ...next,
          files:
            next.files[key] === source
              ? { ...next.files, [key]: doc.source }
              : next.files,
          saved: { ...next.saved, [key]: doc.source },
          bindings: {
            ...next.bindings,
            [key]: { ...binding, revision: doc.revision },
          },
        };
      });
      setFileNotice({ key, source: doc.source, text: 'Reopened from disk.' });
    });
  }
  async function close() {
    await operation(async () => {
      const state = current.current,
        key = state.selected,
        source = state.files[key];
      if (Object.keys(state.files).length === 1)
        throw Error('Keep at least one source open.');
      if (
        source !== state.saved[key] &&
        !(native
          ? await nativeDocuments.confirmDiscard()
          : window.confirm('Discard unsaved changes to this source?'))
      )
        return;
      if (current.current.files[key] !== source)
        throw Error('Source changed while confirming; close again.');
      const binding = state.bindings[key];
      if (binding) await nativeDocuments.close(binding.id);
      // Input remains usable during IPC. A released native grant must not cause
      // later editor input to be discarded; retain it as an unbound buffer.
      setWorkspace((next) => {
        if (next.files[key] === source) return removeDocument(next, key);
        const bindings = { ...next.bindings };
        delete bindings[key];
        return { ...next, bindings };
      });
    });
  }
  function select(key: string) {
    if (!allowDocumentOperation()) return;
    setWorkspace((next) =>
      Object.hasOwn(next.files, key)
        ? {
            ...next,
            selected: key,
            entry: isMdxSource(key) ? key : next.entry,
          }
        : next,
    );
  }
  function change(source: string) {
    const key = workspace.selected;
    // A queued callback stays bound to its original file, even after selection
    // changes. Retain that edit without touching the newly selected document.
    if (!Object.hasOwn(current.current.files, key)) return;
    // Descendant layout effects refresh rendered history before this hook's
    // layout effect runs. Publish the accepted bytes now, so that refresh can
    // validate the new source without accepting an obsolete rendered snapshot.
    // Keep the state update functional to preserve queued save/binding changes.
    current.current = {
      ...current.current,
      files: { ...current.current.files, [key]: source },
    };
    setWorkspace((next) =>
      key in next.files
        ? {
            ...next,
            files: { ...next.files, [key]: source },
          }
        : next,
    );
  }
  function isCurrentSource(key: string, source: string) {
    return current.current.files[key] === source;
  }
  async function retainVisualAttempt(
    key: string,
    baseline: string,
    source: string,
  ) {
    if (!native || !Object.hasOwn(current.current.files, key))
      throw Error('The desktop source is unavailable.');
    const attempt: VisualRecovery = {
      key,
      documentId: crypto.randomUUID().replaceAll('-', ''),
      name: current.current.bindings[key]?.name ?? key.split('/').pop()!,
      baseline,
      source,
    };
    visualRecovery.current = attempt;
    await saveVisualRecovery(attempt);
  }
  async function resolveVisualAttempt(key: string, discard: boolean) {
    const attempt = visualRecovery.current;
    if (!attempt || attempt.key !== key)
      throw Error('This recovery copy is unavailable.');
    if (discard) {
      const written = attempt.writing
        ? await attempt.writing.catch(() => attempt.written)
        : attempt.written;
      if (written) await nativeDocuments.deleteSnapshot(written.snapshot.file);
    } else await saveVisualRecovery(attempt);
    if (visualRecovery.current === attempt) visualRecovery.current = null;
  }
  return {
    workspace,
    native,
    busy,
    dirty,
    selectedDirty:
      workspace.files[workspace.selected] !==
      workspace.saved[workspace.selected],
    otherDirtyCount: Object.keys(workspace.files).filter(
      (key) =>
        key !== workspace.selected &&
        workspace.files[key] !== workspace.saved[key],
    ).length,
    fileError,
    fileNotice:
      fileNotice?.key === workspace.selected &&
      fileNotice.source === workspace.files[workspace.selected]
        ? fileNotice.text
        : '',
    notesFolder,
    openNative,
    openFolder,
    newNote,
    openBrowser,
    restoreBrowserDraft,
    nativeDraft,
    restoreNativeVersion,
    save,
    reopen,
    close,
    select,
    change,
    isCurrentSource,
    retainVisualAttempt,
    resolveVisualAttempt,
  };
}
