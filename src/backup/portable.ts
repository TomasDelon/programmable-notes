import {
  validateAssetCatalog,
  verifyAssetCatalog,
  type AssetCatalog,
} from '../assets/catalog';
import {
  MAX_BACKUP_BYTES,
  parseBackup,
  validateWebState,
  type WebState,
} from '../web/workspace';

export interface BackupRecovery {
  updated: number;
  state: WebState;
}
export interface DecodedBackup {
  state: WebState;
  recovery: BackupRecovery[];
  legacy: boolean;
}
interface PackedState {
  state: WebState;
  assetIds?: string[];
  /** Per-snapshot display names are metadata, not part of the content identity. */
  assetNames?: Record<string, string>;
}
interface Payload {
  format: 'programmable-notes-workspace';
  version: 2;
  exportedAt: string;
  state: WebState;
  assetIds?: string[];
  assetNames?: Record<string, string>;
  assets: AssetCatalog;
  recovery: (PackedState & { updated: number })[];
  recoveryIncluded: boolean;
}
const encoder = new TextEncoder();
export const MAX_BACKUP_RECOVERY = 5;

function assert(condition: unknown, message: string): asserts condition {
  if (!condition) throw new Error(message);
}
function object(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}
function canonical(value: unknown, depth = 0): string {
  assert(depth <= 40, 'The backup has too many nested values.');
  if (value === null || typeof value === 'boolean' || typeof value === 'string')
    return JSON.stringify(value);
  if (typeof value === 'number' && Number.isFinite(value))
    return JSON.stringify(value);
  if (Array.isArray(value))
    return (
      '[' + value.map((item) => canonical(item, depth + 1)).join(',') + ']'
    );
  if (object(value))
    return (
      '{' +
      Object.keys(value)
        .filter((key) => value[key] !== undefined)
        .sort()
        .map(
          (key) => JSON.stringify(key) + ':' + canonical(value[key], depth + 1),
        )
        .join(',') +
      '}'
    );
  throw new Error('The backup contains a non-JSON value.');
}
async function checksum(payload: unknown): Promise<string> {
  const result = await crypto.subtle.digest(
    'SHA-256',
    encoder.encode(canonical(payload)),
  );
  return Array.from(new Uint8Array(result), (byte) =>
    byte.toString(16).padStart(2, '0'),
  ).join('');
}
function packState(
  state: WebState,
  assets: Record<string, AssetCatalog[string]>,
): PackedState {
  validateWebState(state);
  const { assets: catalog, ...withoutAssets } = state;
  for (const [id, asset] of Object.entries(catalog ?? {})) {
    const previous = assets[id];
    assert(
      !previous ||
        (previous.base64 === asset.base64 &&
          previous.mime === asset.mime &&
          previous.byteLength === asset.byteLength &&
          previous.width === asset.width &&
          previous.height === asset.height),
      'Two attachment records disagree about the same content identity.',
    );
    assets[id] ??= asset;
  }
  return {
    state: withoutAssets,
    ...(catalog
      ? {
          assetIds: Object.keys(catalog),
          assetNames: Object.fromEntries(
            Object.entries(catalog).map(([id, asset]) => [id, asset.name]),
          ),
        }
      : {}),
  };
}

function unpackState(packed: unknown, assets: AssetCatalog): WebState {
  assert(object(packed) && object(packed.state), 'Invalid backup snapshot.');
  const state = packed.state;
  assert(
    !Object.hasOwn(state, 'assets'),
    'A portable snapshot cannot duplicate attachment bytes.',
  );
  if (packed.assetIds === undefined) {
    assert(
      packed.assetNames === undefined,
      'Attachment metadata has no matching references.',
    );
    return validateWebState(state);
  }
  assert(
    Array.isArray(packed.assetIds) &&
      new Set(packed.assetIds).size === packed.assetIds.length,
    'Invalid attachment references in backup.',
  );
  const names = packed.assetNames;
  if (names !== undefined) {
    assert(
      object(names) &&
        Object.keys(names).length === packed.assetIds.length &&
        Object.keys(names).every((id) =>
          (packed.assetIds as unknown[]).includes(id),
        ),
      'Invalid snapshot attachment metadata.',
    );
  }
  const catalog: Record<string, AssetCatalog[string]> = {};
  for (const id of packed.assetIds) {
    assert(
      typeof id === 'string' && Object.hasOwn(assets, id),
      'The backup is missing attachment bytes.',
    );
    if (names === undefined)
      catalog[id] = assets[id]!; // Earlier v2 archives.
    else {
      assert(
        object(names) && typeof names[id] === 'string',
        'Invalid attachment filename in snapshot.',
      );
      catalog[id] = Object.freeze({ ...assets[id]!, name: names[id] });
    }
  }
  return validateWebState({ ...state, assets: Object.freeze(catalog) });
}

