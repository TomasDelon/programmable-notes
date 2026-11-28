/** Minimal structural D1 surface; no platform SDK or credentials enter the client. */
export type SqlValue = string | number | null | ArrayBuffer | Uint8Array;
export interface StorageResult<T = Record<string, unknown>> {
  success: boolean;
  results?: T[];
  meta?: { changes?: number };
}
export interface StorageStatement {
  bind(...values: SqlValue[]): StorageStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<StorageResult<T>>;
  run(): Promise<StorageResult>;
}
export interface StorageDatabase {
  prepare(sql: string): StorageStatement;
  /** D1 batch is a transaction: any failed statement rolls back the batch. */
  batch(statements: StorageStatement[]): Promise<StorageResult[]>;
}
export interface StorageEnvironment {
  NOTES_DB?: StorageDatabase;
  APP_ORIGIN?: string;
  ACCESS_ISSUER?: string;
  ACCESS_AUD?: string;
  OWNER_SUBJECT?: string;
}
export interface StorageServices {
  crypto?: Crypto;
  fetch?: typeof fetch;
  now?: () => number;
}
export const CHUNK_BYTES = 1024 * 1024;
export const INVENTORY_BYTES = 96 * CHUNK_BYTES;
export const STAGE_LIFETIME_MS = 10 * 60 * 1000;
export const MANIFEST_BYTES = 16 * 1024;
export const HASH = /^[a-f0-9]{64}$/;
export interface ManifestInput {
  checksum: string;
  byteSize: number;
  chunks: string[];
}
export class StorageFailure extends Error {
  constructor(
    readonly status: number,
    message: string,
  ) {
    super(message);
  }
}
