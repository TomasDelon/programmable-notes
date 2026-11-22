import { useLayoutEffect, useRef } from 'react';
export function Preview({
  html,
  onError,
}: {
  html: string;
  onError: (message: string) => void;
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  // srcdoc can report during its first load, before passive effects run.
  useLayoutEffect(() => {
    const receive = (event: MessageEvent) => {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== 'null'
      )
        return;
      const data = event.data as unknown;
      if (typeof data !== 'object' || data === null) return;
      const { type, message } = data as Record<string, unknown>;
      if (
        type === 'preview-error' &&
        typeof message === 'string' &&
        message.length <= 2000 &&
        Object.keys(data).length === 2
      )
        onError(message);
    };
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [onError]);
  return (
    <iframe
      key={html}
      ref={frame}
      title="Document preview"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={html}
    />
  );
}