/** Complete, checksummed backup. Shared original blobs are serialized only once. */
export async function serializePortableBackup(
  state: WebState,
  recovery: readonly BackupRecovery[] = [],
  options: { recoveryIncluded?: boolean } = {},
): Promise<string> {
  assert(
    recovery.length <= MAX_BACKUP_RECOVERY,
    'The backup contains too many recovery checkpoints.',
  );
  const assets: Record<string, AssetCatalog[string]> = {};
  const recoveryIncluded = options.recoveryIncluded ?? true;
  assert(
    recoveryIncluded || recovery.length === 0,
    'A rescue backup cannot contain partial recovery history.',
  );
  const current = packState(state, assets);
  const history = recovery.map((item) => {
    assert(
      Number.isFinite(item.updated) && item.updated >= 0,
      'Invalid recovery checkpoint date.',
    );
    return { ...packState(item.state, assets), updated: item.updated };
  });
  await verifyAssetCatalog(assets);
  const payload: Payload = {
    format: 'programmable-notes-workspace',
    version: 2,
    exportedAt: new Date().toISOString(),
    ...current,
    assets,
    recovery: history,
    recoveryIncluded,
  };
  const text = JSON.stringify({
    ...payload,
    checksum: await checksum(payload),
  });
  assert(
    encoder.encode(text).byteLength <= MAX_BACKUP_BYTES,
    'The complete backup exceeds 32 MiB. No partial backup was exported.',
  );
  return text;
}

export async function parsePortableBackup(
  text: string,
): Promise<DecodedBackup> {
  assert(
    encoder.encode(text).byteLength <= MAX_BACKUP_BYTES,
    'The backup exceeds the 32 MiB import limit.',
  );
  let depth = 0,
    containers = 0,
    quoted = false,
    escaped = false;
  for (const character of text) {
    if (quoted) {
      if (escaped) escaped = false;
      else if (character === '\\') escaped = true;
      else if (character === '"') quoted = false;
    } else if (character === '"') quoted = true;
    else if (character === '{' || character === '[') {
      assert(
        ++depth <= 40 && ++containers <= 30_000,
        'The backup exceeds the safe structural limits.',
      );
    } else if (character === '}' || character === ']') depth--;
  }
  let candidate: unknown;
  try {
    candidate = JSON.parse(text);
  } catch {
    throw new Error(
      'This file is not valid JSON. The current workspace was not changed.',
    );
  }
  assert(
    object(candidate) && candidate.format === 'programmable-notes-workspace',
    'Choose a Programmable Notes workspace backup.',
  );
  if (candidate.version === 1) {
    const state = parseBackup(text);
    await verifyAssetCatalog(state.assets);
    return { state, recovery: [], legacy: true };
  }
  assert(candidate.version === 2, 'Unsupported workspace backup version.');
  const { checksum: recorded, ...payload } = candidate;
  assert(
    typeof recorded === 'string' &&
      /^[a-f0-9]{64}$/.test(recorded) &&
      (await checksum(payload)) === recorded,
    'The backup failed its integrity check. The workspace was not changed.',
  );
  assert(
    typeof payload.exportedAt === 'string' &&
      Number.isFinite(Date.parse(payload.exportedAt)),
    'Invalid backup date.',
  );
  validateAssetCatalog(payload.assets);
  await verifyAssetCatalog(payload.assets);
  assert(
    Array.isArray(payload.recovery) &&
      payload.recovery.length <= MAX_BACKUP_RECOVERY,
    'Invalid recovery checkpoint list.',
  );
  assert(
    payload.recoveryIncluded === undefined ||
      typeof payload.recoveryIncluded === 'boolean',
    'Invalid recovery backup status.',
  );
  assert(
    payload.recoveryIncluded !== false || payload.recovery.length === 0,
    'A rescue backup cannot contain partial recovery history.',
  );
  const state = unpackState(payload, payload.assets);
  const recovery = payload.recovery.map((item): BackupRecovery => {
    assert(
      object(item) &&
        typeof item.updated === 'number' &&
        Number.isFinite(item.updated) &&
        item.updated >= 0,
      'Invalid recovery checkpoint.',
    );
    return {
      updated: item.updated,
      state: unpackState(item, payload.assets as AssetCatalog),
    };
  });
  return { state, recovery, legacy: false };
}
