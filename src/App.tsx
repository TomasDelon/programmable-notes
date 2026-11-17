import CompilerWorker from './compiler/compiler.worker?worker&inline';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { useEffect, useRef, useState } from 'react';
import counter from '../docs/handoff/samples/fixtures/counter.mdx?raw';
import imported from '../docs/handoff/samples/fixtures/widgets/ImportedCounter.tsx?raw';
import { SourceEditor } from './editor/SourceEditor';
import { Preview } from './preview/Preview';
import { previewDocument } from './preview/document';

let wasm: Promise<WebAssembly.Module> | undefined;
function compilerModule() {
  return (wasm ??= WebAssembly.compileStreaming(fetch(wasmURL)));
}

export function App() {
  const openSequence = useRef(0);
  const [files, setFiles] = useState<Record<string, string>>({
    'note.mdx': counter,
    'widgets/ImportedCounter.tsx': imported,
  });
  const [entry, setEntry] = useState('note.mdx');
  const [selected, setSelected] = useState('note.mdx');
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
        setStatus('Build timed out');
        setError('Compilation exceeded 15 seconds; source retained.');
      }
    }, 15000);
    const timer = setTimeout(async () => {
      let wasmModule: WebAssembly.Module;
      try {
        wasmModule = await compilerModule();
      } catch (error) {
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
            setStatus('Preview loaded — state resets on edits');
          }
        }
        worker?.terminate();
      };
      worker.postMessage({ id: revision, files, entry, wasmModule });
    }, 300);
    return () => {
      active = false;
      clearTimeout(timer);
      clearTimeout(timeout);
      worker?.terminate();
    };
  }, [files, entry, revision, stopped]);
  async function open(list: FileList | null) {
    if (!list?.length) return;
    const additions: Record<string, string> = {};
    const prefix = `opened-${++openSequence.current}/`;
    for (const file of Array.from(list)) {
      if (file.size > 500_000) {
        setError('File exceeds 500 KB limit');
        return;
      }
      additions[prefix + (file.webkitRelativePath || file.name)] =
        await file.text();
    }
    setFiles((old) => ({ ...old, ...additions }));
    const name = Object.keys(additions).find((p) => /\.mdx?$/.test(p));
    if (name) {
      setEntry(name);
      setSelected(name);
    }
  }
  function save() {
    const url = URL.createObjectURL(
      new Blob([files[selected]!], { type: 'text/plain;charset=utf-8' }),
    );
    const a = document.createElement('a');
    a.href = url;
    a.download = selected.split('/').pop()!;
    a.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  }
  return (
    <main>
      <h1>Programmable Notes</h1>
      <p role="note">
        Experimental preview. Resource exhaustion and native isolation are not
        yet verified. Use trusted documents only.
      </p>
      <nav>
        <label>
          Open files{' '}
          <input
            aria-label="Open files"
            type="file"
            multiple
            accept=".md,.mdx,.tsx,.ts,.jsx,.js"
            onChange={(e) => void open(e.target.files)}
          />
        </label>
        <button onClick={save}>Save source</button>
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
          onChange={(e) => setSelected(e.target.value)}
        >
          {Object.keys(files).map((path) => (
            <option key={path}>{path}</option>
          ))}
        </select>
      </label>
      <p role="status">{status}</p>
      {error && <pre role="alert">{error}</pre>}
      <div className="workspace">
        <SourceEditor
          key={selected}
          source={files[selected]!}
          onChange={(source) =>
            setFiles((old) => ({ ...old, [selected]: source }))
          }
        />
        {html && <Preview html={html} onError={setError} />}
      </div>
    </main>
  );
}
