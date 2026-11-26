import { validateWebState, type WebState } from './workspace';
import { verifyAssetCatalog } from '../assets/catalog';
import { recoveryDigest } from '../documents/recovery';
import type { BackupRecovery } from '../backup/portable';

export const WEB_DATABASE_NAME = 'programmable-notes-web-v1';
const DATABASE_VERSION = 1;
const MAX_RECOVERY = 5;
const MAX_RECOVERY_BYTES = 32 * 1024 * 1024;
const RECOVERY_INTERVAL = 30_000;

export interface StoredWorkspace {
  revision: number;
  updated: number;
  checksum: string;
  byteSize: number;
  state: WebState;
}

/** Storage access failed; validation/integrity errors deliberately use other errors. */
export class RecoveryReadUnavailableError extends Error {
  constructor(cause: unknown) {
    super('Browser recovery history could not be read.', { cause });
    this.name = 'RecoveryReadUnavailableError';
  }
}

export class WorkspaceConflictError extends Error {
  constructor() {
    super(
      'Another tab saved this workspace. Your edits are retained here. Export a backup before reloading the saved workspace.',
    );
    this.name = 'WorkspaceConflictError';
  }
}

function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(
        new Error(
          'Browser storage is unavailable. Your workspace cannot be saved in this browser.',
        ),
      );
      return;
    }
    const request = indexedDB.open(WEB_DATABASE_NAME, DATABASE_VERSION);
    let finished = false;
    const timer = setTimeout(() => {
      finished = true;
      reject(
        new Error(
          'Browser storage did not respond. Close older tabs and retry.',
        ),
      );
    }, 10_000);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains('workspace'))
        database.createObjectStore('workspace');
      if (!database.objectStoreNames.contains('recovery'))
        database.createObjectStore('recovery', { keyPath: 'revision' });
    };
    request.onerror = () => {
      clearTimeout(timer);
      finished = true;
      reject(
        new Error(
          'Browser storage could not be opened. Existing data was not replaced.',
        ),
      );
    };
    request.onblocked = () => {
      clearTimeout(timer);
      finished = true;
      reject(
        new Error(
          'Another tab is blocking browser storage. Close it and retry.',
        ),
      );
    };
    request.onsuccess = () => {
      clearTimeout(timer);
      if (finished) {
        request.result.close();
        return;
      }
      request.result.onversionchange = () => request.result.close();
      resolve(request.result);
    };
  });
}

async function fingerprint(
  state: WebState,
): Promise<{ checksum: string; byteSize: number }> {
  const bytes = new TextEncoder().encode(JSON.stringify(state));
  const hash = new Uint8Array(await crypto.subtle.digest('SHA-256', bytes));
  return {
    checksum: Array.from(hash, (byte) =>
      byte.toString(16).padStart(2, '0'),
    ).join(''),
    byteSize: bytes.byteLength,
  };
}

function requestValue<T>(request: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () =>
      reject(request.error ?? new Error('Browser storage could not be read.'));
  });
}

async function verifyStored(value: unknown): Promise<StoredWorkspace> {
  if (!value || typeof value !== 'object')
    throw new Error(
      'The saved workspace is unreadable. Restore a backup or an earlier recovery version.',
    );
  const record = value as Partial<StoredWorkspace>;
  if (
    !Number.isSafeInteger(record.revision) ||
    record.revision! < 1 ||
    typeof record.updated !== 'number' ||
    !Number.isFinite(record.updated) ||
    typeof record.checksum !== 'string'
  ) {
    throw new Error(
      'The saved workspace metadata is damaged. Existing data was not replaced.',
    );
  }
  const state = validateWebState(record.state);
  const integrity = await fingerprint(state);
  if (
    integrity.checksum !== record.checksum ||
    integrity.byteSize !== record.byteSize
  ) {
    throw new Error(
      'The saved workspace failed its integrity check. Existing data was not replaced. Restore a recovery version or a backup.',
    );
  }
  await verifyAssetCatalog(state.assets);
  return record as StoredWorkspace;
}

export async function readWorkspace(): Promise<StoredWorkspace | null> {
  const database = await openDatabase();
  try {
    const value: unknown = await requestValue(
      database
        .transaction('workspace', 'readonly')
        .objectStore('workspace')
        .get('current'),
    );
    return value === undefined ? null : await verifyStored(value);
  } finally {
    database.close();
  }
}

function recoveryContent(state: WebState): string {
  return JSON.stringify({
    files: state.workspace.files,
    documents: state.documents,
    folders: state.folders,
    assets: state.assets,
  });
}

/** Refused rendered edits have their own bounded inventory, outside the canonical
 * workspace record and its portable history. The document key is only a label.
 */
