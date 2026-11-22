import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, render, screen } from '@testing-library/react';
import { webPreviewDocument } from '../../src/web/previewDocument';
import { WebPreview } from '../../src/web/WebPreview';

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

describe('web preview isolation', () => {
  it('hashes the complete escaped script and only allows embedded font assets', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const html = await webPreviewDocument(
      'globalThis.fixture="</script><script>bad</script>";',
      'dark',
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('script')).toHaveLength(1);
    const script = parsed.querySelector('script')!.textContent!;
    const digest = await webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(script),
    );
    const hash = Buffer.from(digest).toString('base64');
    const csp = parsed
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(csp).toContain(`script-src 'sha256-${hash}'`);
    for (const directive of [
      "default-src 'none'",
      "connect-src 'none'",
      "img-src 'none'",
      'font-src data:',
      "frame-src 'none'",
      "worker-src 'none'",
    ])
      expect(csp).toContain(directive);
    const css = parsed.querySelector('style')!.textContent!;
    expect(css).toContain('DM Sans Variable');
    expect(css).toContain('data:font/woff2;base64,');
    expect(css).not.toMatch(/url\((?!data:)/);
  });

  it('accepts bounded presentation messages only from the current opaque child', () => {
    const onError = vi.fn();
    const { rerender } = render(
      <WebPreview html="<p>First</p>" onError={onError} />,
    );
    const frame = screen.getByTitle('Document preview') as HTMLIFrameElement;
    expect(frame.getAttribute('sandbox')).toBe('allow-scripts');
    function send(
      data: unknown,
      source: MessageEventSource | null = frame.contentWindow,
      origin = 'null',
    ) {
      act(() =>
        window.dispatchEvent(
          new MessageEvent('message', { data, source, origin }),
        ),
      );
    }
    send({ type: 'preview-size', height: 600 });
    expect(frame.style.height).toBe('600px');
    send({ type: 'preview-size', height: 900 }, window);
    send(
      { type: 'preview-size', height: 900 },
      frame.contentWindow,
      'https://example.com',
    );
    send({ type: 'preview-size', height: 100001 });
    send({ type: 'preview-size', height: 900, source: 'overwrite' });
    send({ type: 'preview-size', height: NaN });
    expect(frame.style.height).toBe('600px');
    send({ type: 'preview-error', message: 'A visible failure' });
    expect(onError).toHaveBeenCalledExactlyOnceWith('A visible failure');
    const appearance = vi.spyOn(frame.contentWindow!, 'postMessage');
    rerender(<WebPreview html="<p>First</p>" onError={onError} theme="dark" />);
    expect(appearance).toHaveBeenCalledWith(
      { type: 'preview-appearance', theme: 'dark', compact: false },
      '*',
    );
    expect(screen.getByTitle('Document preview')).toBe(frame);
    const staleWindow = frame.contentWindow;
    rerender(<WebPreview html="<p>Second</p>" onError={onError} />);
    send({ type: 'preview-error', message: 'Stale failure' }, staleWindow);
    expect(onError).toHaveBeenCalledTimes(1);
    expect(
      (screen.getByTitle('Document preview') as HTMLIFrameElement).style.height,
    ).toBe('240px');
  });
});
