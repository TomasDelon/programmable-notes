import { MAX_FILE_BYTES } from './workspace';

export type NativeObservationIssue =
  'missing' | 'permission' | 'invalid' | 'unstable' | 'retired' | 'unreadable';
export type NativeSourceObservation =
  | { readonly status: 'unchanged'; readonly revision: string }
  | {
      readonly status: 'changed';
      readonly baselineRevision: string;
      readonly revision: string;
      readonly source: string;
    }
  | { readonly status: 'unavailable'; readonly reason: NativeObservationIssue };

/** Privileged wire ports. Neither these nor grant identities enter authored code. */
export interface NativeObservationPorts {
  observe(id: string, revision: string): Promise<unknown>;
  watch(id: string, revision: string): Promise<unknown>;
  pollWatch(id: string, watchId: string): Promise<unknown>;
  unwatch(id: string, watchId: string): Promise<unknown>;
}
export interface NativeSessionObservation {
  read(sessionId: string, revision: string): Promise<NativeSourceObservation>;
  watch(sessionId: string, revision: string): Promise<string>;
  poll(sessionId: string, watchId: string): Promise<boolean>;
  unwatch(sessionId: string, watchId: string): Promise<void>;
}

function record(
  value: unknown,
  keys: readonly string[],
): value is Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const prototype = Object.getPrototypeOf(value);
  return (
    (prototype === Object.prototype || prototype === null) &&
    Reflect.ownKeys(value).length === keys.length &&
    keys.every((key) => {
      const property = Object.getOwnPropertyDescriptor(value, key);
      return property !== undefined && 'value' in property;
    })
  );
}
export function validNativeRevision(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0 && value.length <= 128;
}
export function validNativeWatch(value: unknown): value is string {
  return typeof value === 'string' && /^[0-9a-f]{32}$/.test(value);
}
function exactSource(value: unknown): value is string {
  if (typeof value !== 'string' || value.length > MAX_FILE_BYTES) return false;
  const bytes = new TextEncoder().encode(value);
  return (
    bytes.byteLength <= MAX_FILE_BYTES &&
    new TextDecoder('utf-8', { fatal: true, ignoreBOM: true }).decode(bytes) ===
      value
  );
}
export function decodeNativeObservation(
  value: unknown,
  expectedRevision: string,
): NativeSourceObservation {
  // Inspect descriptors before reading discriminants or source: a getter is not wire data.
  if (
    record(value, ['status', 'revision']) &&
    value.status === 'unchanged' &&
    value.revision === expectedRevision &&
    validNativeRevision(value.revision)
  ) {
    return { status: 'unchanged', revision: value.revision };
  }
  if (
    record(value, ['status', 'baselineRevision', 'revision', 'source']) &&
    value.status === 'changed' &&
    value.baselineRevision === expectedRevision &&
    validNativeRevision(value.revision) &&
    value.revision !== expectedRevision &&
    exactSource(value.source)
  ) {
    return {
      status: 'changed',
      baselineRevision: expectedRevision,
      revision: value.revision,
      source: value.source,
    };
  }
  if (
    record(value, ['status', 'reason']) &&
    value.status === 'unavailable' &&
    [
      'missing',
      'permission',
      'invalid',
      'unstable',
      'retired',
      'unreadable',
    ].includes(value.reason as string)
  ) {
    return {
      status: 'unavailable',
      reason: value.reason as NativeObservationIssue,
    };
  }
  throw Error(
    'Invalid native observation response. Current source was retained.',
  );
}
