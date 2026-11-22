import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
} from 'react';

/** Untrusted messages may report presentation only, never alter a document. */
export function WebPreview({
  html,
  onError,
  theme = 'light',
}: {
  html: string;
  onError: (message: string) => void;
  theme?: 'light' | 'dark';
}) {
  const frame = useRef<HTMLIFrameElement>(null);
  const [size, setSize] = useState<{ html: string; height: number } | null>(
    null,
  );
  const sendAppearance = useCallback(() => {
    frame.current?.contentWindow?.postMessage(
      {
        type: 'preview-appearance',
        theme,
        compact: window.matchMedia?.('(max-width: 720px)').matches ?? false,
      },
      '*',
    );
  }, [theme]);
  useEffect(() => {
    const viewport = window.matchMedia?.('(max-width: 720px)');
    sendAppearance();
    viewport?.addEventListener('change', sendAppearance);
    return () => viewport?.removeEventListener('change', sendAppearance);
  }, [html, sendAppearance]);
  // Install before the browser can deliver the new srcdoc's first report.
  useLayoutEffect(() => {
    function receive(event: MessageEvent) {
      if (
        event.source !== frame.current?.contentWindow ||
        event.origin !== 'null'
      )
        return;
      const data: unknown = event.data;
      if (
        typeof data !== 'object' ||
        data === null ||
        Object.keys(data).length !== 2
      )
        return;
      const message = data as Record<string, unknown>;
      if (
        message.type === 'preview-error' &&
        typeof message.message === 'string' &&
        message.message.length <= 2000
      )
        onError(message.message);
      if (
        message.type === 'preview-size' &&
        typeof message.height === 'number' &&
        Number.isInteger(message.height) &&
        message.height >= 120 &&
        message.height <= 100000
      ) {
        const height = message.height;
        setSize((current) =>
          current?.html === html && current.height === height
            ? current
            : { html, height },
        );
      }
    }
    window.addEventListener('message', receive);
    return () => window.removeEventListener('message', receive);
  }, [html, onError]);
  return (
    <iframe
      key={html}
      ref={frame}
      title="Document preview"
      sandbox="allow-scripts"
      referrerPolicy="no-referrer"
      srcDoc={html}
      onLoad={sendAppearance}
      style={{
        display: 'block',
        width: '100%',
        border: 0,
        height: size?.html === html ? size.height : 240,
      }}
    />
  );
}
