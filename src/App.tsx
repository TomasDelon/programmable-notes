import { isTauri } from '@tauri-apps/api/core';
import { NativePreview } from './preview/NativePreview';
import CompilerWorker from './compiler/compiler.worker?worker&inline';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useDocuments } from './documents/useDocuments';
import { compilerFiles, validateFiles } from './documents/workspace';
import counter from '../docs/handoff/samples/fixtures/counter.mdx?raw';
import imported from '../docs/handoff/samples/fixtures/widgets/ImportedCounter.tsx?raw';
import { SourceEditor, type EditorHistory } from './editor/SourceEditor';
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
  const [html, setHtml] = useState('');
  const [error, setError] = useState('');
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
        };
        if (result.error) {
          setError(result.error);
          setStatus('Build failed');
        } else if (result.code) {
          const document = await previewDocument(result.code);
          if (active) {
            setHtml(document);
            setStatus(
              isTauri()
                ? 'Compiled — requesting isolated native preview'
                : 'Preview loaded — state resets on edits',
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
    <main>
      <h1>Programmable Notes</h1>
      <p role="note">
        Experimental Linux desktop preview. Native isolation is validated on the
        documented Linux stack; production security review remains limited. Use
        trusted documents while desktop testing continues.
      </p>
      <nav>
        {documents.native ? (
          <button
            disabled={documents.busy}
            onClick={() => void documents.openNative()}
          >
            Open files
          </button>
        ) : (
          <label>
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
      <label>
        Source file{' '}
        <select
          aria-label="Source file"
          value={selected}
          onChange={(e) => documents.select(e.target.value)}
        >
          {Object.keys(files).map((path) => (
            <option key={path} value={path}>
              {documents.workspace.bindings[path]?.name || path}
            </option>
          ))}
        </select>
      </label>
      <p role="status">{status}</p>
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
      <div className="workspace">
        <SourceEditor
          visual={/\.mdx?$/.test(selected)}
          key={selected}
          documentKey={selected}
          histories={histories}
          source={files[selected]!}
          onChange={documents.change}
        />
        {html &&
          (isTauri() ? (
            <NativePreview html={html} onError={setError} />
          ) : (
            <Preview html={html} onError={setError} />
          ))}
      </div>
    </main>
  );
}
