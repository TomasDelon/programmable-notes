import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import type {
  StorageDatabase,
  StorageStatement,
  SqlValue,
  StorageResult,
} from '../../backend/types';

export function cloudD1() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec('PRAGMA foreign_keys=ON');
  sqlite.exec(readFileSync('backend/migrations/0001.sql', 'utf8'));
  let queue: Promise<unknown> = Promise.resolve();
  function serialized<T>(operation: () => T): Promise<T> {
    const result = queue.then(operation);
    queue = result.catch(() => undefined);
    return result;
  }
  const values = (items: SqlValue[]) =>
    items.map((value) =>
      value instanceof ArrayBuffer ? new Uint8Array(value) : value,
    );
  class Statement implements StorageStatement {
    constructor(
      readonly sql: string,
      readonly values: SqlValue[] = [],
    ) {}
    bind(...values: SqlValue[]) {
      return new Statement(this.sql, values);
    }
    async first<T>() {
      return serialized(
        () =>
          (sqlite.prepare(this.sql).get(...values(this.values)) as
            T | undefined) ?? null,
      );
    }
    async all<T>(): Promise<StorageResult<T>> {
      return serialized(() => ({
        success: true,
        results: sqlite.prepare(this.sql).all(...values(this.values)) as T[],
      }));
    }
    async run(): Promise<StorageResult> {
      return serialized(() => this.runNow());
    }
    runNow(): StorageResult {
      const statement = sqlite.prepare(this.sql);
      if (statement.columns().length)
        return {
          success: true,
          results: statement.all(...values(this.values)),
        };
      const result = statement.run(...values(this.values));
      return { success: true, meta: { changes: Number(result.changes) } };
    }
  }
  const db: StorageDatabase = {
    prepare: (sql) => new Statement(sql),
    batch: (statements) =>
      serialized(() => {
        sqlite.exec('BEGIN IMMEDIATE');
        try {
          const results = [];
          for (const statement of statements)
            results.push((statement as Statement).runNow());
          sqlite.exec('COMMIT');
          return results;
        } catch (error) {
          sqlite.exec('ROLLBACK');
          throw error;
        }
      }),
  };
  return { db, sqlite, close: () => sqlite.close() };
}
