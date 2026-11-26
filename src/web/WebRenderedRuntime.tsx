import { useEffect, useMemo } from 'react';
import type { StoredAsset } from '../assets/catalog';
import { runtimeIslandSource } from '../plugins/core/react';
import type { RenderedRuntimeProps } from '../editor/rendered/RenderedRuntime';
import { useWebPreview } from './useWebPreview';
import { WebPreview } from './WebPreview';

/** Explicit browser adapter; never selected by the shared editor automatically. */
export function WebRenderedRuntime({
  context,
  raw,
  onError,
}: RenderedRuntimeProps) {
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
    trackWorkspaceDependencies: true,
    corePlugins: context.corePlugins,
    // The trusted host already presents this island's source when requested.
    showComponentSource: false,
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
