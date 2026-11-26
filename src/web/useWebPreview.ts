import type { CorePluginSettings } from '../plugins/coreRegistry';
import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import CompilerWorker from '../compiler/compiler.worker?worker&inline';
import wasmURL from 'esbuild-wasm/esbuild.wasm?url';
import { validateFiles } from '../documents/workspace';
import { isMdxSource } from '../sourceTypes';
import { webPreviewDocument } from './previewDocument';
import type { StoredAsset } from '../assets/catalog';

const noImages: readonly StoredAsset[] = [];

interface CompilerInitialization {
  promise: Promise<WebAssembly.Module>;
  controller: AbortController;
  ready: boolean;
  consumers: number;
}
interface CompilerLease {
  promise: Promise<WebAssembly.Module>;
  release: () => void;
}
let wasm: CompilerInitialization | undefined;
function sharedCompilerModule() {
  if (wasm) return wasm;
  const controller = new AbortController();
  const initialization: CompilerInitialization = {
    controller,
    ready: false,
    consumers: 0,
    promise: Promise.resolve()
      .then(async () => {
        const response = await fetch(wasmURL, {
          cache: 'force-cache',
          signal: controller.signal,
        });
        if (!response.ok)
          throw new Error(
            `Compiler download failed (${response.status}). Try Rebuild when online.`,
          );
        const fallback = response.clone();
        try {
          return await WebAssembly.compileStreaming(response);
        } catch {
          // Some static hosts send an incorrect MIME type for WASM.
          return WebAssembly.compile(await fallback.arrayBuffer());
        }
      })
      .then((module) => {
        initialization.ready = true;
        return module;
      })
      .catch((error: unknown) => {
        // An older cancelled request must never discard a newer initialized module.
        if (wasm === initialization) wasm = undefined;
        throw error;
      }),
  };
  wasm = initialization;
  return initialization;
}

/** Each preview owns one lease; retiring one island cannot abort its siblings. */
function compilerModule(): CompilerLease {
  const initialization = sharedCompilerModule();
  initialization.consumers++;
  let released = false;
  return {
    promise: initialization.promise,
    release: () => {
      if (released) return;
      released = true;
      initialization.consumers--;
      if (initialization.ready || initialization.consumers > 0) return;
      if (wasm === initialization) wasm = undefined;
      initialization.controller.abort();
    },
  };
}

function cancelInitialization(
  initialization: CompilerLease | null | undefined,
) {
  initialization?.release();
}

export type WebPreviewStatus =
  | 'Waiting'
  | 'Compiling'
  | 'Preparing preview'
  | 'Preview ready'
  | 'Build blocked'
  | 'Build failed'
  | 'Build timed out'
  | 'Preview stopped'
  | 'Runtime error';
export interface WebSourceLocation {
  file: string;
  line: number;
  offset: number;
  source: string;
}