const ATTEMPTS_KEY = 'retained-edits-v1';

export interface RetainedAttempt {
  id: string;
  documentKey: string;
  baseRevision: number;
  baseChecksum: string;
  text: string;
  updated: number;
  checksum: string;
}

function attemptPayload(attempt: RetainedAttempt) {
  const { id, documentKey, baseRevision, baseChecksum, text, updated } =
    attempt;
  return JSON.stringify([
    id,
    documentKey,
    baseRevision,
    baseChecksum,
    text,
    updated,
  ]);
}

function attemptRows(value: unknown): RetainedAttempt[] {
  if (value === undefined) return [];
  if (!Array.isArray(value) || value.length > MAX_RECOVERY)
    throw new Error(
      'The retained-edit inventory is damaged. It has been preserved.',
    );
  return value as RetainedAttempt[];
}

async function verifyAttempt(attempt: RetainedAttempt): Promise<void> {
  if (
    !attempt ||
    typeof attempt !== 'object' ||
    typeof attempt.id !== 'string' ||
    !/^[0-9a-f-]{36}$/i.test(attempt.id) ||
    typeof attempt.documentKey !== 'string' ||
    !attempt.documentKey ||
    attempt.documentKey.length > 512 ||
    !Number.isSafeInteger(attempt.baseRevision) ||
    attempt.baseRevision < 0 ||
    typeof attempt.baseChecksum !== 'string' ||
    !/^[a-f0-9]{64}$/.test(attempt.baseChecksum) ||
    typeof attempt.text !== 'string' ||
    attempt.text.length > MAX_RECOVERY_BYTES ||
    !Number.isSafeInteger(attempt.updated) ||
    attempt.updated < 0 ||
    (await recoveryDigest(attemptPayload(attempt))) !== attempt.checksum
  )
    throw new Error(
      'A retained edit failed its integrity check. Its data has been preserved.',
    );
}

export async function readRetainedAttempts() {
  const database = await openDatabase();
  let rows: RetainedAttempt[];
  try {
    rows = attemptRows(
      await requestValue(
        database
          .transaction('workspace', 'readonly')
          .objectStore('workspace')
          .get(ATTEMPTS_KEY),
      ),
    );
  } finally {
    database.close();
  }
  const attempts: RetainedAttempt[] = [];
  let error = '';
  for (const row of rows) {
    try {
      await verifyAttempt(row);
      if (rows.filter((item) => item?.id === row.id).length !== 1)
        throw new Error(
          'A retained edit has a duplicate identifier. Its data has been preserved.',
        );
      attempts.push(row);
    } catch (reason) {
      error =
        reason instanceof Error
          ? reason.message
          : 'The retained edit is unreadable.';
    }
  }
  return { attempts: attempts.sort((a, b) => b.updated - a.updated), error };
}

function strictWrite(database: IDBDatabase, stores: string | string[]) {
  try {
    return database.transaction(stores, 'readwrite', { durability: 'strict' });
  } catch {
    return database.transaction(stores, 'readwrite');
  }
}

function updateAttemptsInStore(
  store: IDBObjectStore,
  change: (rows: RetainedAttempt[]) => RetainedAttempt[],
  abort: (reason: unknown) => void,
) {
  const read = store.get(ATTEMPTS_KEY);
  read.onsuccess = () => {
    try {
      const rows = attemptRows(read.result);
      const next = change(rows);
      if (next !== rows) store.put(next, ATTEMPTS_KEY);
    } catch (reason) {
      abort(reason);
    }
  };
}

async function changeRetainedAttempts(
  change: (rows: RetainedAttempt[]) => RetainedAttempt[],
) {
  const database = await openDatabase();
  try {
    await new Promise<void>((resolve, reject) => {
      const transaction = strictWrite(database, 'workspace');
      let failure: unknown;
      transaction.oncomplete = () => resolve();
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new Error('The retained edit could not be saved.'),
        );
      updateAttemptsInStore(
        transaction.objectStore('workspace'),
        change,
        (reason) => {
          failure = reason;
          transaction.abort();
        },
      );
    });
  } finally {
    database.close();
  }
}

