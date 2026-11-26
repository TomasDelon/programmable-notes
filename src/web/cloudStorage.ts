import { verifyAssetCatalog } from '../assets/catalog';
import type { BackupRecovery } from '../backup/portable';
import { recoveryDigest } from '../documents/recovery';
import {
  RecoveryReadUnavailableError,
  WorkspaceConflictError,
  type RetainedAttempt,
  type StoredWorkspace,
} from './persistence';
import { validateWebState, type WebState } from './workspace';

const CHUNK_BYTES = 1024 * 1024;
const MAX_INVENTORY_BYTES = 96 * CHUNK_BYTES;
const MAX_RECOVERY = 5;
const MAX_RECOVERY_BYTES = 32 * CHUNK_BYTES;
const RECOVERY_INTERVAL = 30_000;
const MAX_HEAD_RETRIES = 3;
const REQUEST_TIMEOUT_MS = 30_000;
const CHECKSUM = /^[a-f0-9]{64}$/;
const encoder = new TextEncoder();
const decoder = new TextDecoder('utf-8', { fatal: true });

interface Descriptor {
  checksum: string;
  byteSize: number;
  chunks: string[];
}
interface Manifest extends Descriptor {
  id: string;
}
type Head =
  { version: 0; manifest: null } | { version: number; manifest: Manifest };

interface Inventory {
  version: 1;
  current: StoredWorkspace | null;
  recovery: StoredWorkspace[];
  attempts: RetainedAttempt[];
}

class CloudUnavailableError extends Error {}
class CloudTransportError extends CloudUnavailableError {}
class MissingCloudChunkError extends Error {}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function hasFields(value: Record<string, unknown>, fields: string[]) {
  return (
    Object.keys(value).length === fields.length &&
    fields.every((field) => Object.hasOwn(value, field))
  );
}

function integer(value: unknown, minimum: number): value is number {
  return (
    typeof value === 'number' && Number.isSafeInteger(value) && value >= minimum
  );
}

function checksum(value: unknown): value is string {
  return typeof value === 'string' && CHECKSUM.test(value);
}

function manifestId(value: unknown): value is string {
  return typeof value === 'string' && /^[a-zA-Z0-9_-]{1,128}$/.test(value);
}

function readHead(value: unknown): Head {
  if (record(value) && value.version === 0 && value.manifest === null)
    return { version: 0, manifest: null };
  if (record(value) && integer(value.version, 1) && record(value.manifest)) {
    const { id, checksum: digest, byteSize, chunks } = value.manifest;
    if (
      manifestId(id) &&
      checksum(digest) &&
      integer(byteSize, 1) &&
      byteSize <= MAX_INVENTORY_BYTES &&
      Array.isArray(chunks) &&
      chunks.length === Math.ceil(byteSize / CHUNK_BYTES) &&
      chunks.every(checksum)
    )
      return {
        version: value.version,
        manifest: { id, checksum: digest, byteSize, chunks },
      };
  }
  throw new Error('The cloud workspace manifest failed validation.');
}

