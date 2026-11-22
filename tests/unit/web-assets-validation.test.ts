import { webcrypto } from 'node:crypto';
import { File as NodeFile } from 'node:buffer';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  inspectMediaBytes,
  safeDisplayFilename,
} from '../../src/assets/inspection';
import {
  MEDIA_POLICY,
  attachmentMarkdown,
  decodeAssetBytes,
  prepareAttachment,
  validateAssetCatalog,
  verifyAssetCatalog,
} from '../../src/assets/catalog';
import { PNG, pngAsset } from './web-assets-fixtures';

beforeEach(() => vi.stubGlobal('crypto', webcrypto));
afterEach(() => vi.unstubAllGlobals());

describe('validated original attachments', () => {
  it('retains original PNG bytes, content identity, metadata and safe references', async () => {
    const asset = await pngAsset('plot.png');
    expect(asset.id).toMatch(/^sha256:[a-f0-9]{64}$/);
    expect(asset.width).toBe(4);
    expect(asset.height).toBe(3);
    expect(decodeAssetBytes(asset)).toEqual(PNG);
    await expect(
      verifyAssetCatalog({ [asset.id]: asset }),
    ).resolves.toBeUndefined();
    expect(attachmentMarkdown(asset)).toBe(
      '![plot.png](attachment:' + asset.id + ')',
    );
  });

  it('does not split a surrogate pair when shortening a long filename', async () => {
    const original = 'a'.repeat(99) + '😀.png';
    const name = safeDisplayFilename(original, 'image/png');
    expect(name).not.toMatch(/[\uD800-\uDBFF](?![\uDC00-\uDFFF])/u);
    const asset = await pngAsset(original);
    expect(() => validateAssetCatalog({ [asset.id]: asset })).not.toThrow();
    expect(JSON.parse(JSON.stringify(asset)).name).toBe(name);
  });

  it('refuses SVG, false MIME, invalid bytes, oversize inputs and pixel bombs', async () => {
    await expect(
      inspectMediaBytes(
        new TextEncoder().encode('<svg/>'),
        'bad.svg',
        'image/svg+xml',
        MEDIA_POLICY,
      ),
    ).rejects.toThrow();
    await expect(
      inspectMediaBytes(PNG, 'bad.jpg', 'image/jpeg', MEDIA_POLICY),
    ).rejects.toThrow('contradicts');
    const corrupt = new Uint8Array(PNG);
    corrupt[35] = corrupt[35]! ^ 1;
    await expect(
      inspectMediaBytes(corrupt, 'bad.png', 'image/png', MEDIA_POLICY),
    ).rejects.toThrow();
    await expect(
      inspectMediaBytes(PNG, 'too-large.png', 'image/png', {
        ...MEDIA_POLICY,
        maxImageBytes: 10,
      }),
    ).rejects.toThrow('limit');
    await expect(
      inspectMediaBytes(PNG, 'too-many-pixels.png', 'image/png', {
        ...MEDIA_POLICY,
        maxImagePixels: 10,
      }),
    ).rejects.toThrow('pixel');
  });

  it('requires an actual image decoder before publishing an imported attachment', async () => {
    const close = vi.fn();
    const decode = vi.fn().mockResolvedValue({ width: 4, height: 3, close });
    vi.stubGlobal('createImageBitmap', decode);
    const file = new NodeFile([PNG], 'chart.png', {
      type: 'image/png',
    }) as unknown as File;
    const asset = await prepareAttachment(file);
    expect(decode).toHaveBeenCalledOnce();
    expect(close).toHaveBeenCalledOnce();
    expect(asset.id).toBe((await pngAsset()).id);
    decode.mockRejectedValueOnce(new Error('Invalid compressed stream'));
    await expect(prepareAttachment(file)).rejects.toThrow(
      'Invalid compressed stream',
    );
  });

  it('rejects identity and payload corruption, including canonical base64 checks', async () => {
    const asset = await pngAsset();
    const wrongId = 'sha256:' + '0'.repeat(64);
    await expect(
      verifyAssetCatalog({ [wrongId]: { ...asset, id: wrongId } }),
    ).rejects.toThrow('integrity');
    await expect(
      verifyAssetCatalog({
        [asset.id]: { ...asset, base64: asset.base64.slice(0, -4) + 'AAAA' },
      }),
    ).rejects.toThrow();
  });

  it('keeps PDF references non-image and escapes labels as literal Markdown data', async () => {
    const asset = await pngAsset();
    expect(
      attachmentMarkdown({
        ...asset,
        mime: 'application/pdf',
        name: '[paper]<tag>{value}.pdf',
      }),
    ).toBe(
      '[\\[paper\\]\\<tag\\>\\{value\\}.pdf](attachment:' + asset.id + ')',
    );
  });
});
