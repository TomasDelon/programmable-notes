import { useEffect, useMemo } from 'react';
import type { StoredAsset } from '../../assets/catalog';
import { parseLiveSource } from '../math/mathSource';
import { useWebPreview } from '../../web/useWebPreview';
import { WebPreview } from '../../web/WebPreview';

export interface RenderedRuntimeContext {
  files: Record<string, string>;
  entry: string;
  theme: 'light' | 'dark';
  images: readonly StoredAsset[];
  stopped: boolean;
}

/** The host chooses code from its own source AST. A frame never receives edit authority. */
function runtimeIslandSource(source: string, path: string, raw: string) {
  const tree = parseLiveSource(source, path);
  const setup = (tree?.children ?? [])
    .filter((node) => node.type === 'mdxjsEsm')
    .map((node) =>
      source.slice(node.position!.start.offset, node.position!.end.offset),
    );
  return [...setup, raw].join('\n\n');
}

export function RenderedRuntime({
  context,
  raw,
  onError,
}: {
  context: RenderedRuntimeContext;
  raw: string;
  onError: (message: string) => void;
}) {
  const serializedFiles = useMemo(
    () =>
      JSON.stringify({
        ...context.files,
        [context.entry]: runtimeIslandSource(
          context.files[context.entry] ?? '',
          context.entry,
          raw,
        ),
      }),
    [context.files, context.entry, raw],
  );
  const files = useMemo(
    () => JSON.parse(serializedFiles) as Record<string, string>,
    [serializedFiles],
  );
  const serializedImages = JSON.stringify(context.images);
  const images = useMemo(
    () => JSON.parse(serializedImages) as StoredAsset[],
    [serializedImages],
  );
  const preview = useWebPreview({
    ...context,
    files,
    images,
    enabled: !context.stopped,
  });
  useEffect(() => {
    onError(context.stopped ? '' : preview.error);
  }, [context.stopped, preview.error, onError]);
  useEffect(() => () => onError(''), [onError]);
  if (context.stopped)
    return <p className="rendered-runtime-status">React preview is paused.</p>;
  return (
    <div className="rendered-runtime">
      {preview.html ? (
        <WebPreview
          html={preview.html}
          theme={context.theme}
          onError={preview.reportRuntimeError}
        />
      ) : (
        !preview.error && (
          <span className="rendered-runtime-status" role="status">
            Preparing component…
          </span>
        )
      )}
    </div>
  );
}