async function hash(bytes: Uint8Array<ArrayBuffer>) {
  const digest = await crypto.subtle.digest('SHA-256', bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}

async function readBytes(response: Response, limit: number) {
  const reader = response.body?.getReader();
  if (!reader) return new Uint8Array();
  const bytes = new Uint8Array(limit);
  let length = 0;
  try {
    for (;;) {
      const result = await reader.read().catch((cause: unknown) => {
        throw new CloudTransportError(
          'The cloud storage response was interrupted. Check your connection and retry.',
          { cause },
        );
      });
      if (result.done) return bytes.subarray(0, length);
      if (result.value.byteLength > limit - length) {
        void reader.cancel().catch(() => {});
        throw new Error('Cloud storage sent a response larger than expected.');
      }
      bytes.set(result.value, length);
      length += result.value.byteLength;
    }
  } finally {
    reader.releaseLock();
  }
}

async function readJson(response: Response): Promise<unknown> {
  // A manifest has at most 96 chunk hashes.
  const bytes = await readBytes(response, 8192);
  try {
    return JSON.parse(decoder.decode(bytes));
  } catch (cause) {
    throw new Error('The cloud storage response was unreadable.', { cause });
  }
}

async function fingerprint(state: WebState) {
  const bytes = encoder.encode(JSON.stringify(state));
  return { checksum: await hash(bytes), byteSize: bytes.byteLength };
}

async function verifySnapshot(value: unknown): Promise<StoredWorkspace> {
  if (
    !record(value) ||
    !hasFields(value, [
      'revision',
      'updated',
      'checksum',
      'byteSize',
      'state',
    ]) ||
    !integer(value.revision, 1) ||
    typeof value.updated !== 'number' ||
    !Number.isFinite(value.updated) ||
    value.updated < 0 ||
    !checksum(value.checksum) ||
    !integer(value.byteSize, 1)
  )
    throw new Error('The cloud workspace metadata failed its integrity check.');
  const { revision, updated, checksum: digest, byteSize } = value;
  const state = validateWebState(value.state);
  const integrity = await fingerprint(state);
  if (integrity.checksum !== digest || integrity.byteSize !== byteSize)
    throw new Error('The cloud workspace record failed its integrity check.');
  await verifyAssetCatalog(state.assets);
  return { revision, updated, checksum: digest, byteSize, state };
}

function attemptPayload(attempt: RetainedAttempt) {
  return JSON.stringify([
    attempt.id,
    attempt.documentKey,
    attempt.baseRevision,
    attempt.baseChecksum,
    attempt.text,
    attempt.updated,
  ]);
}

async function verifyAttempt(value: unknown): Promise<RetainedAttempt> {
  if (
    record(value) &&
    hasFields(value, [
      'id',
      'documentKey',
      'baseRevision',
      'baseChecksum',
      'text',
      'updated',
      'checksum',
    ]) &&
    typeof value.id === 'string' &&
    /^[0-9a-f-]{36}$/i.test(value.id) &&
    typeof value.documentKey === 'string' &&
    value.documentKey.length > 0 &&
    value.documentKey.length <= 512 &&
    integer(value.baseRevision, 0) &&
    checksum(value.baseChecksum) &&
    typeof value.text === 'string' &&
    value.text.length <= MAX_RECOVERY_BYTES &&
    integer(value.updated, 0) &&
    checksum(value.checksum)
  ) {
    const attempt: RetainedAttempt = {
      id: value.id,
      documentKey: value.documentKey,
      baseRevision: value.baseRevision,
      baseChecksum: value.baseChecksum,
      text: value.text,
      updated: value.updated,
      checksum: value.checksum,
    };
    if ((await recoveryDigest(attemptPayload(attempt))) === attempt.checksum)
      return attempt;
  }
  throw new Error('A retained edit failed its integrity check.');
}

function matchingAttempt(
  attempts: RetainedAttempt[],
  reviewed: RetainedAttempt,
) {
  const match = attempts.find((attempt) => attempt.id === reviewed.id);
  if (
    !match ||
    match.checksum !== reviewed.checksum ||
    attemptPayload(match) !== attemptPayload(reviewed)
  )
    throw new Error(
      'The retained edit changed in storage. Refresh recovery history and try again.',
    );
}

function attemptBytes(attempts: RetainedAttempt[]) {
  return encoder.encode(JSON.stringify(attempts)).byteLength;
}

async function verifyInventory(value: unknown): Promise<Inventory> {
  if (
    !record(value) ||
    !hasFields(value, ['version', 'current', 'recovery', 'attempts']) ||
    value.version !== 1 ||
    !Array.isArray(value.recovery) ||
    value.recovery.length > MAX_RECOVERY ||
    !Array.isArray(value.attempts) ||
    value.attempts.length > MAX_RECOVERY
  )
    throw new Error('The cloud workspace inventory format is invalid.');

  const current =
    value.current === null ? null : await verifySnapshot(value.current);
  const recovery: StoredWorkspace[] = [];
  let recoveryBytes = 0;
  for (const item of value.recovery) {
    const version = await verifySnapshot(item);
    recoveryBytes += version.byteSize;
    if (
      !current ||
      version.revision >= current.revision ||
      recovery.some(({ revision }) => revision === version.revision) ||
      recoveryBytes > MAX_RECOVERY_BYTES
    )
      throw new Error('The cloud recovery inventory is invalid.');
    recovery.push(version);
  }
  const attempts: RetainedAttempt[] = [];
  for (const item of value.attempts) {
    const attempt = await verifyAttempt(item);
    if (attempts.some(({ id }) => id === attempt.id))
      throw new Error('The cloud retained-edit inventory is invalid.');
    attempts.push(attempt);
  }
  if (attemptBytes(attempts) > MAX_RECOVERY_BYTES)
    throw new Error('The cloud retained-edit inventory exceeds its limit.');
  return { version: 1, current, recovery, attempts };
}

function recoveryContent(state: WebState) {
  return JSON.stringify({
    files: state.workspace.files,
    documents: state.documents,
    folders: state.folders,
    assets: state.assets,
  });
}

function retainRecovery(recovery: StoredWorkspace[]) {
  let bytes = 0;
  return recovery
    .sort((a, b) => b.revision - a.revision)
    .filter((item, index) => {
      bytes += item.byteSize;
      return index < MAX_RECOVERY && bytes <= MAX_RECOVERY_BYTES;
    });
}

export function createCloudStorage(
  fetcher: typeof fetch = (...args) => fetch(...args),
) {
  let queuedWrite: Promise<void> = Promise.resolve();

  async function request(path: string, init: RequestInit = {}) {
    const headers = new Headers(init.headers);
    headers.set('X-Programmable-Notes', 'storage-v1');
    // Fetch keeps this signal active while the caller consumes the body.
    const timeout = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;
    let response: Response;
    try {
      response = await fetcher('/api/storage/' + path, {
        ...init,
        headers,
        signal,
        credentials: 'same-origin',
        cache: 'no-store',
        redirect: 'error',
      });
    } catch (cause) {
      throw new CloudTransportError(
        timeout.aborted
          ? 'Cloud storage took too long to respond. Retry while keeping this tab open.'
          : 'Could not reach cloud storage. Check your connection or sign in again and retry.',
        { cause },
      );
    }
    if (
      response.redirected ||
      response.type === 'opaqueredirect' ||
      response.status === 401 ||
      response.status === 403 ||
      (response.status >= 300 && response.status < 400) ||
      response.headers.get('Content-Type')?.includes('text/html')
    )
      throw new CloudUnavailableError(
        'Sign in to the private workspace again, then retry.',
      );
    if (response.status === 429 || response.status >= 500)
      throw new CloudUnavailableError(
        'Cloud storage is unavailable. Retry while keeping this tab open.',
      );
    return response;
  }

  function post(path: string, body: object) {
    return request(path, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
  }

  async function fetchHead() {
    const response = await request('head');
    if (!response.ok)
      throw new CloudUnavailableError(
        'The cloud workspace could not be opened. Check access and retry.',
      );
    return readHead(await readJson(response));
  }

  async function downloadInventory(
    manifest: Manifest | null,
  ): Promise<Inventory> {
    if (!manifest)
      return {
        version: 1,
        current: null,
        recovery: [],
        attempts: [],
      };
    const { byteSize, chunks, checksum } = manifest;
    const bytes = new Uint8Array(byteSize);
    let offset = 0;
    for (const chunk of chunks) {
      const length = Math.min(CHUNK_BYTES, byteSize - offset);
      const result = await request('chunks/' + chunk);
      if (result.status === 404)
        throw new MissingCloudChunkError(
          'A saved cloud workspace chunk is missing.',
        );
      if (!result.ok)
        throw new Error('Cloud storage could not read a workspace chunk.');
      const part = await readBytes(result, length);
      if (part.byteLength !== length || (await hash(part)) !== chunk)
        throw new Error(
          'A saved cloud workspace chunk failed its integrity check.',
        );
      bytes.set(part, offset);
      offset += length;
    }
    if ((await hash(bytes)) !== checksum)
      throw new Error(
        'The cloud workspace inventory failed its integrity check.',
      );
    let contents: unknown;
    try {
      contents = JSON.parse(decoder.decode(bytes));
    } catch (cause) {
      throw new Error('The cloud workspace inventory is unreadable.', {
        cause,
      });
    }
    return verifyInventory(contents);
  }

  async function read() {
    let head = await fetchHead();
    for (let retry = 0; ; retry++) {
      try {
        return { head, inventory: await downloadInventory(head.manifest) };
      } catch (reason) {
        // A publication may reclaim chunks from the previous head while a
        // download is in flight. A missing chunk on the same head is damage.
        if (
          !(reason instanceof MissingCloudChunkError) ||
          retry >= MAX_HEAD_RETRIES
        )
          throw reason;
        const latest = await fetchHead();
        if (latest.version <= head.version) throw reason;
        head = latest;
      }
    }
  }

  async function commit(head: Head, inventory: Inventory): Promise<boolean> {
    const bytes = encoder.encode(JSON.stringify(inventory));
    if (bytes.byteLength > MAX_INVENTORY_BYTES)
      throw new Error('The cloud workspace exceeds its 96 MiB storage limit.');

    const parts = new Map<string, Uint8Array<ArrayBuffer>>();
    const chunks: string[] = [];
    for (let offset = 0; offset < bytes.byteLength; offset += CHUNK_BYTES) {
      const part = bytes.subarray(offset, offset + CHUNK_BYTES);
      const digest = await hash(part);
      parts.set(digest, part);
      chunks.push(digest);
    }
    const descriptor: Descriptor = {
      checksum: await hash(bytes),
      byteSize: bytes.byteLength,
      chunks,
    };
    const started = await post('stage', descriptor);
    if (!started.ok)
      throw new Error('Cloud storage could not prepare the save.');
    const stage = await readJson(started);
    if (!record(stage) || !manifestId(stage.id))
      throw new Error('Cloud storage did not confirm save preparation.');

    let missing = [...parts.keys()].filter(
      (key) => !head.manifest?.chunks.includes(key),
    );
    if (stage.missing !== undefined) {
      if (
        !Array.isArray(stage.missing) ||
        stage.missing.length > parts.size ||
        new Set(stage.missing).size !== stage.missing.length ||
        !stage.missing.every((key) => checksum(key) && parts.has(key))
      )
        throw new Error('Cloud storage sent an invalid upload request.');
      missing = stage.missing;
    }
    for (const key of missing) {
      const uploaded = await request('chunks/' + key, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: parts.get(key)!,
      });
      if (!uploaded.ok)
        throw new Error('Cloud storage could not upload a workspace chunk.');
    }
    try {
      return await publish(head.version, stage.id, descriptor);
    } catch (reason) {
      if (!(reason instanceof CloudTransportError)) throw reason;
      // The publication may have succeeded before the connection dropped.
      // Only the same staged manifest can prove its acknowledgment on replay.
      return publish(head.version, stage.id, descriptor);
    }
  }

  async function publish(
    expectedVersion: number,
    manifestId: string,
    descriptor: Descriptor,
  ): Promise<boolean> {
    const result = await post('commit', { expectedVersion, manifestId });
    if (result.status === 409) return false;
    if (result.status === 422)
      throw new Error('The cloud save was incomplete. Retry the save.');
    if (!result.ok) throw new Error('Cloud storage could not commit the save.');
    const acknowledgment = readHead(await readJson(result));
    const manifest = acknowledgment.manifest;
    if (
      acknowledgment.version !== expectedVersion + 1 ||
      !manifest ||
      manifest.id !== manifestId ||
      manifest.checksum !== descriptor.checksum ||
      manifest.byteSize !== descriptor.byteSize ||
      manifest.chunks.some((item, index) => item !== descriptor.chunks[index])
    )
      throw new Error('Cloud storage did not confirm this workspace save.');
    return true;
  }

  function serialize<T>(work: () => Promise<T>): Promise<T> {
    const task = queuedWrite.then(work);
    queuedWrite = task.then(
      () => undefined,
      () => undefined,
    );
    return task;
  }

  async function change<T>(
    apply: (inventory: Inventory) => {
      next: Inventory;
      result: T;
    },
  ): Promise<T> {
    for (let retry = 0; retry <= MAX_HEAD_RETRIES; retry++) {
      const { head, inventory } = await read();
      const { next, result } = apply(inventory);
      if (next === inventory || (await commit(head, next))) return result;
    }
    throw new Error(
      'Cloud storage changed repeatedly during the save. Your edits are retained here. Retry the save.',
    );
  }

  async function writeWorkspace(
    state: WebState,
    expectedRevision: number,
    forceRecovery = false,
    importedRecovery: readonly BackupRecovery[] = [],
    consumeAttempt?: RetainedAttempt,
  ): Promise<StoredWorkspace> {
    return serialize(async () => {
      if (!integer(expectedRevision, 0))
        throw new Error('Invalid cloud workspace revision.');
      if (consumeAttempt) await verifyAttempt(consumeAttempt);
      if (importedRecovery.length > MAX_RECOVERY)
        throw new Error(
          'Too many recovery checkpoints in the restored backup.',
        );
      const snapshot = validateWebState(structuredClone(state));
      await verifyAssetCatalog(snapshot.assets);
      const integrity = await fingerprint(snapshot);
      const imported: StoredWorkspace[] = [];
      let bytes = 0;
      for (const checkpoint of importedRecovery) {
        if (!Number.isFinite(checkpoint.updated) || checkpoint.updated < 0)
          throw new Error('Invalid recovery checkpoint date.');
        const restored = validateWebState(structuredClone(checkpoint.state));
        await verifyAssetCatalog(restored.assets);
        const digest = await fingerprint(restored);
        bytes += digest.byteSize;
        if (bytes > MAX_RECOVERY_BYTES)
          throw new Error(
            'Recovery checkpoints exceed the 32 MiB recovery budget.',
          );
        imported.push({
          revision: expectedRevision + imported.length + 1,
          updated: checkpoint.updated,
          state: restored,
          ...digest,
        });
      }
      const revision = expectedRevision + imported.length + 1;
      if (!integer(revision, 1))
        throw new Error('Invalid cloud workspace revision.');
      return change((inventory) => {
        const { current, recovery, attempts } = inventory;
        if ((current?.revision ?? 0) !== expectedRevision)
          throw new WorkspaceConflictError();
        if (consumeAttempt) matchingAttempt(attempts, consumeAttempt);
        const checkpoints = [...recovery, ...imported];
        const latest = recovery.reduce<StoredWorkspace | undefined>(
          (newest, item) =>
            !newest || item.revision > newest.revision ? item : newest,
          undefined,
        );
        if (
          current &&
          recoveryContent(current.state) !== recoveryContent(snapshot) &&
          (forceRecovery ||
            !latest ||
            current.updated - latest.updated >= RECOVERY_INTERVAL)
        )
          checkpoints.push(current);

        const saved: StoredWorkspace = {
          revision,
          updated: Date.now(),
          state: snapshot,
          ...integrity,
        };
        return {
          next: {
            version: 1,
            current: saved,
            recovery: retainRecovery(checkpoints),
            attempts: consumeAttempt
              ? attempts.filter(({ id }) => id !== consumeAttempt.id)
              : attempts,
          },
          result: saved,
        };
      });
    });
  }

  async function writeRetainedAttempt(
    documentKey: string,
    baseRevision: number,
    baseSource: string,
    text: string,
    previous?: RetainedAttempt,
  ): Promise<RetainedAttempt> {
    return serialize(async () => {
      if (text.length > MAX_RECOVERY_BYTES)
        throw new Error(
          'The retained edit exceeds the 32 MiB recovery budget.',
        );
      const attempt: RetainedAttempt = {
        id: crypto.randomUUID(),
        documentKey,
        baseRevision,
        baseChecksum: await recoveryDigest(baseSource),
        text,
        updated: Date.now(),
        checksum: '',
      };
      attempt.checksum = await recoveryDigest(attemptPayload(attempt));
      await verifyAttempt(attempt);
      return change((inventory) => {
        // A competing publication may already include our retained edit
        // after the commit acknowledgment was lost.
        for (const reviewed of [attempt, previous]) {
          if (
            reviewed &&
            inventory.attempts.some(({ id }) => id === reviewed.id)
          ) {
            matchingAttempt(inventory.attempts, reviewed);
            return { next: inventory, result: reviewed };
          }
        }
        const attempts = [...inventory.attempts, attempt];
        if (
          attempts.length > MAX_RECOVERY ||
          attemptBytes(attempts) > MAX_RECOVERY_BYTES
        )
          throw new Error(
            'Retained-edit storage is full. Download the live draft or review the other retained edits.',
          );
        return { next: { ...inventory, attempts }, result: attempt };
      });
    });
  }

  return {
    async readWorkspace() {
      return (await read()).inventory.current;
    },
    async readWorkspaceRevision() {
      return (await read()).inventory.current?.revision ?? 0;
    },
    writeWorkspace,
    async readRecoverySnapshots(): Promise<BackupRecovery[]> {
      try {
        return (await read()).inventory.recovery
          .sort((a, b) => a.revision - b.revision)
          .map(({ updated, state }) => ({ updated, state }));
      } catch (reason) {
        if (reason instanceof CloudUnavailableError)
          throw new RecoveryReadUnavailableError(reason);
        throw reason;
      }
    },
    async listRecoveryVersions() {
      return (await read()).inventory.recovery
        .sort((a, b) => b.revision - a.revision)
        .map(({ revision, updated }) => ({ revision, updated }));
    },
    async readRecoveryVersion(revision: number) {
      const { inventory } = await read();
      const version = inventory.recovery.find(
        (item) => item.revision === revision,
      );
      if (!version)
        throw new Error('This cloud recovery version is unavailable.');
      return version;
    },
    async readRetainedAttempts() {
      const { inventory } = await read();
      return {
        attempts: inventory.attempts.sort((a, b) => b.updated - a.updated),
        error: '',
      };
    },
    writeRetainedAttempt,
    async deleteRetainedAttempt(attempt: RetainedAttempt) {
      return serialize(() =>
        change((inventory) => {
          if (!inventory.attempts.some(({ id }) => id === attempt.id))
            return { next: inventory, result: undefined };
          matchingAttempt(inventory.attempts, attempt);
          return {
            next: {
              ...inventory,
              attempts: inventory.attempts.filter(
                ({ id }) => id !== attempt.id,
              ),
            },
            result: undefined,
          };
        }),
      );
    },
  };
}
