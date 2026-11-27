import { createNativeSessions } from '../documents/nativeSessions';
import type { NativeDocument } from '../documents/workspace';
import type {
  nativeDocuments,
  NativeVaultInfo,
  NativeVaultInventory,
  NativeVaultRefusalCode,
} from '../documents/native';
import type { SourceSession } from '../editor/sourceWitness';
import { isSupportedSource } from '../sourceTypes';

export type NativeWorkspacePorts = Pick<
  typeof nativeDocuments,
  | 'chooseVault'
  | 'vaultInventory'
  | 'openVaultSources'
  | 'createVaultSource'
  | 'save'
  | 'close'
>;
type Operation = 'choose' | 'index' | 'open' | 'create' | 'close';
export interface NativeWorkspaceAssociation {
  readonly sessionId: string;
  readonly vaultId: string;
  readonly logicalPath: string;
}
export interface NativeWorkspaceState {
  readonly vault: NativeVaultInfo | null;
  readonly inventory: NativeVaultInventory | null;
  readonly selectedSessionId: string | null;
  readonly sessions: readonly NativeWorkspaceAssociation[];
  readonly operation: Operation | null;
  readonly error: string | null;
  readonly unresolvedCleanup: number;
}
type Listener = (state: NativeWorkspaceState) => void;

function exactWireRecord(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      return descriptor !== undefined && 'value' in descriptor;
    })
  );
}
function refusalCode(value: unknown): value is NativeVaultRefusalCode {
  return value === 'rejected' || value === 'io' || value === 'conflict';
}

function validPath(path: string): boolean {
  // Mirror native-documents/src/vault.rs::validate_source_path. These checks
  // preserve spelling; Rust still owns descriptor traversal and authorization.
  const reserved = ['.git', 'node_modules', '.programmable-notes'];
  return (
    typeof path === 'string' &&
    isSupportedSource(path) &&
    !path.startsWith('/') &&
    !/[\\\0]/.test(path) &&
    new TextEncoder().encode(path).byteLength <= 4096 &&
    path.split('/').length <= 17 &&
    !path
      .split('/')
      .some(
        (part) =>
          !part || part === '.' || part === '..' || reserved.includes(part),
      )
  );
}
function documentSnapshot(input: NativeDocument): NativeDocument {
  const {
    id,
    revision,
    logicalPath,
    source,
    name,
    displayPath,
    durabilityWarning,
  } = input;
  if (
    typeof id !== 'string' ||
    !id ||
    typeof revision !== 'string' ||
    !revision ||
    !validPath(logicalPath) ||
    typeof source !== 'string' ||
    typeof name !== 'string' ||
    typeof displayPath !== 'string' ||
    typeof durabilityWarning !== 'boolean'
  )
    throw Error('Invalid native document response.');
  return {
    id,
    revision,
    logicalPath,
    source,
    name,
    displayPath,
    durabilityWarning,
  };
}
class CreatedNotOpened extends Error {
  constructor() {
    super('The file was created but not opened. Its file was retained.');
  }
}
class UncertainAcquisition extends Error {
  constructor(kind: 'open' | 'create') {
    super(
      `${kind === 'create' ? 'Creation' : 'Opening'} outcome is uncertain. A ${kind === 'create' ? 'file or ' : ''}native grant may exist; reconciliation is required.`,
    );
  }
}
class ConfirmedRefusal extends Error {
  constructor(kind: 'open' | 'create', code: NativeVaultRefusalCode) {
    super(
      `Native ${kind} refused (${code}). No target file or document grant was published.`,
    );
  }
}

