import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';
import { isTauri } from '@tauri-apps/api/core';
import { nativeDocuments } from './native';
import {
  addDocuments,
  completeSave,
  initialWorkspace,
  isDirty,
  removeDocument,
  validateFiles,
  createNote,
  type Workspace,
} from './workspace';
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
  async function openNative() {
    await operation(async () => {
      const docs = await nativeDocuments.open();
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
    });
  }
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
      const docs = [];
      for (const file of Array.from(list)) {
        if (file.size > 500000) throw Error('File exceeds 500 KB limit.');
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
    setWorkspace((next) => ({
      ...next,
      selected: key,
      entry: /\.mdx?$/.test(key) ? key : next.entry,
    }));
  }
  function change(source: string) {
    const key = workspace.selected;
    setWorkspace((next) =>
      key in next.files
        ? {
            ...next,
            files: { ...next.files, [key]: source },
          }
        : next,
    );
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
    openNative,
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
  };
}
