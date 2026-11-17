import { useEffect } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Preserve order across rapid edits and StrictMode mount/cleanup. No simultaneous
// native starts, and cleanup cannot stop the preview belonging to a newer build.
let queue: Promise<unknown> = Promise.resolve();
export function NativePreview({
  html,
  onError,
}: {
  html: string;
  onError: (message: string) => void;
}) {
  useEffect(() => {
    let current = true;
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        if (!current) return;
        try {
          await invoke('start_preview', { html });
        } catch (error) {
          if (current)
            onError(
              `Native preview unavailable: ${String(error).slice(0, 2000)}`,
            );
        }
      });
    return () => {
      current = false;
      queue = queue
        .catch(() => undefined)
        .then(async () => {
          try {
            await invoke('stop_preview');
          } catch (error) {
            onError(`Native stop failed: ${String(error).slice(0, 2000)}`);
          }
        });
    };
  }, [html, onError]);
  return (
    <p role="note">
      Native preview runs in a separate resource-limited process. Stop preview
      terminates its service and WebKit descendants. The session expires after
      60 seconds.
    </p>
  );
}