export async function writeRetainedAttempt(
  documentKey: string,
  baseRevision: number,
  baseSource: string,
  text: string,
  previous?: RetainedAttempt,
): Promise<RetainedAttempt> {
  const attempt: RetainedAttempt = {
    id: crypto.randomUUID(),
    documentKey,
    baseRevision,
    baseChecksum: await recoveryDigest(baseSource),
    text,
    updated: Date.now(),
    checksum: '',
  };
  if (text.length > MAX_RECOVERY_BYTES)
    throw new Error('The retained edit exceeds the 32 MiB recovery budget.');
  attempt.checksum = await recoveryDigest(attemptPayload(attempt));
  await verifyAttempt(attempt);
  let result = attempt;
  await changeRetainedAttempts((rows) => {
    if (previous && rows.some((row) => row?.id === previous.id)) {
      // The handoff and any competing discard are ordered by this transaction.
      // Reuse the reviewed entry only when its exact stored payload still matches.
      matchingAttempt(rows, previous);
      result = previous;
      return rows;
    }
    const next = [...rows, attempt];
    if (
      next.length > MAX_RECOVERY ||
      new TextEncoder().encode(JSON.stringify(next)).byteLength >
        MAX_RECOVERY_BYTES
    )
      throw new Error(
        'Retained-edit storage is full. Download the live draft or review the other retained edits.',
      );
    return next;
  });
  return result;
}

function matchingAttempt(rows: RetainedAttempt[], attempt: RetainedAttempt) {
  const matches = rows.filter((row) => row?.id === attempt.id);
  if (
    matches.length !== 1 ||
    matches[0]!.checksum !== attempt.checksum ||
    attemptPayload(matches[0]!) !== attemptPayload(attempt)
  )
    throw new Error(
      'The retained edit changed in storage. Refresh recovery history and try again.',
    );
}

function withoutAttempt(rows: RetainedAttempt[], attempt: RetainedAttempt) {
  matchingAttempt(rows, attempt);
  return rows.filter((row) => row?.id !== attempt.id);
}

export async function deleteRetainedAttempt(attempt: RetainedAttempt) {
  await changeRetainedAttempts((rows) =>
    rows.some((row) => row?.id === attempt.id)
      ? withoutAttempt(rows, attempt)
      : rows,
  );
}

/** Comparison and publication share one read/write transaction, including cross-tab writers. */
export async function writeWorkspace(
  state: WebState,
  expectedRevision: number,
  forceRecovery = false,
  importedRecovery: readonly BackupRecovery[] = [],
  consumeAttempt?: RetainedAttempt,
): Promise<StoredWorkspace> {
  validateWebState(state);
  if (consumeAttempt) await verifyAttempt(consumeAttempt);
  if (importedRecovery.length > MAX_RECOVERY)
    throw new Error('Too many recovery checkpoints in the restored backup.');
  await verifyAssetCatalog(state.assets);
  const integrity = await fingerprint(state);
  const preparedRecovery = await Promise.all(
    importedRecovery.map(async (item, index) => {
      if (!Number.isFinite(item.updated) || item.updated < 0)
        throw new Error('Invalid recovery checkpoint date.');
      validateWebState(item.state);
      await verifyAssetCatalog(item.state.assets);
      return {
        revision: expectedRevision + index + 1,
        updated: item.updated,
        state: item.state,
        ...(await fingerprint(item.state)),
      } satisfies StoredWorkspace;
    }),
  );
  if (
    preparedRecovery.reduce((sum, item) => sum + item.byteSize, 0) >
    MAX_RECOVERY_BYTES
  )
    throw new Error(
      'Recovery checkpoints exceed the 32 MiB recovery budget. Nothing was restored.',
    );
  const database = await openDatabase();
  try {
    return await new Promise<StoredWorkspace>((resolve, reject) => {
      const transaction = strictWrite(database, ['workspace', 'recovery']);
      const workspace = transaction.objectStore('workspace');
      const recovery = transaction.objectStore('recovery');
      const read = workspace.get('current');
      let failure: Error | null = null;
      let record: StoredWorkspace | null = null;
      transaction.oncomplete = () => {
        if (record) resolve(record);
        else reject(new Error('Browser storage did not confirm the save.'));
      };
      transaction.onerror = () => {
        failure ??=
          transaction.error ??
          new Error('Browser storage could not save the workspace.');
      };
      transaction.onabort = () =>
        reject(
          failure ??
            transaction.error ??
            new Error('The save was interrupted. Your edits are retained.'),
        );
      read.onsuccess = () => {
        try {
          const current = read.result as StoredWorkspace | undefined;
          if ((current?.revision ?? 0) !== expectedRevision) {
            failure = new WorkspaceConflictError();
            transaction.abort();
            return;
          }
          record = {
            revision: expectedRevision + preparedRecovery.length + 1,
            updated: Date.now(),
            state,
            ...integrity,
          };
          const history = recovery.getAll();
          history.onsuccess = () => {
            try {
              const previous = (history.result as StoredWorkspace[]).sort(
                (a, b) => b.revision - a.revision,
              );
              const latest = previous[0];
              // Navigation and appearance changes never crowd real source revisions out.
              // Closely spaced keystrokes keep the earlier checkpoint for useful recovery.
              let validCurrent = false;
              try {
                if (current) {
                  validateWebState(current.state);
                  validCurrent = true;
                }
              } catch {
                /* An explicit restore can replace damaged data without copying it into recovery. */
              }
              if (
                current &&
                validCurrent &&
                recoveryContent(current.state) !== recoveryContent(state) &&
                (forceRecovery ||
                  !latest ||
                  current.updated - latest.updated >= RECOVERY_INTERVAL)
              ) {
                recovery.put(current);
                previous.unshift(current);
              }
              // Restored recovery snapshots and the active state share the same
              // transaction. A quota error cannot leave a partially restored backup.
              for (const checkpoint of preparedRecovery) {
                recovery.put(checkpoint);
                previous.push(checkpoint);
              }
              previous.sort((a, b) => b.revision - a.revision);
              let retainedBytes = 0;
              for (let index = 0; index < previous.length; index++) {
                const item = previous[index]!;
                retainedBytes += item.byteSize;
                if (index >= MAX_RECOVERY || retainedBytes > MAX_RECOVERY_BYTES)
                  recovery.delete(item.revision);
              }
              if (consumeAttempt)
                updateAttemptsInStore(
                  workspace,
                  (rows) => withoutAttempt(rows, consumeAttempt),
                  (reason) => {
                    failure =
                      reason instanceof Error
                        ? reason
                        : new Error('The retained edit could not be restored.');
                    transaction.abort();
                  },
                );
              workspace.put(record, 'current');
            } catch (reason) {
              failure =
                reason instanceof Error || reason instanceof DOMException
                  ? reason
                  : new Error(
                      'The save failed. Your previous workspace is intact.',
                    );
              transaction.abort();
            }
          };
        } catch (reason) {
          failure =
            reason instanceof Error || reason instanceof DOMException
              ? reason
              : new Error(
                  'The save failed. Your previous workspace is intact.',
                );
          transaction.abort();
        }
      };
    });
  } finally {
    database.close();
  }
}

