/**
 * Media container inspection adapted from the independently tested A6 prototype.
 * Original bytes remain authoritative. Images additionally require browser decoding.
 */
export type MediaMime =
  'image/png' | 'image/jpeg' | 'image/webp' | 'application/pdf';
export type ImageMime = Exclude<MediaMime, 'application/pdf'>;
export type FailureCode =
  | 'UNSUPPORTED_TYPE'
  | 'MIME_MISMATCH'
  | 'EMPTY_FILE'
  | 'BYTE_LIMIT'
  | 'PIXEL_LIMIT'
  | 'MALFORMED_MEDIA'
  | 'ABORTED';

export interface InspectionPolicy {
  maxImageBytes: number;
  maxPdfBytes: number;
  maxImagePixels: number;
}
export interface AssetInspection {
  /** This is a content identity proposal, not a finalized persistence schema. */
  id: `sha256:${string}`;
  sha256: string;
  mime: MediaMime;
  byteLength: number;
  safeName: string;
  width?: number;
  height?: number;
  /** Parsing media headers is not a complete image decoder or security sandbox. */
  requiresDecodeCheck: boolean;
  /** PDF is always download-only; never execute or frame directly. */
  downloadOnly: boolean;
}
export class AssetInspectionError extends Error {
  constructor(
    public readonly code: FailureCode,
    message: string,
  ) {
    super(message);
    this.name = 'AssetInspectionError';
  }
}
function fail(code: FailureCode, message: string): never {
  throw new AssetInspectionError(code, message);
}
function ensure(
  ok: unknown,
  message = 'Malformed media container.',
): asserts ok {
  if (!ok) fail('MALFORMED_MEDIA', message);
}
function readU16BE(b: Uint8Array, i: number): number {
  ensure(i >= 0 && i + 2 <= b.length);
  return b[i]! * 256 + b[i + 1]!;
}
function readU32BE(b: Uint8Array, i: number): number {
  ensure(i >= 0 && i + 4 <= b.length);
  return (
    (b[i]! * 2 ** 24 + b[i + 1]! * 65536 + b[i + 2]! * 256 + b[i + 3]!) >>> 0
  );
}
function readU32LE(b: Uint8Array, i: number): number {
  ensure(i >= 0 && i + 4 <= b.length);
  return (
    (b[i]! + b[i + 1]! * 256 + b[i + 2]! * 65536 + b[i + 3]! * 2 ** 24) >>> 0
  );
}
function ascii(b: Uint8Array, start: number, end: number): string {
  return String.fromCharCode(...b.subarray(start, end));
}
const imageNames: Readonly<Record<ImageMime, string>> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
function extension(mime: MediaMime): string {
  return mime === 'application/pdf' ? 'pdf' : imageNames[mime];
}
export function safeDisplayFilename(original: string, mime: MediaMime): string {
  // Display/download metadata only. Never use it as a storage key or filesystem path.
  const leaf = (original || 'attachment').split(/[\\/]/).pop() || 'attachment';
  const cleaned = Array.from(leaf, (character) => {
    const code = character.codePointAt(0)!;
    return code <= 31 ||
      (code >= 127 && code <= 159) ||
      (code >= 0x202a && code <= 0x202e) ||
      (code >= 0x2066 && code <= 0x2069) ||
      (code >= 0xd800 && code <= 0xdfff)
      ? '_'
      : character;
  })
    .join('')
    .replace(/^[\s.]+|[\s.]+$/g, '');
  const normalized = cleaned || 'attachment';
  // Disallow misleading trailing HTML/script/SVG extension for browser downloads.
  let base = (normalized.replace(/\.[^.]{1,12}$/, '') || 'attachment').slice(
    0,
    100,
  );
  // Cap the stem before adding its extension, so this sanitizer is idempotent.
  // Keep Unicode scalar boundaries when the cap lands inside an emoji.
  if (/[\uD800-\uDBFF]$/.test(base)) base = base.slice(0, -1);
  return `${base}.${extension(mime)}`;
}
function allowedMime(value: string): value is MediaMime {
  return (
    value === 'image/png' ||
    value === 'image/jpeg' ||
    value === 'image/webp' ||
    value === 'application/pdf'
  );
}
function sniffMime(b: Uint8Array): MediaMime {
  if (
    b.length >= 8 &&
    [137, 80, 78, 71, 13, 10, 26, 10].every((v, i) => b[i] === v)
  )
    return 'image/png';
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff)
    return 'image/jpeg';
  if (b.length >= 12 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP')
    return 'image/webp';
  if (b.length >= 5 && ascii(b, 0, 5) === '%PDF-') return 'application/pdf';
  fail(
    'UNSUPPORTED_TYPE',
    'Unsupported file signature; SVG, HTML and executable files are rejected.',
  );
}
function checkDeclaredMime(actual: MediaMime, declared: string): void {
  const norm = declared.trim().toLowerCase();
  if (norm && !allowedMime(norm))
    fail('UNSUPPORTED_TYPE', 'Declared media type is not permitted.');
  if (norm && norm !== actual)
    fail('MIME_MISMATCH', 'Declared media type contradicts the bytes.');
}
function validatePolicy(policy: InspectionPolicy): void {
  for (const n of [
    policy.maxImageBytes,
    policy.maxPdfBytes,
    policy.maxImagePixels,
  ]) {
    if (!Number.isSafeInteger(n) || n <= 0)
      throw new TypeError('Policy limits must be positive safe integers.');
  }
}
function checkLimits(
  mime: MediaMime,
  n: number,
  policy: InspectionPolicy,
): void {
  const max =
    mime === 'application/pdf' ? policy.maxPdfBytes : policy.maxImageBytes;
  if (n > max) fail('BYTE_LIMIT', 'Media exceeds the configured byte limit.');
}
function checkPixels(w: number, h: number, policy: InspectionPolicy): void {
  ensure(
    Number.isSafeInteger(w) && Number.isSafeInteger(h) && w >= 1 && h >= 1,
    'Invalid image dimensions.',
  );
  if (w * h > policy.maxImagePixels)
    fail('PIXEL_LIMIT', 'Image dimensions exceed the configured pixel limit.');
}
const crcTable = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let j = 0; j < 8; j++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  crcTable[i] = c >>> 0;
}
function crc32(b: Uint8Array, start: number, end: number): number {
  let c = 0xffffffff;
  for (let i = start; i < end; i++)
    c = crcTable[(c ^ b[i]!) & 255]! ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}
