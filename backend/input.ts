import {
  CHUNK_BYTES,
  HASH,
  INVENTORY_BYTES,
  StorageFailure,
  type ManifestInput,
} from './types';

export async function boundedBytes(
  body: ReadableStream<Uint8Array> | null,
  limit: number,
) {
  if (!body) throw new StorageFailure(400, 'Missing request body.');
  const reader = body.getReader();
  const pieces: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > limit) {
        await reader.cancel().catch(() => {});
        throw new StorageFailure(413, 'Request exceeds the storage limit.');
      }
      pieces.push(value);
    }
  } finally {
    reader.releaseLock();
  }
  const bytes = new Uint8Array(size);
  let position = 0;
  for (const piece of pieces) {
    bytes.set(piece, position);
    position += piece.byteLength;
  }
  return bytes;
}
export async function requestBytes(request: Request, limit: number) {
  const length = request.headers.get('Content-Length');
  if (length !== null && (!/^\d+$/.test(length) || Number(length) > limit))
    throw new StorageFailure(413, 'Request exceeds the storage limit.');
  return boundedBytes(request.body, limit);
}
export async function requestJson(
  request: Request,
  limit: number,
): Promise<unknown> {
  try {
    return JSON.parse(
      new TextDecoder('utf-8', { fatal: true }).decode(
        await requestBytes(request, limit),
      ),
    );
  } catch (error) {
    if (error instanceof StorageFailure) throw error;
    throw new StorageFailure(400, 'Invalid storage request.');
  }
}
export function fields(
  value: unknown,
  keys: string[],
): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    !Array.isArray(value) &&
    Object.keys(value).length === keys.length &&
    keys.every((key) => Object.hasOwn(value, key))
  );
}
export function manifestInput(value: unknown): ManifestInput {
  if (
    !fields(value, ['checksum', 'byteSize', 'chunks']) ||
    typeof value.checksum !== 'string' ||
    !HASH.test(value.checksum) ||
    !Number.isSafeInteger(value.byteSize) ||
    (value.byteSize as number) < 1 ||
    (value.byteSize as number) > INVENTORY_BYTES ||
    !Array.isArray(value.chunks) ||
    value.chunks.length !==
      Math.ceil((value.byteSize as number) / CHUNK_BYTES) ||
    value.chunks.some((hash) => typeof hash !== 'string' || !HASH.test(hash))
  )
    throw new StorageFailure(400, 'Invalid storage manifest.');
  return value as unknown as ManifestInput;
}
