import { useEffect, type ComponentType } from 'react';
import type { StoredAsset } from '../../assets/catalog';
import type { CorePluginSettings } from '../../plugins/coreRegistry';

export interface RenderedRuntimeContext {
  files: Record<string, string>;
  entry: string;
  theme: 'light' | 'dark';
  images: readonly StoredAsset[];
  stopped: boolean;
  rebuildVersion?: number;
  corePlugins?: CorePluginSettings;
  showComponentSource?: boolean;
  /** Trusted platform presentation only. Authored components never choose this. */
  renderer?: ComponentType<RenderedRuntimeProps>;
}

export interface RenderedRuntimeProps {
  context: RenderedRuntimeContext;
  raw: string;
  onError: (message: string) => void;
}

function UnavailableRuntime({
  onError,
}: Pick<RenderedRuntimeProps, 'onError'>) {
  useEffect(() => {
    onError('');
    return () => onError('');
  }, [onError]);
  return (
    <p className="rendered-runtime-status">React preview is unavailable.</p>
  );
}

/** No platform guess or execution fallback; native execution remains unavailable. */
export function RenderedRuntime(props: RenderedRuntimeProps) {
  const Renderer = props.context.renderer;
  return Renderer ? (
    <Renderer {...props} />
  ) : (
    <UnavailableRuntime onError={props.onError} />
  );
}