function parsePng(
  b: Uint8Array,
  policy: InspectionPolicy,
): { width: number; height: number } {
  ensure(b.length >= 8 + 25 + 12 + 12, 'PNG is too short.');
  let p = 8,
    ihdr = false,
    idat = false,
    ended = false,
    width = 0,
    height = 0;
  while (p < b.length) {
    ensure(p + 12 <= b.length, 'Truncated PNG chunk.');
    const len = readU32BE(b, p),
      type = ascii(b, p + 4, p + 8);
    ensure(
      len <= 0x7fffffff && p + 12 + len <= b.length,
      'Invalid PNG chunk bounds.',
    );
    const data = p + 8,
      crcAt = data + len;
    ensure(
      crc32(b, p + 4, crcAt) === readU32BE(b, crcAt),
      'PNG chunk CRC mismatch.',
    );
    if (!ihdr) ensure(type === 'IHDR' && len === 13, 'IHDR must be first.');
    if (type === 'IHDR') {
      ensure(!ihdr && len === 13, 'Repeated PNG IHDR.');
      ihdr = true;
      width = readU32BE(b, data);
      height = readU32BE(b, data + 4);
      checkPixels(width, height, policy);
      const depth = b[data + 8]!,
        color = b[data + 9]!;
      const valid: Readonly<Record<number, readonly number[]>> = {
        0: [1, 2, 4, 8, 16],
        2: [8, 16],
        3: [1, 2, 4, 8],
        4: [8, 16],
        6: [8, 16],
      };
      ensure(
        (valid[color] || []).includes(depth) &&
          b[data + 10] === 0 &&
          b[data + 11] === 0 &&
          (b[data + 12] === 0 || b[data + 12] === 1),
        'Invalid PNG image configuration.',
      );
    } else if (type === 'IDAT') {
      ensure(!ended, 'PNG data after end marker.');
      idat = true;
    } else if (type === 'IEND') {
      ensure(
        len === 0 && idat && p + 12 === b.length,
        'Invalid PNG end marker.',
      );
      ended = true;
    } else if (/^[A-Z]/.test(type) && type !== 'PLTE') {
      fail('MALFORMED_MEDIA', 'Unsupported critical PNG chunk.');
    }
    p += 12 + len;
    if (ended) break;
  }
  ensure(ihdr && idat && ended && p === b.length, 'Incomplete PNG container.');
  return { width, height };
}
function parseJpeg(
  b: Uint8Array,
  policy: InspectionPolicy,
): { width: number; height: number } {
  ensure(
    b.length >= 16 && b[0] === 0xff && b[1] === 0xd8,
    'Invalid JPEG start.',
  );
  let p = 2,
    inScan = false,
    foundSof = false,
    foundSos = false,
    width = 0,
    height = 0;
  while (p < b.length) {
    let marker: number | undefined;
    if (inScan) {
      while (p < b.length) {
        if (b[p++] !== 0xff) continue;
        while (p < b.length && b[p] === 0xff) p++;
        ensure(p < b.length, 'Truncated JPEG entropy sequence.');
        const value = b[p++]!;
        if (value === 0x00 || (value >= 0xd0 && value <= 0xd7)) continue;
        marker = value;
        inScan = false;
        break;
      }
      ensure(marker !== undefined, 'JPEG is missing an end marker.');
    } else {
      ensure(b[p++] === 0xff, 'Invalid JPEG marker prefix.');
      while (p < b.length && b[p] === 0xff) p++;
      ensure(p < b.length, 'Truncated JPEG marker.');
      marker = b[p++]!;
    }
    if (marker === 0xd9) {
      ensure(
        foundSof && foundSos && p === b.length,
        'Invalid JPEG end or trailing bytes.',
      );
      return { width, height };
    }
    ensure(
      marker !== 0xd8 && marker !== 0x00 && !(marker >= 0xd0 && marker <= 0xd7),
      'Unexpected JPEG marker.',
    );
    // Unsupported JPEG frames are rejected rather than pretending browser decode support.
    if (
      marker >= 0xc0 &&
      marker <= 0xcf &&
      marker !== 0xc4 &&
      marker !== 0xc8 &&
      marker !== 0xcc
    ) {
      ensure(
        marker === 0xc0 || marker === 0xc2,
        'Unsupported JPEG encoding mode.',
      );
    }
    const segmentLength = readU16BE(b, p);
    ensure(
      segmentLength >= 2 && p + segmentLength <= b.length,
      'Truncated JPEG segment.',
    );
    if (marker === 0xc0 || marker === 0xc2) {
      ensure(
        !foundSof && segmentLength >= 8 && b[p + 2] === 8,
        'Invalid JPEG frame.',
      );
      foundSof = true;
      height = readU16BE(b, p + 3);
      width = readU16BE(b, p + 5);
      checkPixels(width, height, policy);
    }
    if (marker === 0xda) {
      ensure(foundSof && segmentLength >= 6, 'JPEG scan has no frame.');
      foundSos = true;
      inScan = true;
    }
    p += segmentLength;
  }
  fail('MALFORMED_MEDIA', 'JPEG is missing its end marker.');
}
function parseWebp(
  b: Uint8Array,
  policy: InspectionPolicy,
): { width: number; height: number } {
  ensure(
    b.length >= 30 && ascii(b, 0, 4) === 'RIFF' && ascii(b, 8, 12) === 'WEBP',
    'Invalid WebP header.',
  );
  ensure(readU32LE(b, 4) === b.length - 8, 'WebP container length mismatch.');
  let p = 12,
    dims: { width: number; height: number } | null = null,
    imageSeen = false,
    vp8x = false;
  while (p < b.length) {
    ensure(p + 8 <= b.length, 'Truncated WebP chunk.');
    const type = ascii(b, p, p + 4),
      n = readU32LE(b, p + 4),
      d = p + 8;
    ensure(
      n <= b.length - d && d + n + (n & 1) <= b.length,
      'Invalid WebP chunk bounds.',
    );
    if (type === 'ANIM' || type === 'ANMF')
      fail(
        'UNSUPPORTED_TYPE',
        'Animated WebP is not supported by this static-image prototype.',
      );
    if (type === 'VP8X') {
      ensure(!vp8x && !imageSeen && n === 10, 'Invalid WebP extended header.');
      vp8x = true;
      ensure(
        (b[d]! & 0xc3) === 0 &&
          b[d + 1] === 0 &&
          b[d + 2] === 0 &&
          b[d + 3] === 0,
        'Reserved or animation WebP flags.',
      );
      dims = {
        width: 1 + b[d + 4]! + b[d + 5]! * 256 + b[d + 6]! * 65536,
        height: 1 + b[d + 7]! + b[d + 8]! * 256 + b[d + 9]! * 65536,
      };
      checkPixels(dims.width, dims.height, policy);
    }
    if (type === 'VP8 ' || type === 'VP8L') {
      ensure(!imageSeen, 'Multiple WebP image payloads.');
      imageSeen = true;
      let width: number;
      let height: number;
      if (type === 'VP8 ') {
        ensure(
          n >= 10 &&
            (b[d]! & 1) === 0 &&
            b[d + 3] === 0x9d &&
            b[d + 4] === 0x01 &&
            b[d + 5] === 0x2a,
          'Invalid WebP VP8 frame.',
        );
        width = readU16BE(Uint8Array.of(b[d + 7]!, b[d + 6]!), 0) & 0x3fff;
        height = readU16BE(Uint8Array.of(b[d + 9]!, b[d + 8]!), 0) & 0x3fff;
      } else {
        ensure(n >= 5 && b[d] === 0x2f, 'Invalid WebP VP8L frame.');
        const flags = readU32LE(b, d + 1);
        ensure(((flags >>> 29) & 7) === 0, 'Unknown WebP lossless version.');
        width = (flags & 0x3fff) + 1;
        height = ((flags >>> 14) & 0x3fff) + 1;
      }
      checkPixels(width, height, policy);
      if (dims)
        ensure(
          dims.width === width && dims.height === height,
          'WebP dimensions contradict extended header.',
        );
      dims = { width, height };
    }
    p = d + n + (n & 1);
  }
  ensure(
    p === b.length && imageSeen && dims !== null,
    'WebP is missing a complete image payload.',
  );
  return dims!;
}
function parsePdf(b: Uint8Array): void {
  ensure(
    b.length >= 16 &&
      ascii(b, 0, 5) === '%PDF-' &&
      b[5]! >= 49 &&
      b[5]! <= 50 &&
      b[6] === 0x2e &&
      b[7]! >= 48 &&
      b[7]! <= 57,
    'Invalid PDF header.',
  );
  // Plausibility only, not a PDF interpreter. Never inline-render in untrusted preview.
  const tail = ascii(b, Math.max(0, b.length - 2048), b.length);
  ensure(/%%EOF(?:\s*)$/.test(tail), 'PDF end marker missing.');
}
function toHex(b: Uint8Array): string {
  return Array.from(b, (n) => n.toString(16).padStart(2, '0')).join('');
}