export function useWebPreview({
  files,
  entry,
  theme,
  images = noImages,
  enabled = true,
  corePlugins,
  showComponentSource = false,
}: {
  files: Record<string, string>;
  entry: string;
  theme: 'light' | 'dark';
  images?: readonly StoredAsset[];
  enabled?: boolean;
  corePlugins?: CorePluginSettings;
  showComponentSource?: boolean;
}) {
  const [stopped, setStopped] = useState(false);
  const [revision, setRevision] = useState(0);
  const mathematics = corePlugins?.mathematics !== false;
  const request = useMemo(
    () =>
      enabled && !stopped
        ? { files, entry, images, mathematics, showComponentSource, revision }
        : null,
    [
      files,
      entry,
      images,
      mathematics,
      showComponentSource,
      revision,
      stopped,
      enabled,
    ],
  );
  const [publication, setPublication] = useState<{
    request: NonNullable<typeof request>;
    status: WebPreviewStatus;
    html?: string;
    error?: string;
    locations?: WebSourceLocation[];
  } | null>(null);
  const generation = useRef(0);
  const readyGeneration = useRef<number | null>(null);
  const workerRef = useRef<Worker | null>(null);
  const initializationRef = useRef<CompilerLease | null>(null);
  const currentTheme = useRef(theme);
  useLayoutEffect(() => {
    currentTheme.current = theme;
  }, [theme]);

  const stop = useCallback(() => {
    generation.current++;
    readyGeneration.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    cancelInitialization(initializationRef.current);
    setStopped(true);
    setPublication(null);
  }, []);

  const rebuild = useCallback(() => {
    generation.current++;
    readyGeneration.current = null;
    workerRef.current?.terminate();
    workerRef.current = null;
    cancelInitialization(initializationRef.current);
    setStopped(false);
    setRevision((value) => value + 1);
  }, []);

  const reportRuntimeError = useCallback(
    (message: string) => {
      if (readyGeneration.current !== generation.current) return;
      setPublication((previous) =>
        previous && previous.request === request
          ? {
              ...previous,
              error: message.slice(0, 2000),
              status: 'Runtime error',
            }
          : previous,
      );
    },
    [request],
  );

  useEffect(() => {
    if (!request) return;
    const { files, entry, images, mathematics, showComponentSource } = request;
    const ticket = ++generation.current;
    readyGeneration.current = null;
    let active = true;
    let acceptedReply = false;
    let worker: Worker | undefined;
    let initialization: CompilerLease | undefined;
    const current = () => active && generation.current === ticket;
    const terminateWorker = () => {
      worker?.terminate();
      if (workerRef.current === worker) workerRef.current = null;
    };
    // One deadline covers download, worker compilation and CSP/script hashing.
    // An output message is not completion until the usable document exists.
    const deadline = setTimeout(() => {
      fail(
        'Compilation exceeded 15 seconds. Your source is retained; try Rebuild.',
        'Build timed out',
      );
    }, 15000);
    const fail = (
      failure: unknown,
      status: WebPreviewStatus = 'Build failed',
      locations?: WebSourceLocation[],
    ) => {
      if (!current()) return;
      active = false;
      clearTimeout(deadline);
      terminateWorker();
      cancelInitialization(initialization);
      setPublication({
        request,
        status,
        error: String(failure).slice(0, 2000),
        locations,
      });
    };
    const timer = setTimeout(async () => {
      try {
        validateFiles(files);
        if (!Object.hasOwn(files, entry) || !isMdxSource(entry))
          throw new Error('Select a Markdown or MDX note to preview.');
      } catch (failure) {
        fail(failure, 'Build blocked');
        return;
      }
      try {
        initialization = compilerModule();
        initializationRef.current = initialization;
        const wasmModule = await initialization.promise;
        cancelInitialization(initialization);
        if (initializationRef.current === initialization)
          initializationRef.current = null;
        if (!current()) return;
        worker = new CompilerWorker();
        workerRef.current = worker;
        worker.onerror = (event) => {
          if (acceptedReply) return;
          fail(
            event.message ||
              'The compiler stopped unexpectedly. Your source is retained.',
          );
        };
        worker.onmessage = (
          event: MessageEvent<{
            id: number;
            code?: string;
            error?: string;
            locations?: { file: string; line: number; offset: number }[];
          }>,
        ) => {
          if (!current() || acceptedReply || event.data?.id !== ticket) return;
          acceptedReply = true;
          terminateWorker();
          const result = event.data;
          if (typeof result.error === 'string') {
            fail(
              result.error,
              'Build failed',
              (Array.isArray(result.locations) ? result.locations : [])
                .filter(
                  (location) =>
                    location &&
                    Object.hasOwn(files, location.file) &&
                    Number.isSafeInteger(location.line) &&
                    location.line >= 1 &&
                    Number.isSafeInteger(location.offset) &&
                    location.offset >= 0 &&
                    location.offset <= files[location.file]!.length,
                )
                .slice(0, 8)
                .map((location) => ({
                  ...location,
                  source: files[location.file]!,
                })),
            );
          } else if (typeof result.code === 'string') {
            setPublication({ request, status: 'Preparing preview' });
            void webPreviewDocument(
              result.code,
              currentTheme.current,
              window.matchMedia?.('(max-width: 720px)').matches ?? false,
              images,
            ).then(
              (document) => {
                if (!current()) return;
                active = false;
                clearTimeout(deadline);
                readyGeneration.current = ticket;
                setPublication({
                  request,
                  status: 'Preview ready',
                  html: document,
                });
              },
              (failure: unknown) => fail(failure),
            );
          } else {
            fail('The compiler returned no document. Try Rebuild.');
          }
        };
        worker.postMessage({
          id: ticket,
          files,
          entry,
          wasmModule,
          webMode: true,
          mathematics,
          showComponentSource,
        });
      } catch (failure) {
        fail(failure);
      }
    }, 300);
    return () => {
      active = false;
      readyGeneration.current = null;
      clearTimeout(timer);
      clearTimeout(deadline);
      terminateWorker();
      // Retire this consumer; only the last lease aborts a stalled download.
      cancelInitialization(initialization);
      if (initializationRef.current === initialization)
        initializationRef.current = null;
    };
  }, [request]);

  // A retired result can still be in React state on the first render of a new request.
  const current = publication?.request === request ? publication : null;
  const status: WebPreviewStatus =
    current?.status ?? (request ? 'Compiling' : 'Preview stopped');
  return {
    html: current?.html ?? '',
    status,
    error: current?.error ?? '',
    locations: current?.locations ?? [],
    stopped,
    stop,
    rebuild,
    reportRuntimeError,
  };
}
