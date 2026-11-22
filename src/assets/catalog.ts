import {
  inspectMediaBytes,
  inspectMediaFile,
  safeDisplayFilename,
  type InspectionPolicy,
  type MediaMime,
} from './inspection';

export const MEDIA_POLICY: InspectionPolicy = Object.freeze({
  maxImageBytes: 4 * 1024 * 1024,
  maxPdfBytes: 8 * 1024 * 1024,
  maxImagePixels: 24_000_000,
});
export const MAX_ASSET_TOTAL_BYTES = 16 * 1024 * 1024;
export const MAX_ASSETS = 256;

export interface StoredAsset {
  readonly id: string;
  readonly mime: MediaMime;
  readonly name: string;
  readonly byteLength: number;
  readonly base64: string;
  readonly width?: number;
  readonly height?: number;
}
export type AssetCatalog = Readonly<Record<string, StoredAsset>>;

const assetIdPattern = /^sha256:[a-f0-9]{64}$/;
const base64Pattern = /^[A-Za-z0-9+/]*={0,2}$/;
const mimes = new Set<MediaMime>([
  'image/png',
  'image/jpeg',
  'image/webp',
  'application/pdf',
]);

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}

export function encodeAssetBytes(bytes: Uint8Array): string {
  let binary = '';
  for (let index = 0; index < bytes.length; index += 8192) {
    binary += String.fromCharCode(...bytes.subarray(index, index + 8192));
  }
  return btoa(binary);
}

export function decodeAssetBytes(asset: StoredAsset): Uint8Array<ArrayBuffer> {
  const binary = atob(asset.base64);
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

/** Synchronous shape and allocation bounds. Cryptographic checks run at ingestion/restore. */
export function validateAssetCatalog(
  value: unknown,
): asserts value is AssetCatalog {
  assert(
    value !== null && typeof value === 'object' && !Array.isArray(value),
    'Invalid attachment catalog.',
  );
  const entries = Object.entries(value);
  assert(
    entries.length <= MAX_ASSETS,
    'A workspace can contain up to 256 attachments.',
  );
  let total = 0;
  for (const [key, candidate] of entries) {
    assert(assetIdPattern.test(key), 'Invalid attachment identity.');
    assert(
      candidate !== null &&
        typeof candidate === 'object' &&
        !Array.isArray(candidate),
      'Invalid attachment record.',
    );
    const asset = candidate as Partial<StoredAsset>;
    assert(
      asset.id === key &&
        typeof asset.mime === 'string' &&
        mimes.has(asset.mime),
      'Invalid attachment type or identity.',
    );
    assert(
      typeof asset.name === 'string' &&
        asset.name === safeDisplayFilename(asset.name, asset.mime),
      'Invalid attachment filename.',
    );
    assert(
      Number.isSafeInteger(asset.byteLength) && asset.byteLength! > 0,
      'Invalid attachment size.',
    );
    const cap =
      asset.mime === 'application/pdf'
        ? MEDIA_POLICY.maxPdfBytes
        : MEDIA_POLICY.maxImageBytes;
    assert(
      asset.byteLength! <= cap,
      'An attachment exceeds the file size limit.',
    );
    total += asset.byteLength!;
    assert(
      total <= MAX_ASSET_TOTAL_BYTES,
      'Attachments exceed the 16 MiB workspace limit.',
    );
    assert(
      typeof asset.base64 === 'string' &&
        asset.base64.length === Math.ceil(asset.byteLength! / 3) * 4 &&
        base64Pattern.test(asset.base64),
      'Invalid attachment encoding.',
    );
    if (asset.mime !== 'application/pdf') {
      assert(
        Number.isSafeInteger(asset.width) &&
          Number.isSafeInteger(asset.height) &&
          asset.width! > 0 &&
          asset.height! > 0 &&
          asset.width! * asset.height! <= MEDIA_POLICY.maxImagePixels,
        'Invalid attachment dimensions.',
      );
    }
  }
}

/** Requires the browser to accept actual image data, not just its container headers. */
export async function verifyImageDecoding(asset: StoredAsset): Promise<void> {
  if (asset.mime === 'application/pdf') return;
  const blob = assetBlob(asset);
  if (typeof createImageBitmap === 'function') {
    const bitmap = await createImageBitmap(blob);
    try {
      assert(
        bitmap.width === asset.width && bitmap.height === asset.height,
        'Decoded image dimensions do not match its header.',
      );
    } finally {
      bitmap.close();
    }
    return;
  }
  const url = URL.createObjectURL(blob);
  try {
    await new Promise<void>((resolve, reject) => {
      const image = new Image();
      const timeout = setTimeout(() => {
        image.src = '';
        reject(new Error('The image decoder did not respond.'));
      }, 10_000);
      image.onload = () => {
        clearTimeout(timeout);
        if (
          image.naturalWidth === asset.width &&
          image.naturalHeight === asset.height
        )
          resolve();
        else
          reject(
            new Error('Decoded image dimensions do not match its header.'),
          );
      };
      image.onerror = () => {
        clearTimeout(timeout);
        reject(
          new Error(
            'This image cannot be decoded. No attachment was imported.',
          ),
        );
      };
      image.src = url;
    });
  } finally {
    URL.revokeObjectURL(url);
  }
}

export async function verifyAssetCatalog(
  catalog: AssetCatalog = {},
  decodeImages = false,
): Promise<void> {
  validateAssetCatalog(catalog);
  for (const asset of Object.values(catalog)) {
    const bytes = decodeAssetBytes(asset);
    assert(
      bytes.length === asset.byteLength &&
        encodeAssetBytes(bytes) === asset.base64,
      'Attachment encoding is not canonical.',
    );
    const inspected = await inspectMediaBytes(
      bytes,
      asset.name,
      asset.mime,
      MEDIA_POLICY,
    );
    assert(
      inspected.id === asset.id &&
        inspected.width === asset.width &&
        inspected.height === asset.height,
      'Attachment integrity check failed.',
    );
    if (decodeImages) await verifyImageDecoding(asset);
  }
}

export async function prepareAttachment(file: File): Promise<StoredAsset> {
  const inspection = await inspectMediaFile(file, MEDIA_POLICY);
  const bytes = new Uint8Array(await file.arrayBuffer());
  // The record is made from the same immutable File, and verified again against its ID.
  const asset: StoredAsset = Object.freeze({
    id: inspection.id,
    mime: inspection.mime,
    name: inspection.safeName,
    byteLength: inspection.byteLength,
    base64: encodeAssetBytes(bytes),
    ...(inspection.width === undefined
      ? {}
      : { width: inspection.width, height: inspection.height }),
  });
  await verifyAssetCatalog({ [asset.id]: asset }, true);
  return asset;
}

export function assetBlob(asset: StoredAsset): Blob {
  return new Blob([decodeAssetBytes(asset)], { type: asset.mime });
}

export function attachmentMarkdown(asset: StoredAsset): string {
  // Encode label punctuation so names never introduce Markdown or JSX.
  const label = asset.name.replace(
    /[\\[\]<>{}]/g,
    (character) => '\\' + character,
  );
  return (
    (asset.mime === 'application/pdf' ? '' : '!') +
    '[' +
    label +
    '](attachment:' +
    asset.id +
    ')'
  );
}

export function downloadAttachment(asset: StoredAsset): void {
  const url = URL.createObjectURL(assetBlob(asset));
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = asset.name;
  anchor.click();
  setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
