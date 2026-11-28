import type { DocumentRuntimeProps } from '../preview/DocumentRuntime';
import { useWebPreview } from './useWebPreview';
import { WebPreview } from './WebPreview';

/** Explicit browser compilation/presentation; no native or implicit fallback. */
export function WebDocumentRuntime({ input, children }: DocumentRuntimeProps) {
  const preview = useWebPreview(input);
  return children({
    available: true,
    presentation: preview.html ? (
      <WebPreview
        html={preview.html}
        theme={input.theme}
        onError={preview.reportRuntimeError}
      />
    ) : null,
    status: preview.status,
    error: preview.error,
    locations: preview.locations,
    stopped: preview.stopped,
    stop: preview.stop,
    rebuild: preview.rebuild,
  });
}
