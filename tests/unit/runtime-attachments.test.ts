import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  attachmentReferences,
  referencedPreviewAssets,
} from '../../src/web/previewAssets';
import { webPreviewDocument } from '../../src/web/previewDocument';
import type { StoredAsset } from '../../src/assets/catalog';

const imageId = `sha256:${'a'.repeat(64)}`;
const pdfId = `sha256:${'b'.repeat(64)}`;
const privateId = `sha256:${'c'.repeat(64)}`;
const image: StoredAsset = {
  id: imageId,
  mime: 'image/png',
  name: 'pixel.png',
  byteLength: 1,
  base64: 'AA==',
  width: 1,
  height: 1,
};
const pdf: StoredAsset = {
  id: pdfId,
  mime: 'application/pdf',
  name: 'paper.pdf',
  byteLength: 1,
  base64: 'AA==',
};

afterEach(() => vi.unstubAllGlobals());

describe('scoped preview attachment transport', () => {
  it('selects only real Markdown image references, not PDFs, code, JSX or unrelated assets', () => {
    const source = `![visible](attachment:${imageId})

[paper](attachment:${pdfId})

\`![private](attachment:${privateId})\`

<div>![hidden](attachment:${privateId})</div>

![missing](attachment:sha256:${'d'.repeat(64)})`;
    const catalog = {
      [imageId]: image,
      [pdfId]: pdf,
      [privateId]: { ...image, id: privateId, name: 'private.png' },
    };
    const refs = attachmentReferences(source, 'note.mdx');
    expect(refs.map((ref) => [ref.id, ref.isImage])).toEqual([
      [imageId, true],
      [pdfId, false],
      [`sha256:${'d'.repeat(64)}`, true],
    ]);
    for (const ref of refs)
      expect(source.slice(ref.from, ref.to)).toContain('attachment:');
    expect(referencedPreviewAssets(source, 'note.mdx', catalog)).toEqual([
      image,
    ]);
  });

  it('retains original BOM/CRLF offsets and supports Markdown reference images and links', () => {
    const source = `\uFEFF![diagram][Picture]\r\n\r\n[download][Pdf]\n\n[Picture]: attachment:${imageId}\n[Pdf]: attachment:${pdfId}`;
    const refs = attachmentReferences(source, 'note.md');
    expect(
      refs.map((ref) => [ref.id, ref.isImage, source.slice(ref.from, ref.to)]),
    ).toEqual([
      [imageId, true, '![diagram][Picture]'],
      [pdfId, false, '[download][Pdf]'],
    ]);
    expect(refs[0]!.from).toBe(1);
  });

  it('does not supply any workspace attachment on malformed MDX', () => {
    const source = `<Unclosed\n![image](attachment:${imageId})`;
    expect(
      referencedPreviewAssets(source, 'broken.mdx', { [imageId]: image }),
    ).toEqual([]);
  });

  it('keeps the original CSP and hashes the complete canvas script without allowing image URLs', async () => {
    vi.stubGlobal('crypto', webcrypto);
    const html = await webPreviewDocument(
      'globalThis.__fixture=true',
      'light',
      false,
      [image],
    );
    const parsed = new DOMParser().parseFromString(html, 'text/html');
    expect(parsed.querySelectorAll('script')).toHaveLength(1);
    const script = parsed.querySelector('script')!.textContent!;
    expect(script).toContain('createImageBitmap(new Blob');
    expect(script).toContain('context.drawImage');
    expect(script).toContain(imageId);
    expect(script).not.toContain(pdfId);
    const digest = await webcrypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(script),
    );
    const csp = parsed
      .querySelector('meta[http-equiv="Content-Security-Policy"]')!
      .getAttribute('content')!;
    expect(csp).toContain(
      `script-src 'sha256-${Buffer.from(digest).toString('base64')}'`,
    );
    expect(csp).toContain("img-src 'none'");
    expect(csp).toContain("connect-src 'none'");
    expect(csp).not.toContain('blob:');
    expect(parsed.querySelectorAll('img')).toHaveLength(0);
  });

  it('refuses PDF bytes and invalid image allocation bounds at the transport boundary', async () => {
    await expect(webPreviewDocument('', 'light', false, [pdf])).rejects.toThrow(
      'Only validated raster',
    );
    await expect(
      webPreviewDocument('', 'light', false, [{ ...image, width: 30_000_000 }]),
    ).rejects.toThrow('dimensions');
  });
});
