import { RecoveryHistory } from './documents/RecoveryHistory';
import { BrowserDraft } from './documents/BrowserDraft';
import { isTauri } from '@tauri-apps/api/core';
import { NativePreview } from './preview/NativePreview';
import CompilerWorker from './compiler/compiler.worker?worker&inline';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocuments } from './documents/useDocuments';
import { compilerFiles, validateFiles } from './documents/workspace';
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
function compilerModule() {
  return (wasm ??= WebAssembly.compileStreaming(fetch(wasmURL)).catch(
    (error: unknown) => {
      wasm = undefined;
      throw error;
    },
  ));
}

export function App() {
  const documents = useDocuments(
    { 'note.mdx': counter, 'widgets/ImportedCounter.tsx': imported },
    'note.mdx',
  );
  const { files, entry, selected, groups } = documents.workspace;
  const [mode, setMode] = useState<'source' | 'split' | 'visual'>('split');
  const workspaceMode =
    mode === 'visual' && !/\.mdx?$/.test(selected) ? 'source' : mode;
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
  const pendingLocation = useRef<{ offset: number; source: string } | null>(
    null,
  );
  const [navigation, setNavigation] = useState(0);
  useEffect(() => {
    const target = pendingLocation.current;
    pendingLocation.current = null;
    if (target)
      editorCommands.current?.revealSource(target.offset, target.source);
  }, [navigation, selected, workspaceMode]);
  const [status, setStatus] = useState('Waiting');
  const [stopped, setStopped] = useState(false);
  const [revision, setRevision] = useState(0);
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
            setStatus(
              isTauri()
                ? 'Compiled — requesting isolated native preview'
                : 'Preview ready',
            );
          }
        }
        worker?.terminate();
      };
      worker.postMessage({
        id: revision,
        files: buildFiles,
        entry,
        wasmModule,
      });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [buildFiles, entry, revision, stopped]);
  return (
    <main
      onKeyDown={(event) => {
        const target = event.target as HTMLElement;
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
      </header>
      {documents.native && (
        <p className="native-note" role="note">
          Experimental Linux desktop preview. Native isolation is validated on
          the documented Linux stack; production security review remains
          limited. Use trusted documents while desktop testing continues.
        </p>
      )}
      <nav aria-label="Document actions">
        {documents.native ? (
          <button
            disabled={documents.busy}
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
              disabled={documents.busy}
              onChange={(event) =>
                void documents.openBrowser(event.target.files)
              }
            />
          </label>
        )}
        <button disabled={documents.busy} onClick={() => void documents.save()}>
          Save source
        </button>
        {documents.native && (
          <>
            <button
              disabled={documents.busy}
              onClick={() => void documents.save(true)}
            >
              Save As
            </button>
            <button
              disabled={
                documents.busy || !documents.workspace.bindings[selected]
              }
              onClick={() => void documents.reopen()}
            >
              Reopen source
            </button>
          </>
        )}
        <button
          disabled={documents.busy}
          onClick={() => void documents.close()}
        >
          Close source
        </button>
        <button
          onClick={() => {
            setHtml('');
            setStatus('Preview stopped');
            setStopped(true);
          }}
        >
          Stop preview
        </button>
        <button
          onClick={() => {
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
            onChange={(e) => documents.select(e.target.value)}
          >
            {Object.keys(files).map((path) => (
              <option key={path} value={path}>
                {documents.workspace.bindings[path]?.name ||
                  path.replace(/^opened-\d+\//, '')}
                {files[path] !== documents.workspace.saved[path] ? ' •' : ''}
              </option>
            ))}
          </select>
        </label>
        <div className="mode-picker" role="group" aria-label="Workspace mode">
          {(['source', 'split', 'visual'] as const).map((value) => (
            <button
              key={value}
              aria-pressed={workspaceMode === value}
              disabled={value === 'visual' && !/\.mdx?$/.test(selected)}
              onClick={() => setMode(value)}
            >
              {value[0]!.toUpperCase() + value.slice(1)}
            </button>
          ))}
        </div>
        <div role="group" aria-label="Edit history">
          <button onClick={() => editorCommands.current?.undo()}>Undo</button>
          <button onClick={() => editorCommands.current?.redo()}>Redo</button>
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
        {documents.busy
          ? 'File operation in progress'
          : documents.dirty
            ? 'Unsaved changes'
            : documents.fileNotice || 'Source unchanged'}
      </p>
      {documents.fileError && (
        <pre role="alert" data-file-error>
          {documents.fileError}
        </pre>
      )}
      {error && <pre role="alert">{error}</pre>}
      {locations.map((location, index) => (
        <button
          key={`${location.file}:${location.line}:${index}`}
          disabled={documents.busy || files[location.file] !== location.source}
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
            busy={documents.busy}
            restore={documents.restoreNativeVersion}
          />
          <p>Legacy single-copy controls (kept for migration):</p>
          <button
            disabled={documents.busy || !/\.mdx?$/.test(selected)}
            onClick={() => void documents.nativeDraft('keep')}
          >
            Keep recovery draft
          </button>
          <button
            disabled={documents.busy}
            onClick={() => void documents.nativeDraft('restore')}
          >
            Restore as unsaved document
          </button>
          <button
            disabled={documents.busy}
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
          busy={documents.busy}
          restore={documents.restoreBrowserDraft}
        />
      )}
      <div className={`workspace mode-${workspaceMode}`}>
        <SourceEditor
          visual={workspaceMode === 'visual'}
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
              <NativePreview html={html} onError={setError} />
            ) : (
              <Preview html={html} onError={setError} />
            ))}
        </div>
      </div>
    </main>
  );
}
