import { isMdxSource } from './sourceTypes';
import { RecoveryHistory } from './documents/RecoveryHistory';
import { BrowserDraft } from './documents/BrowserDraft';
import { isTauri, invoke } from '@tauri-apps/api/core';
import { enqueueNativeOperation } from './preview/native-operations';
import { NativePreview } from './preview/NativePreview';
import CompilerWorker from './compiler/compiler.worker?worker&inline';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import {
  lazy,
  Suspense,
  useContext,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { flushSync } from 'react-dom';
import { useDocuments } from './documents/useDocuments';
import { nativeDocuments } from './documents/native';
import { NativeSettings } from './desktop/NativeSettings';
import { NotificationContext } from './ui/useNotifications';

const NativeWorkspaceShell = lazy(() =>
  import('./desktop/NativeWorkspaceShell').then((module) => ({
    default: module.NativeWorkspaceShell,
  })),
);
const NATIVE_WELCOME =
  "Your notes, with room to think.\n\nWrite Markdown, add mathematics, or turn an idea into a small React experiment.\n\n## Start here\n\n- Open your notes folder from the sidebar.\n- Write directly in **Preview**, or use **Source** for the original MDX.\n- Save to a real local file with **Ctrl/Cmd + S**. New notes use Save As.\n- Recovery copies are available in Settings and never silently replace your files.\n\n## A little mathematics\n\nFor a differentiable function $f$, the derivative measures local change:\n\n$$\nf'(x) = \\lim_{h \\to 0} \\frac{f(x+h)-f(x)}{h}.\n$$\n\nReact components run in the isolated native preview when you choose Split.\n";
import { desktopUpdates } from './desktop/updates';
import type { RenderedRuntimeContext } from './editor/rendered/RenderedRuntime';
import { compilerFiles, validateFiles, MAX_FILES } from './documents/workspace';
import counter from '../docs/handoff/samples/fixtures/counter.mdx?raw';
import imported from '../docs/handoff/samples/fixtures/widgets/ImportedCounter.tsx?raw';
import {
  SourceEditor,
  type EditorCommands,
  type EditorHistory,
} from './editor/SourceEditor';
import { Preview } from './preview/Preview';
import { previewDocument } from './preview/document';

let wasm: Promise<WebAssembly.Module> | undefined;
const NATIVE_LITERAL_PREVIEW: Pick<
  RenderedRuntimeContext,
  'stopped' | 'theme' | 'images' | 'corePlugins' | 'showComponentSource'
> = {
  stopped: true,
  theme: 'light',
  images: [],
  corePlugins: { react: false },
  showComponentSource: false,
};
function compilerModule() {
  return (wasm ??= WebAssembly.compileStreaming(fetch(wasmURL)).catch(
    (error: unknown) => {
      wasm = undefined;
      throw error;
    },
  ));
}

export function App() {
  const [pendingVisual, setPendingVisual] = useState(false);
  const documents = useDocuments(
    isTauri()
      ? { 'note.mdx': NATIVE_WELCOME }
      : { 'note.mdx': counter, 'widgets/ImportedCounter.tsx': imported },
    'note.mdx',
    pendingVisual,
  );
  const { files, entry, selected, groups } = documents.workspace;
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [updateLock, setUpdateLock] = useState<
    'installing' | 'installed' | 'unconfirmed' | null
  >(null);
  const installingUpdate = updateLock !== null;
  const restartRequired =
    updateLock === 'installed' || updateLock === 'unconfirmed';
  const [sourceComposing, setSourceComposing] = useState(false);
  const documentActionsBlocked =
    documents.busy || pendingVisual || installingUpdate;
  const canInstallUpdate =
    !documentActionsBlocked && !documents.dirty && !sourceComposing;
  const updateReadiness = useRef({
    dirty: documents.dirty,
    busy: documents.busy,
    pending: pendingVisual || sourceComposing,
  });
  useLayoutEffect(() => {
    updateReadiness.current = {
      dirty: documents.dirty,
      busy: documents.busy,
      pending: pendingVisual || sourceComposing,
    };
  }, [documents.dirty, documents.busy, pendingVisual, sourceComposing]);
  async function installDesktopUpdate(id: string) {
    const blocked =
      'Save all sources and finish pending edits before installing.';
    if (!canInstallUpdate) throw Error(blocked);
    // Commit the read-only SourceEditor state before handing native authority to
    // the updater. A queued editor change must reach the readiness check first.
    flushSync(() => setUpdateLock('installing'));
    try {
      const { dirty, busy, pending } = updateReadiness.current;
      if (dirty || busy || pending) throw Error(blocked);
      await nativeDocuments.dirty(dirty, busy);
      const result = await desktopUpdates.install(id);
      if (result.state !== 'cancelled') setUpdateLock(result.state);
      return result;
    } finally {
      setUpdateLock((state) => (state === 'installing' ? null : state));
    }
  }
  const [mode, setMode] = useState<'source' | 'split' | 'visual'>(
    isTauri() ? 'visual' : 'split',
  );
  const workspaceMode =
    mode === 'visual' && !isMdxSource(selected) ? 'source' : mode;
  const nativeLiteral = documents.native && isMdxSource(selected);
  const editorCommands = useRef<EditorCommands>(null);
  const histories = useRef<EditorHistory>(new Map());
  useEffect(() => {
    for (const key of histories.current.keys()) {
      if (!Object.hasOwn(files, key)) histories.current.delete(key);
    }
  }, [files]);
  const buildFiles = useMemo(
    () => compilerFiles({ files, entry, groups }),
    [files, entry, groups],
  );
  const recoveryCandidates = useMemo(
    () =>
      Object.keys(files)
        .filter((key) => files[key] !== documents.workspace.saved[key])
        .map((key) => ({
          documentKey: key,
          name:
            documents.workspace.bindings[key]?.name || key.split('/').pop()!,
          source: files[key]!,
          baseline: documents.workspace.saved[key],
          displayPath: documents.workspace.bindings[key]?.displayPath,
        })),
    [files, documents.workspace.saved, documents.workspace.bindings],
  );
  const [recoveryHealth, setRecoveryHealth] = useState({
    message: '',
    error: false,
  });
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
  const [locations, setLocations] = useState<
    {
      file: string;
      line: number;
      offset: number;
      source: string;
    }[]
  >([]);
  const pendingLocation = useRef<
    | { file: string; offset: number; source: string }
    | { newNote: true; offset: 0; source: '' }
    | null
  >(null);
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    const target = pendingLocation.current;
    pendingLocation.current = null;
    if (target && ('newNote' in target || target.file === selected))
      editorCommands.current?.revealSource(target.offset, target.source);
  }, [navigation, selected, workspaceMode]);
  const [status, setStatus] = useState('Waiting');
  const [stopped, setStopped] = useState(isTauri());
  const [revision, setRevision] = useState(0);
  const stopIntent = useRef<object | undefined>(undefined);
  const observeNativeStop = useCallback((completion: Promise<void>) => {
    const intent = stopIntent.current;
    if (!intent) return false;
    function settled(error?: string) {
      // Only this user request owns feedback, even across retries and rebuilding.
      if (stopIntent.current !== intent) return;
      setStatus(error ? 'Preview stop failed' : 'Preview stopped');
      if (error) setError(error);
      else
        setError((current) =>
          current.startsWith('Native stop failed:') ? '' : current,
        );
    }
    void completion.then(
      () => settled(),
      (error) => settled(`Native stop failed: ${String(error).slice(0, 2000)}`),
    );
    return true;
  }, []);

  useEffect(() => {
    if (stopped) return;
    let active = true;
    let worker: Worker | undefined;
    queueMicrotask(() => {
      if (active) {
        setHtml('');
        setError('');
        setLocations([]);
        setStatus('Compiling');
      }
    });
    const timeout = setTimeout(() => {
      worker?.terminate();
      if (active) {
        active = false;
        setStatus('Build timed out');
        setError('Compilation exceeded 15 seconds; source retained.');
      }
    }, 15000);
    const timer = setTimeout(async () => {
      try {
        validateFiles(buildFiles);
      } catch (error) {
        clearTimeout(timeout);
        if (active) {
          setStatus('Build blocked');
          setError(String(error));
        }
        return;
      }

      let wasmModule: WebAssembly.Module;
      try {
        wasmModule = await compilerModule();
      } catch (error) {
        clearTimeout(timeout);
        if (active) {
          setError(String(error));
          setStatus('Build failed');
        }
        return;
      }
      if (!active) return;
      worker = new CompilerWorker();
      worker.onerror = (e) => {
        if (active) {
          setError(e.message);
          setStatus('Build failed');
          clearTimeout(timeout);
        }
      };
      worker.onmessage = async (event) => {
        if (!active) return;
        clearTimeout(timeout);
        const result = event.data as {
          id: number;
          code?: string;
          error?: string;
          locations?: { file: string; line: number; offset: number }[];
        };
        if (result.error) {
          setError(result.error);
          setLocations(
            (result.locations ?? [])
              .filter((location) => Object.hasOwn(buildFiles, location.file))
              .map((location) => ({
                ...location,
                source: buildFiles[location.file]!,
              })),
          );
          setStatus('Build failed');
        } else if (result.code) {
          const document = await previewDocument(result.code);
          if (active) {
            setHtml(document);
            setStatus(isTauri() ? 'Compiled MDX' : 'Preview ready');
          }
        }
        worker?.terminate();
      };
      worker.postMessage({
        id: revision,
        files: buildFiles,
        entry,
        wasmModule,
        ...(isTauri() ? { webMode: true } : {}),
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [buildFiles, entry, revision, stopped]);
  const notices = useContext(NotificationContext);
  useEffect(() => {
    if (!documents.native || !notices) return;
    const message = documents.fileError || error;
    if (message)
      notices.notify({
        id: 'native-document-error',
        message,
        tone: 'error',
        persistent: true,
      });
    else notices.dismiss('native-document-error');
  }, [documents.native, documents.fileError, error, notices]);
  const editorSurface = (
    <div
      className={`workspace mode-${workspaceMode}${documents.native && workspaceMode !== 'visual' ? ' web-source-panel' : ''}`}
      onCompositionStartCapture={() => setSourceComposing(true)}
      onCompositionEndCapture={() => setSourceComposing(false)}
    >
      <SourceEditor
        busy={documents.busy || installingUpdate}
        readOnly={installingUpdate}
        onPendingChange={setPendingVisual}
        onShowSource={(offset, snapshot) => {
          if (documentActionsBlocked || files[selected] !== snapshot) return;
          pendingLocation.current = {
            file: selected,
            offset,
            source: snapshot,
          };
          setMode('source');
          setNavigation((value) => value + 1);
        }}
        visual={workspaceMode === 'visual' && !documents.native}
        rendered={
          nativeLiteral
            ? {
                ...NATIVE_LITERAL_PREVIEW,
                active: workspaceMode === 'visual',
                files,
                entry: selected,
              }
            : undefined
        }
        sourceIsCurrent={
          nativeLiteral
            ? (source) => documents.isCurrentSource(selected, source)
            : undefined
        }
        onRetainAttempt={
          nativeLiteral
            ? (base, source) =>
                documents.retainVisualAttempt(selected, base, source)
            : undefined
        }
        onKeepAttempt={
          nativeLiteral
            ? () => documents.resolveVisualAttempt(selected, false)
            : undefined
        }
        onDiscardAttempt={
          nativeLiteral
            ? () => documents.resolveVisualAttempt(selected, true)
            : undefined
        }
        commandsRef={editorCommands}
        key={selected}
        documentKey={selected}
        histories={histories}
        source={files[selected]!}
        onChange={documents.change}
      />
      <div className="preview-pane" hidden={workspaceMode !== 'split'}>
        <div className="pane-title">Live React preview</div>
        {html &&
          (isTauri() ? (
            workspaceMode === 'split' && (
              <NativePreview
                html={html}
                onError={setError}
                onStop={observeNativeStop}
              />
            )
          ) : (
            <Preview html={html} onError={setError} />
          ))}
      </div>
    </div>
  );
  if (documents.native) {
    const documentStatus =
      updateLock === 'unconfirmed'
        ? 'Update result unconfirmed. Check the system installer before reopening.'
        : restartRequired
          ? 'Close and reopen Programmable Notes to resume editing.'
          : installingUpdate
            ? 'Update in progress. Editing is paused.'
            : documents.busy
              ? 'File operation in progress'
              : pendingVisual
                ? 'Unapplied visual edit'
                : documents.selectedDirty
                  ? 'Unsaved changes'
                  : documents.fileNotice || 'Saved source unchanged';
    const selectedName =
      documents.workspace.bindings[selected]?.name ||
      selected.replace(/^opened-\d+\//, '');
    return (
      <div
        style={{ height: '100%' }}
        onKeyDown={(event) => {
          if (settingsOpen || event.nativeEvent.isComposing || event.repeat)
            return;
          if (
            (event.ctrlKey || event.metaKey) &&
            !event.altKey &&
            event.key.toLowerCase() === 's'
          ) {
            event.preventDefault();
            if (event.nativeEvent.isTrusted && !documentActionsBlocked)
              void documents.save(event.shiftKey);
          }
        }}
      >
        <Suspense
          fallback={<p className="boot-message">Opening your workspace…</p>}
        >
          <NativeWorkspaceShell
            documents={Object.keys(files).map((key) => ({
              key,
              name:
                documents.workspace.bindings[key]?.name ||
                key.replace(/^opened-\d+\//, ''),
              source: files[key]!,
              dirty: files[key] !== documents.workspace.saved[key],
            }))}
            selected={selected}
            title={
              selected === 'note.mdx' && !documents.workspace.bindings[selected]
                ? 'Welcome'
                : selectedName.replace(/\.(mdx?|tsx?|jsx?)$/i, '')
            }
            mode={workspaceMode}
            canVisual={isMdxSource(selected)}
            disabled={documentActionsBlocked}
            saving={documents.busy}
            dirty={documents.selectedDirty}
            folderLabel={documents.notesFolder || undefined}
            onSelect={documents.select}
            onModeChange={(next) => {
              if (documentActionsBlocked) return;
              setMode(next);
              stopIntent.current = undefined;
              setStopped(next !== 'split');
              if (next === 'split') setRevision((value) => value + 1);
              else setHtml('');
            }}
            onNew={() => {
              documents.newNote();
              setError('');
              setLocations([]);
              setMode('visual');
              setStopped(true);
              setHtml('');
            }}
            onOpenFiles={() => void documents.openNative()}
            onOpenFolder={() => void documents.openFolder()}
            onSave={() => void documents.save()}
            onSaveAs={() => void documents.save(true)}
            onSettings={() => setSettingsOpen(true)}
            onUndo={() => editorCommands.current?.undo()}
            onRedo={() => editorCommands.current?.redo()}
            onReopen={() => void documents.reopen()}
            onClose={() => void documents.close()}
            onStopPreview={() => {
              stopIntent.current = {};
              setHtml('');
              setStopped(true);
              setStatus('Stopping preview');
              if (!html || workspaceMode !== 'split')
                observeNativeStop(
                  enqueueNativeOperation(() => invoke<void>('stop_preview')),
                );
            }}
            onRebuildPreview={() => {
              stopIntent.current = undefined;
              setStopped(false);
              setRevision((value) => value + 1);
            }}
            status={
              <>
                <span role="status" aria-label="Document status">
                  {workspaceMode === 'split' ? status + ' · ' : ''}
                  {documentStatus}
                </span>
                {!notices && (documents.fileError || error) && (
                  <span role="alert">{documents.fileError || error}</span>
                )}
              </>
            }
            settings={
              <NativeSettings
                open={settingsOpen}
                onClose={() => setSettingsOpen(false)}
                notesFolder={documents.notesFolder}
                canOpenFolder={!documentActionsBlocked}
                onOpenFolder={documents.openFolder}
                canInstall={canInstallUpdate}
                restartRequired={restartRequired}
                onInstall={installDesktopUpdate}
              >
                <section aria-label="Native recovery">
                  <h3>Recovery</h3>
                  {recoveryHealth.message && (
                    <p
                      aria-label="Recovery status"
                      role={recoveryHealth.error ? 'alert' : undefined}
                    >
                      {recoveryHealth.message}
                    </p>
                  )}
                  <RecoveryHistory
                    unappliedEdit={pendingVisual}
                    candidates={recoveryCandidates}
                    onHealth={setRecoveryHealth}
                    documentKey={selected}
                    name={
                      documents.workspace.bindings[selected]?.name ||
                      selected.split('/').pop()!
                    }
                    source={files[selected]!}
                    baseline={documents.workspace.saved[selected]}
                    displayPath={
                      documents.workspace.bindings[selected]?.displayPath
                    }
                    busy={documents.busy || installingUpdate}
                    restore={documents.restoreNativeVersion}
                  />
                  <details>
                    <summary>Legacy recovery copy</summary>
                    <button
                      disabled={
                        documentActionsBlocked || !isMdxSource(selected)
                      }
                      onClick={() => void documents.nativeDraft('keep')}
                    >
                      Keep recovery draft
                    </button>
                    <button
                      disabled={documentActionsBlocked}
                      onClick={() => void documents.nativeDraft('restore')}
                    >
                      Restore as unsaved document
                    </button>
                    <button
                      disabled={documentActionsBlocked}
                      onClick={() => void documents.nativeDraft('delete')}
                    >
                      Delete recovery draft
                    </button>
                  </details>
                  {locations.map((location, index) => (
                    <button
                      key={index}
                      disabled={
                        documentActionsBlocked ||
                        files[location.file] !== location.source
                      }
                      onClick={() => {
                        if (files[location.file] !== location.source) return;
                        pendingLocation.current = location;
                        documents.select(location.file);
                        setMode('source');
                        setNavigation((value) => value + 1);
                        setSettingsOpen(false);
                      }}
                    >
                      Open {location.file.replace(/^opened-\d+\//, '')} at line{' '}
                      {location.line}
                    </button>
                  ))}
                </section>
              </NativeSettings>
            }
          >
            {editorSurface}
          </NativeWorkspaceShell>
        </Suspense>
      </div>
    );
  }
  return (
    <main
      onKeyDown={(event) => {
        if (settingsOpen) return;
        const target = event.target as HTMLElement;
        if (
          (event.ctrlKey || event.metaKey) &&
          !event.altKey &&
          event.key.toLowerCase() === 's'
        ) {
          event.preventDefault();
          if (
            !event.nativeEvent.isTrusted ||
            event.nativeEvent.isComposing ||
            event.repeat ||
            documentActionsBlocked
          )
            return;
          void documents.save(event.shiftKey);
          return;
        }
        if (
          (event.ctrlKey || event.metaKey) &&
          event.key.toLowerCase() === 'z' &&
          !target.closest('input,textarea,[contenteditable="true"]')
        ) {
          event.preventDefault();
          if (event.shiftKey) editorCommands.current?.redo();
          else editorCommands.current?.undo();
        }
      }}
    >
      <header className="app-header">
        <h1>Programmable Notes</h1>
        {documents.native && (
          <div className="native-header-actions">
            <button
              type="button"
              disabled={documentActionsBlocked}
              onClick={() => void documents.openFolder()}
            >
              Open notes folder
            </button>
            <button
              type="button"
              aria-haspopup="dialog"
              onClick={() => setSettingsOpen(true)}
            >
              Settings
            </button>
          </div>
        )}
      </header>
      {documents.native && (
        <NativeSettings
          open={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          notesFolder={documents.notesFolder}
          canOpenFolder={!documentActionsBlocked}
          onOpenFolder={documents.openFolder}
          canInstall={canInstallUpdate}
          restartRequired={restartRequired}
          onInstall={installDesktopUpdate}
        />
      )}
      {documents.native && (
        <p className="native-note" role="note">
          Experimental Linux desktop preview. Native isolation is validated on
          the documented Linux stack; production security review remains
          limited. Use trusted documents while desktop testing continues.
        </p>
      )}
      <nav aria-label="Document actions">
        <button
          disabled={
            documentActionsBlocked || Object.keys(files).length >= MAX_FILES
          }
          title={
            Object.keys(files).length >= MAX_FILES
              ? 'Close a source before creating another note (32-file limit).'
              : undefined
          }
          onClick={() => {
            documents.newNote();
            setError('');
            setLocations([]);
            pendingLocation.current = { newNote: true, offset: 0, source: '' };
            setMode('source');
            setNavigation((value) => value + 1);
          }}
        >
          New note
        </button>
        {documents.native ? (
          <button
            disabled={documentActionsBlocked}
            onClick={() => void documents.openNative()}
          >
            Open files
          </button>
        ) : (
          <label className="file-open">
            Open files{' '}
            <input
              aria-label="Open files"
              type="file"
              multiple
              accept=".md,.mdx,.tsx,.ts,.jsx,.js"
              disabled={documentActionsBlocked}
              onChange={(event) =>
                void documents.openBrowser(event.target.files)
              }
            />
          </label>
        )}
        <button
          disabled={documentActionsBlocked}
          aria-keyshortcuts="Control+s Meta+s"
          title="Save source (Ctrl/Cmd+S)"
          onClick={() => void documents.save()}
        >
          Save source
        </button>
        {documents.native && (
          <>
            <button
              disabled={documentActionsBlocked}
              aria-keyshortcuts="Control+Shift+s Meta+Shift+s"
              title="Save As (Ctrl/Cmd+Shift+S)"
              onClick={() => void documents.save(true)}
            >
              Save As
            </button>
            <button
              disabled={
                documentActionsBlocked ||
                !documents.workspace.bindings[selected]
              }
              onClick={() => void documents.reopen()}
            >
              Reopen source
            </button>
          </>
        )}
        <button
          disabled={documentActionsBlocked}
          onClick={() => void documents.close()}
        >
          Close source
        </button>
        <button
          disabled={installingUpdate}
          onClick={() => {
            stopIntent.current = {};
            setHtml('');
            setStopped(true);
            if (isTauri()) {
              setStatus('Stopping preview');
              // A mounted artifact stops through its existing cleanup exactly once.
              // After removal, a new user click is an explicit, serialized retry.
              if (!html || workspaceMode !== 'split')
                observeNativeStop(
                  enqueueNativeOperation(() => invoke<void>('stop_preview')),
                );
            } else setStatus('Preview stopped');
          }}
        >
          Stop preview
        </button>
        <button
          disabled={documentActionsBlocked}
          onClick={() => {
            stopIntent.current = undefined;
            setStopped(false);
            setRevision((n) => n + 1);
          }}
        >
          Rebuild preview
        </button>
      </nav>
      <div className="document-bar">
        <label className="source-picker">
          Source file{' '}
          <select
            aria-label="Source file"
            value={selected}
            disabled={pendingVisual || installingUpdate}
            onChange={(e) => documents.select(e.target.value)}
          >
            {Object.keys(files).map((path, index) => {
              const name = documents.workspace.bindings[path]?.name;
              const relative = path.replace(/^opened-\d+\//, '');
              const label =
                name && !relative.endsWith('/' + name) ? name : relative;
              return (
                <option key={path} value={path}>
                  {index + 1}. {label}
                  {files[path] !== documents.workspace.saved[path] ? ' •' : ''}
                </option>
              );
            })}
          </select>
        </label>
        <div className="mode-picker" role="group" aria-label="Workspace mode">
          {(['source', 'split', 'visual'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={workspaceMode === value}
              disabled={
                installingUpdate ||
                (documents.native && pendingVisual) ||
                (value === 'visual' && !isMdxSource(selected))
              }
              onClick={() => setMode(value)}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Edit history">
          <button
            disabled={documentActionsBlocked}
            onClick={() => editorCommands.current?.undo()}
          >
            Undo
          </button>
          <button
            disabled={documentActionsBlocked}
            onClick={() => editorCommands.current?.redo()}
          >
            Redo
          </button>
        </div>
      </div>
      <p className="build-status" role="status">
        {status}
      </p>
      {documents.native && documents.workspace.bindings[selected] && (
        <p aria-label="Native document">
          File: {documents.workspace.bindings[selected]!.displayPath}
        </p>
      )}
      <p aria-label="Document status" aria-live="polite">
        {updateLock === 'unconfirmed'
          ? 'Update result unconfirmed. Check the system installer before reopening.'
          : restartRequired
            ? 'Close and reopen Programmable Notes to resume editing.'
            : installingUpdate
              ? 'Update in progress. Editing is paused.'
              : documents.busy
                ? 'File operation in progress'
                : pendingVisual
                  ? 'Unapplied visual edit'
                  : documents.selectedDirty
                    ? 'Unsaved changes'
                    : documents.fileNotice || 'Source unchanged'}
      </p>
      {documents.otherDirtyCount > 0 && (
        <p aria-label="Workspace status" aria-live="polite">
          {documents.otherDirtyCount} other{' '}
          {documents.otherDirtyCount === 1 ? 'source has' : 'sources have'}{' '}
          unsaved changes.
        </p>
      )}
      {pendingVisual && (
        <p role="note">
          {documents.native
            ? 'Finish the current Visual edit before saving or changing documents.'
            : 'Visual text has not been applied. In Visual mode, press Enter to apply or Escape to cancel before saving or changing documents. Apply it to include it in saved source and recovery.'}
        </p>
      )}
      {documents.native && workspaceMode === 'visual' && (
        <p className="native-visual-note">
          React components run in the separate preview window in Split mode. Use
          Source to edit their code.
        </p>
      )}
      {documents.fileError && (
        <pre role="alert" data-file-error>
          {documents.fileError}
        </pre>
      )}
      {error && <pre role="alert">{error}</pre>}
      {locations.map((location, index) => (
        <button
          key={`${location.file}:${location.line}:${index}`}
          disabled={
            documentActionsBlocked || files[location.file] !== location.source
          }
          onClick={() => {
            if (files[location.file] !== location.source) return;
            pendingLocation.current = location;
            documents.select(location.file);
            setMode('source');
            setNavigation((value) => value + 1);
          }}
        >
          Open {location.file.replace(/^opened-\d+\//, '')} at line{' '}
          {location.line}
        </button>
      ))}
      {documents.native && recoveryHealth.message && (
        <p
          aria-label="Recovery status"
          role={recoveryHealth.error ? 'alert' : undefined}
        >
          {recoveryHealth.message}
        </p>
      )}
      {documents.native && (
        <details>
          <summary>Recovery draft</summary>
          <RecoveryHistory
            unappliedEdit={pendingVisual}
            candidates={recoveryCandidates}
            onHealth={setRecoveryHealth}
            documentKey={selected}
            name={
              documents.workspace.bindings[selected]?.name ||
              selected.split('/').pop()!
            }
            source={files[selected]!}
            baseline={documents.workspace.saved[selected]}
            displayPath={documents.workspace.bindings[selected]?.displayPath}
            busy={documents.busy || installingUpdate}
            restore={documents.restoreNativeVersion}
          />
          <p>Legacy single-copy controls (kept for migration):</p>
          <button
            disabled={documentActionsBlocked || !isMdxSource(selected)}
            onClick={() => void documents.nativeDraft('keep')}
          >
            Keep recovery draft
          </button>
          <button
            disabled={documentActionsBlocked}
            onClick={() => void documents.nativeDraft('restore')}
          >
            Restore as unsaved document
          </button>
          <button
            disabled={documentActionsBlocked}
            onClick={() => void documents.nativeDraft('delete')}
          >
            Delete recovery draft
          </button>
        </details>
      )}
      {!documents.native && (
        <BrowserDraft
          documentKey={selected}
          name={selected.split('/').pop()!}
          source={files[selected]!}
          busy={documentActionsBlocked}
          restore={documents.restoreBrowserDraft}
        />
      )}
      {editorSurface}
    </main>
  );
}