/** Inspect immutable bytes without touching document source or persistent stores. */
export async function inspectMediaBytes(
  bytes: Uint8Array,
  originalName: string,
  declaredMime: string,
  policy: InspectionPolicy,
): Promise<AssetInspection> {
  validatePolicy(policy);
  if (!(bytes instanceof Uint8Array))
    throw new TypeError('Expected Uint8Array bytes.');
  if (bytes.byteLength === 0)
    fail('EMPTY_FILE', 'Empty asset is not supported.');
  // First cap applies before even sniffing the entire byte buffer.
  if (bytes.byteLength > Math.max(policy.maxImageBytes, policy.maxPdfBytes))
    fail('BYTE_LIMIT', 'Asset exceeds all configured limits.');
  const mime = sniffMime(bytes);
  checkDeclaredMime(mime, declaredMime);
  checkLimits(mime, bytes.byteLength, policy);
  let dim: { width: number; height: number } | undefined;
  if (mime === 'image/png') dim = parsePng(bytes, policy);
  if (mime === 'image/jpeg') dim = parseJpeg(bytes, policy);
  if (mime === 'image/webp') dim = parseWebp(bytes, policy);
  if (mime === 'application/pdf') parsePdf(bytes);
  // Copy exactly these bytes: no source normalization, hidden truncation or implicit transcoding.
  const digest = await globalThis.crypto.subtle.digest(
    'SHA-256',
    new Uint8Array(bytes),
  );
  const hash = toHex(new Uint8Array(digest));
  return Object.freeze({
    id: `sha256:${hash}`,
    sha256: hash,
    mime,
    byteLength: bytes.byteLength,
    safeName: safeDisplayFilename(originalName, mime),
    ...(dim || {}),
    requiresDecodeCheck: mime !== 'application/pdf',
    downloadOnly: mime === 'application/pdf',
  });
}

/** Browser adapter: preflight File.size and magic bytes before allocating full file. */
export async function inspectMediaFile(
  file: File,
  policy: InspectionPolicy,
  signal?: AbortSignal,
): Promise<AssetInspection> {
  validatePolicy(policy);
  if (signal?.aborted) fail('ABORTED', 'Import was cancelled.');
  if (file.size === 0) fail('EMPTY_FILE', 'Empty asset is not supported.');
  if (file.size > Math.max(policy.maxImageBytes, policy.maxPdfBytes))
    fail('BYTE_LIMIT', 'Asset exceeds all configured limits.');
  const prefix = new Uint8Array(await file.slice(0, 16).arrayBuffer());
  if (signal?.aborted) fail('ABORTED', 'Import was cancelled.');
  const mime = sniffMime(prefix);
  checkDeclaredMime(mime, file.type);
  checkLimits(mime, file.size, policy);
  const all = new Uint8Array(await file.arrayBuffer());
  if (signal?.aborted) fail('ABORTED', 'Import was cancelled.');
  if (all.byteLength !== file.size)
    fail('MALFORMED_MEDIA', 'Asset size changed while reading.');
  return inspectMediaBytes(all, file.name, file.type, policy);
}