/** Trusted application use cases only. No UI, runtime, filesystem fallback or editing history. */
export function createNativeWorkspace(
  ports: NativeWorkspacePorts,
  newSessionId: () => string,
) {
  // Capture injected ports once; later caller mutation cannot retarget an operation.
  const {
    chooseVault,
    vaultInventory,
    openVaultSources,
    createVaultSource,
    save,
    close,
  } = ports;
  const native = createNativeSessions({ save, close });
  const controller = native.controller;
  const associations = new Map<string, NativeWorkspaceAssociation>();
  const sessions = new Map<string, SourceSession>();
  // Ownership tombstones solely prevent cleanup of old/cross-aliased identities.
  const protectedIdentities = new Set<string>();
  let vault: NativeVaultInfo | null = null;
  let inventory: NativeVaultInventory | null = null;
  let selected: string | null = null;
  let selectionEpoch = 0;
  let operation: Operation | null = null;
  let error: string | null = null;
  const unresolvedGrants = new Set<string>();
  let uncertainResponses = 0;
  const cleanupCount = () => unresolvedGrants.size + uncertainResponses;
  const listeners = new Set<{ listener: Listener }>();
  const pendingListeners = new Set<{ listener: Listener }>();
  let notificationPending = false;

  function state(): NativeWorkspaceState {
    return {
      vault: vault ? { ...vault } : null,
      inventory: inventory
        ? {
            vaultId: inventory.vaultId,
            entries: inventory.entries.map((entry) => ({ ...entry })),
          }
        : null,
      selectedSessionId: selected,
      sessions: [...associations.values()].map((entry) => ({ ...entry })),
      operation,
      error,
      unresolvedCleanup: cleanupCount(),
    };
  }
  function notify(initial?: { listener: Listener }) {
    for (const subscription of initial ? [initial] : listeners)
      pendingListeners.add(subscription);
    if (notificationPending || !pendingListeners.size) return;
    notificationPending = true;
    queueMicrotask(() => {
      notificationPending = false;
      const deliveries = [...pendingListeners];
      pendingListeners.clear();
      for (const subscription of deliveries) {
        if (!listeners.has(subscription)) continue;
        try {
          void Promise.resolve(subscription.listener(state())).catch(() => {});
        } catch {
          /* Observations never affect authority or expose their errors. */
        }
      }
    });
  }
  function canLeaveSelection(): boolean {
    if (!selected) return true;
    const current = controller.state(selected);
    return (
      current.phase === 'open' &&
      !current.unapplied &&
      !current.retainedFailures.length
    );
  }
  function select(sessionId: string) {
    if (!associations.has(sessionId))
      throw Error('Document session is not in this workspace.');
    if (selected === sessionId) return;
    if (!canLeaveSelection())
      throw Error('Retained or unapplied text prevents switching documents.');
    if (controller.state(sessionId).phase !== 'open')
      throw Error('Document close is pending or uncertain.');
    selected = sessionId;
    selectionEpoch++;
    notify();
  }
  async function run<T>(kind: Operation, action: () => Promise<T>): Promise<T> {
    if (operation) throw Error('A workspace operation is already running.');
    operation = kind;
    error = null;
    notify();
    try {
      return await action();
    } catch (reason) {
      error =
        reason instanceof CreatedNotOpened ||
        reason instanceof ConfirmedRefusal ||
        reason instanceof UncertainAcquisition
          ? reason.message
          : `${kind} failed. Existing document text was retained.`;
      throw reason;
    } finally {
      operation = null;
      notify();
    }
  }
  function requireVault(): string {
    if (!vault) throw Error('Choose a local vault first.');
    if (cleanupCount()) throw Error('Native grant cleanup is unresolved.');
    return vault.vaultId;
  }
  async function acquire<T>(
    kind: 'open' | 'create',
    request: () => Promise<T>,
  ): Promise<T> {
    try {
      return await request();
    } catch {
      // A rejected promise cannot distinguish a backend refusal from lost IPC
      // after acquisition/publication. Unknown-outcome reconciliation remains
      // future work; never infer no side effects from native error message strings.
      uncertainResponses++;
      throw new UncertainAcquisition(kind);
    }
  }
  async function index(vaultId: string) {
    const result = await vaultInventory(vaultId);
    const entries = result.entries.map(({ logicalPath, bytes }) => ({
      logicalPath,
      bytes,
    }));
    if (
      result.vaultId !== vaultId ||
      vault?.vaultId !== vaultId ||
      entries.some(
        (entry) =>
          !validPath(entry.logicalPath) ||
          !Number.isSafeInteger(entry.bytes) ||
          entry.bytes < 0,
      ) ||
      new Set(entries.map((entry) => entry.logicalPath)).size !== entries.length
    )
      throw Error('Invalid native inventory response.');
    inventory = { vaultId, entries };
    notify();
  }
  async function attach(
    vaultId: string,
    path: string,
    document: NativeDocument,
    epoch: number,
    expectedSource?: string,
  ): Promise<string> {
    if (
      document.logicalPath !== path ||
      vault?.vaultId !== vaultId ||
      protectedIdentities.has(document.id)
    ) {
      uncertainResponses++;
      throw new UncertainAcquisition(
        expectedSource === undefined ? 'open' : 'create',
      );
    }
    // This matching acknowledgement is the only grant eligible for failed-attach cleanup.
    protectedIdentities.add(document.id);
    let id: string;
    let session: SourceSession;
    try {
      if (expectedSource !== undefined && document.source !== expectedSource)
        throw Error('Created source did not match the acknowledged file.');
      id = newSessionId();
      if (protectedIdentities.has(id))
        throw Error('Document session identity was already used.');
      session = native.attach(id, document);
    } catch (reason) {
      try {
        await close(document.id);
      } catch {
        unresolvedGrants.add(document.id);
      }
      throw reason;
    }
    protectedIdentities.add(id);
    associations.set(id, { sessionId: id, vaultId, logicalPath: path });
    sessions.set(id, session);
    // A newly opened buffer is retained even if a draft/new selection appeared while reading.
    if (epoch === selectionEpoch && canLeaveSelection()) select(id);
    notify();
    return id;
  }
  function outcomeDocument(
    kind: 'open' | 'create',
    vaultId: string,
    path: string,
    response: unknown,
  ): NativeDocument {
    try {
      const requestKey = kind === 'open' ? 'paths' : 'path';
      if (
        exactWireRecord(response, ['status', 'vaultId', requestKey, 'code']) &&
        response.status === 'refused' &&
        response.vaultId === vaultId &&
        refusalCode(response.code)
      ) {
        const origin = response[requestKey];
        const matches =
          kind === 'create'
            ? origin === path
            : Array.isArray(origin) &&
              Object.getPrototypeOf(origin) === Array.prototype &&
              origin.length === 1 &&
              Reflect.ownKeys(origin).length === 2 &&
              Object.getOwnPropertyDescriptor(origin, '0')?.value === path;
        if (matches) throw new ConfirmedRefusal(kind, response.code);
      }
      const sourceKey = kind === 'open' ? 'documents' : 'document';
      if (
        !exactWireRecord(response, ['status', 'vaultId', sourceKey]) ||
        response.status !== 'acquired' ||
        response.vaultId !== vaultId
      )
        throw Error('Unexpected native acquisition response.');
      const payload = response[sourceKey];
      if (kind === 'open' && (!Array.isArray(payload) || payload.length !== 1))
        throw Error('Expected one native source acknowledgement.');
      const input = kind === 'open' ? (payload as unknown[])[0] : payload;
      const document = documentSnapshot(input as NativeDocument);
      if (document.logicalPath !== path)
        throw Error('Unexpected native response scope.');
      return document;
    } catch (reason) {
      if (reason instanceof ConfirmedRefusal) throw reason;
      // Foreign/malformed responses cannot authorize cleanup of arbitrary IDs.
      uncertainResponses++;
      throw new UncertainAcquisition(kind);
    }
  }

  return {
    // Close/attach stay workspace-owned; these existing observation/draft/flush methods
    // are trusted host services, never a document-runtime capability facade.
    controller: controller as Pick<
      typeof controller,
      'state' | 'subscribe' | 'setUnapplied' | 'flush'
    >,
    state,
    subscribe(listener: Listener): () => void {
      const subscription = { listener };
      listeners.add(subscription);
      notify(subscription);
      return () => {
        listeners.delete(subscription);
        pendingListeners.delete(subscription);
      };
    },
    session(sessionId: string): SourceSession {
      const session = sessions.get(sessionId);
      if (!session) throw Error('Document session is not in this workspace.');
      return session;
    },
    select,
    choose: () =>
      run('choose', async () => {
        if (associations.size || cleanupCount())
          throw Error(
            'Close all document sessions and resolve cleanup before replacing the vault.',
          );
        let result: NativeVaultInfo | null;
        try {
          result = await chooseVault();
        } catch (reason) {
          vault = null;
          inventory = null;
          throw reason;
        }
        if (result === null) return;
        inventory = null;
        vault = null;
        const { vaultId, displayPath } = result;
        if (
          typeof vaultId !== 'string' ||
          !vaultId ||
          typeof displayPath !== 'string'
        ) {
          vault = null;
          throw Error('Invalid native vault acknowledgement.');
        }
        // Native selection already replaced its active token. Index failure cannot roll it back.
        vault = { vaultId, displayPath };
        notify();
        await index(vaultId);
      }),
    refreshInventory: () =>
      run('index', async () => {
        const vaultId = requireVault();
        inventory = null;
        await index(vaultId);
      }),
    open: (path: string) =>
      run('open', async () => {
        if (!validPath(path)) throw Error('Unsupported relative source path.');
        const vaultId = requireVault();
        const loaded = [...associations.values()].find(
          (entry) => entry.vaultId === vaultId && entry.logicalPath === path,
        );
        if (loaded) {
          select(loaded.sessionId);
          return loaded.sessionId;
        }
        if (!canLeaveSelection())
          throw Error(
            'Retained or unapplied text prevents opening another document.',
          );
        const epoch = selectionEpoch;
        const response = await acquire('open', () =>
          openVaultSources(vaultId, [path]),
        );
        const document = outcomeDocument('open', vaultId, path, response);
        return attach(vaultId, path, document, epoch);
      }),
    create: (path: string, source: string) =>
      run('create', async () => {
        if (!validPath(path) || typeof source !== 'string')
          throw Error('Unsupported source creation.');
        const vaultId = requireVault();
        if (
          [...associations.values()].some(
            (entry) => entry.vaultId === vaultId && entry.logicalPath === path,
          )
        )
          throw Error('A document at this path is already loaded.');
        if (!canLeaveSelection())
          throw Error(
            'Retained or unapplied text prevents creating another document.',
          );
        const epoch = selectionEpoch;
        const response = await acquire('create', () =>
          createVaultSource(vaultId, path, source),
        );
        const document = outcomeDocument('create', vaultId, path, response);
        try {
          const id = await attach(vaultId, path, document, epoch, source);
          // Metadata is observational; only the acknowledged created path is added here.
          if (
            inventory &&
            !inventory.entries.some((entry) => entry.logicalPath === path)
          )
            inventory.entries.push({
              logicalPath: path,
              bytes: new TextEncoder().encode(document.source).byteLength,
            });
          notify();
          return id;
        } catch (reason) {
          if (reason instanceof UncertainAcquisition) throw reason;
          throw new CreatedNotOpened();
        }
      }),
    close: (sessionId: string) =>
      run('close', async () => {
        if (!associations.has(sessionId))
          throw Error('Document session is not in this workspace.');
        await controller.close(sessionId);
        associations.delete(sessionId);
        sessions.delete(sessionId);
        if (selected === sessionId) {
          selected =
            [...associations.keys()].find(
              (id) => controller.state(id).phase === 'open',
            ) ?? null;
          selectionEpoch++;
        }
        notify();
      }),
  };
}