/** Read a coherent recovery inventory, then verify every snapshot before export. */
export async function readRecoverySnapshots(): Promise<BackupRecovery[]> {
  let database: IDBDatabase | undefined;
  let values: unknown[];
  try {
    database = await openDatabase();
    values = await requestValue(
      database
        .transaction('recovery', 'readonly')
        .objectStore('recovery')
        .getAll(),
    );
  } catch (error) {
    throw new RecoveryReadUnavailableError(error);
  } finally {
    database?.close();
  }
  // A bad hash, invalid snapshot or invalid asset is not a storage-unavailable
  // condition and must not silently turn a complete export into a rescue export.
  const records = await Promise.all(values.map(verifyStored));
  return records
    .sort((a, b) => a.revision - b.revision)
    .map(({ updated, state }) => ({ updated, state }));
}

/** Used only by an explicit backup/recovery restore after a failed integrity read. */
export async function readWorkspaceRevision(): Promise<number> {
  const database = await openDatabase();
  try {
    const value: unknown = await requestValue(
      database
        .transaction('workspace', 'readonly')
        .objectStore('workspace')
        .get('current'),
    );
    if (value === undefined) return 0;
    if (
      value &&
      typeof value === 'object' &&
      'revision' in value &&
      Number.isSafeInteger(value.revision) &&
      (value.revision as number) > 0
    )
      return value.revision as number;
    throw new Error(
      'Saved workspace metadata is damaged. This browser could not safely replace it. Keep your backup and open it in another browser profile.',
    );
  } finally {
    database.close();
  }
}

export async function listRecoveryVersions(): Promise<
  { revision: number; updated: number }[]
> {
  const database = await openDatabase();
  try {
    const versions = (await requestValue(
      database
        .transaction('recovery', 'readonly')
        .objectStore('recovery')
        .getAll(),
    )) as StoredWorkspace[];
    return versions
      .filter(
        (record) =>
          Number.isSafeInteger(record.revision) &&
          Number.isFinite(record.updated),
      )
      .sort((a, b) => b.revision - a.revision)
      .map(({ revision, updated }) => ({ revision, updated }));
  } finally {
    database.close();
  }
}

export async function readRecoveryVersion(
  revision: number,
): Promise<StoredWorkspace> {
  const database = await openDatabase();
  try {
    const value: unknown = await requestValue(
      database
        .transaction('recovery', 'readonly')
        .objectStore('recovery')
        .get(revision),
    );
    return await verifyStored(value);
  } finally {
    database.close();
  }
}
