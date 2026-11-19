import { useEffect, useState } from 'react';
import { invoke } from '@tauri-apps/api/core';

// Preserve order across rapid edits and StrictMode mount/cleanup. No simultaneous
// native starts, and cleanup cannot stop the preview belonging to a newer build.
let queue: Promise<unknown> = Promise.resolve();
// Status transport is shared across effect generations; Stop never waits on it.
let connectionRead: Promise<unknown> | undefined;
type Phase = 'starting' | 'connected' | 'ended' | 'unknown';
const feedback: Record<Phase, string> = {
  starting: 'Preview session is starting.',
  connected: 'Preview session is connected.',
  ended:
    'Preview session ended or disconnected. Rebuild preview to run it again.',
  unknown:
    'Preview session status is unavailable. Stop or rebuild the preview.',
};
export function NativePreview({
  html,
  onError,
}: {
  html: string;
  onError: (message: string) => void;
}) {
  const [connection, setConnection] = useState<{
    artifact: string;
    phase: Phase;
  }>(() => ({ artifact: html, phase: 'starting' }));
  const phase = connection.artifact === html ? connection.phase : 'starting';
  useEffect(() => {
    let current = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    async function checkConnection() {
      if (!current) return;
      if (connectionRead) {
        timer = setTimeout(checkConnection, 1000);
        return;
      }
      let read: Promise<unknown> | undefined;
      try {
        read = invoke<unknown>('preview_connection_active');
        connectionRead = read;
        const active = await read;
        if (!current) return;
        if (typeof active !== 'boolean')
          throw Error('Unexpected connection status');
        setConnection({
          artifact: html,
          phase: active ? 'connected' : 'ended',
        });
        // Schedule after completion: a slow native read never accumulates polls.
        if (active) timer = setTimeout(checkConnection, 1000);
      } catch (error) {
        if (current) {
          setConnection({ artifact: html, phase: 'unknown' });
          onError(
            `Native preview status unavailable: ${String(error).slice(0, 2000)}`,
          );
        }
      } finally {
        if (read && connectionRead === read) connectionRead = undefined;
      }
    }
    queue = queue
      .catch(() => undefined)
      .then(async () => {
        if (!current) return;
        try {
          setConnection({ artifact: html, phase: 'starting' });
          await invoke('start_preview', { html });
          if (current) timer = setTimeout(checkConnection, 1000);
        } catch (error) {
          if (current) {
            setConnection({ artifact: html, phase: 'unknown' });
            onError(
              `Native preview unavailable: ${String(error).slice(0, 2000)}`,
            );
          }
        }
      });
    return () => {
      current = false;
      if (timer !== undefined) clearTimeout(timer);
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
    <>
      <p role="status" aria-label="Native preview status">
        {feedback[phase]}
      </p>
      <p role="note">
        Native preview runs in a separate resource-limited process. Stop preview
        terminates its service and WebKit descendants. The session expires after
        60 seconds.
      </p>
    </>
  );
}
