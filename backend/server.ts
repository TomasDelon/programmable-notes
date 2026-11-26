import { accessVerifier, configuration } from './auth';
import { fields, manifestInput, requestBytes, requestJson } from './input';
import {
  CHUNK_BYTES,
  MANIFEST_BYTES,
  STAGE_LIFETIME_MS,
  StorageFailure,
  type StorageDatabase,
  type StorageEnvironment,
  type StorageResult,
  type StorageServices,
} from './types';

interface HeadRow {
  version: number;
  id: string | null;
  checksum: string | null;
  byte_size: number | null;
  chunks_json: string | null;
}
const ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/;
const policy = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Content-Security-Policy':
    "default-src 'none'; frame-ancestors 'none'; base-uri 'none'",
  'Referrer-Policy': 'no-referrer',
  'Cross-Origin-Resource-Policy': 'same-origin',
  Vary: 'Cf-Access-Jwt-Assertion, Origin',
};
function json(value: unknown, status = 200) {
  return Response.json(value, { status, headers: policy });
}
function successful(results: StorageResult[]) {
  if (results.some((result) => !result.success))
    throw Error('Storage transaction failed');
  return results;
}
function headStatement(db: StorageDatabase) {
  return db.prepare(`SELECT h.version, m.id, m.checksum, m.byte_size, m.chunks_json
    FROM storage_head h LEFT JOIN storage_manifests m ON m.id=h.manifest_id WHERE h.singleton=1`);
}
function headValue(row: HeadRow | null | undefined) {
  if (!row) throw Error('Missing storage head');
  return {
    version: row.version,
    manifest:
      row.id === null
        ? null
        : {
            id: row.id,
            checksum: row.checksum!,
            byteSize: row.byte_size!,
            chunks: JSON.parse(row.chunks_json!) as string[],
          },
  };
}
async function head(db: StorageDatabase) {
  return headValue(await headStatement(db).first<HeadRow>());
}
function expired(db: StorageDatabase, now: number) {
  return db
    .prepare(
      "DELETE FROM storage_manifests WHERE state='staged' AND expires_at<=?",
    )
    .bind(now);
}
function garbage(db: StorageDatabase, now: number) {
  return db
    .prepare(
      `DELETE FROM storage_chunks WHERE NOT EXISTS (
    SELECT 1 FROM storage_manifest_chunks mc JOIN storage_manifests m ON m.id=mc.manifest_id
    WHERE mc.hash=storage_chunks.hash AND (m.state='published' OR m.expires_at>?)
  )`,
    )
    .bind(now);
}

/** The optional services argument exists only at construction, never in requests or environment bindings. */
export function createStorageHandler(services: StorageServices = {}) {
  const cryptography = services.crypto ?? globalThis.crypto;
  const now = services.now ?? Date.now;
  const authenticate = accessVerifier(
    cryptography,
    services.fetch ?? ((input, init) => globalThis.fetch(input, init)),
    now,
  );
  return async (
    request: Request,
    env: StorageEnvironment,
  ): Promise<Response> => {
    try {
      const config = configuration(env);
      const url = new URL(request.url);
      const session =
        url.pathname === '/api/storage/session' && request.method === 'GET';
      if (
        url.origin !== config.origin ||
        (request.headers.has('Origin') &&
          request.headers.get('Origin') !== config.origin) ||
        (!session && request.headers.get('Sec-Fetch-Site') === 'cross-site')
      )
        throw new StorageFailure(403, 'Storage origin denied.');
      if (
        !session &&
        request.headers.get('X-Programmable-Notes') !== 'storage-v1'
      )
        throw new StorageFailure(403, 'Storage editor marker required.');
      if (
        request.method !== 'GET' &&
        (request.headers.get('Origin') !== config.origin ||
          request.headers.get('X-Programmable-Notes') !== 'storage-v1')
      )
        throw new StorageFailure(403, 'Storage mutation denied.');
      await authenticate(request, config);
      // This owner-authenticated navigation returns no data and grants no
      // mutation. It lets Access reauthenticate without closing a live draft.
      if (session)
        return new Response(null, {
          status: 303,
          headers: { ...policy, Location: '/' },
        });
      const db = env.NOTES_DB!;
      const path = url.pathname;
      if (path === '/api/storage/head' && request.method === 'GET')
        return json(await head(db));
      const chunk = /^\/api\/storage\/chunks\/([a-f0-9]{64})$/.exec(path)?.[1];
      if (chunk && request.method === 'GET') {
        const time = now();
        const row = await db
          .prepare(
            `SELECT data, byte_size FROM storage_chunks c WHERE hash=? AND EXISTS (
          SELECT 1 FROM storage_manifest_chunks mc JOIN storage_manifests m ON m.id=mc.manifest_id
          WHERE mc.hash=c.hash AND (m.state='published' OR m.expires_at>?)
        )`,
          )
          .bind(chunk, time)
          .first<{
            data: ArrayBuffer | Uint8Array | number[];
            byte_size: number;
          }>();
        if (!row) throw new StorageFailure(404, 'Storage chunk not found.');
        const bytes =
          row.data instanceof ArrayBuffer
            ? new Uint8Array(row.data)
            : new Uint8Array(row.data);
        if (
          bytes.byteLength !== row.byte_size ||
          bytes.byteLength > CHUNK_BYTES
        )
          throw Error('Invalid stored chunk');
        return new Response(bytes, {
          headers: { ...policy, 'Content-Type': 'application/octet-stream' },
        });
      }
      if (chunk && request.method === 'PUT') {
        const bytes = await requestBytes(request, CHUNK_BYTES);
        if (!bytes.length)
          throw new StorageFailure(400, 'Empty storage chunk.');
        const digest = new Uint8Array(
          await cryptography.subtle.digest('SHA-256', bytes),
        );
        const actual = Array.from(digest, (value) =>
          value.toString(16).padStart(2, '0'),
        ).join('');
        if (actual !== chunk)
          throw new StorageFailure(400, 'Storage chunk checksum mismatch.');
        const time = now();
        const statements = [
          expired(db, time),
          garbage(db, time),
          db
            .prepare(
              `
          INSERT INTO storage_chunks(hash,data,byte_size)
          SELECT ?,?,? WHERE NOT EXISTS (SELECT 1 FROM storage_chunks WHERE hash=?)
          AND EXISTS (SELECT 1 FROM storage_manifest_chunks mc JOIN storage_manifests m ON m.id=mc.manifest_id
            WHERE mc.hash=? AND mc.byte_size=? AND m.state='staged' AND m.expires_at>?)
        `,
            )
            .bind(chunk, bytes, bytes.length, chunk, chunk, bytes.length, time),
        ];
        try {
          successful(await db.batch(statements));
        } catch (error) {
          if (String(error).includes('storage chunk budget'))
            throw new StorageFailure(
              507,
              'Private storage chunk budget reached.',
            );
          throw error;
        }
        const reference = await db
          .prepare(
            `SELECT 1 AS allowed FROM storage_manifest_chunks mc
          JOIN storage_manifests m ON m.id=mc.manifest_id JOIN storage_chunks c ON c.hash=mc.hash
          WHERE mc.hash=? AND mc.byte_size=? AND c.byte_size=mc.byte_size AND m.state='staged' AND m.expires_at>? LIMIT 1
        `,
          )
          .bind(chunk, bytes.length, time)
          .first();
        if (!reference)
          throw new StorageFailure(422, 'Stage this chunk before uploading.');
        return new Response(null, { status: 204, headers: policy });
      }
      if (
        (path === '/api/storage/stage' || path === '/api/storage/commit') &&
        request.method === 'POST'
      ) {
        if (
          request.headers
            .get('Content-Type')
            ?.split(';')[0]
            ?.trim()
            .toLowerCase() !== 'application/json'
        )
          throw new StorageFailure(415, 'Storage requests require JSON.');
        const input = await requestJson(request, MANIFEST_BYTES);
        const time = now();
        if (path.endsWith('/stage')) {
          const manifest = manifestInput(input);
          const id = cryptography.randomUUID();
          const chunks = JSON.stringify(manifest.chunks);
          const results = successful(
            await db.batch([
              expired(db, time),
              garbage(db, time),
              db
                .prepare(
                  `INSERT INTO storage_manifests(id,checksum,byte_size,chunks_json,state,expires_at)
              SELECT ?,?,?,?,'staged',? WHERE (SELECT COUNT(*) FROM storage_manifests WHERE state='staged')<4
            `,
                )
                .bind(
                  id,
                  manifest.checksum,
                  manifest.byteSize,
                  chunks,
                  time + STAGE_LIFETIME_MS,
                ),
              db
                .prepare(
                  `INSERT INTO storage_manifest_chunks(manifest_id,position,hash,byte_size)
              SELECT ?,CAST(j.key AS INTEGER),j.value,CASE WHEN CAST(j.key AS INTEGER)<json_array_length(?)-1
                THEN ? ELSE ?-(json_array_length(?)-1)*? END FROM json_each(?) j
              WHERE EXISTS (SELECT 1 FROM storage_manifests WHERE id=?)
            `,
                )
                .bind(
                  id,
                  chunks,
                  CHUNK_BYTES,
                  manifest.byteSize,
                  chunks,
                  CHUNK_BYTES,
                  chunks,
                  id,
                ),
            ]),
          );
          if (results[2]?.meta?.changes !== 1)
            throw new StorageFailure(429, 'Too many staged storage uploads.');
          const missing = await db
            .prepare(
              `SELECT DISTINCT mc.hash FROM storage_manifest_chunks mc
            LEFT JOIN storage_chunks c ON c.hash=mc.hash AND c.byte_size=mc.byte_size
            WHERE mc.manifest_id=? AND c.hash IS NULL ORDER BY mc.position
          `,
            )
            .bind(id)
            .all<{ hash: string }>();
          if (!missing.success) throw Error('Missing chunk query failed');
          return json(
            { id, missing: (missing.results ?? []).map((row) => row.hash) },
            201,
          );
        }
        if (
          !fields(input, ['expectedVersion', 'manifestId']) ||
          !Number.isSafeInteger(input.expectedVersion) ||
          (input.expectedVersion as number) < 0 ||
          (input.expectedVersion as number) >= Number.MAX_SAFE_INTEGER ||
          typeof input.manifestId !== 'string' ||
          !ID.test(input.manifestId)
        )
          throw new StorageFailure(400, 'Invalid storage commit.');
        const { manifestId, expectedVersion } = input as {
          manifestId: string;
          expectedVersion: number;
        };
        const results = successful(
          await db.batch([
            db
              .prepare(
                `UPDATE storage_head SET version=version+1,manifest_id=? WHERE singleton=1 AND version=?
            AND EXISTS (SELECT 1 FROM storage_manifests m WHERE m.id=? AND m.state='staged' AND m.expires_at>?
              AND (SELECT COUNT(*) FROM storage_manifest_chunks WHERE manifest_id=m.id)=json_array_length(m.chunks_json)
              AND NOT EXISTS (SELECT 1 FROM storage_manifest_chunks mc LEFT JOIN storage_chunks c ON c.hash=mc.hash
                WHERE mc.manifest_id=m.id AND (c.hash IS NULL OR c.byte_size<>mc.byte_size)))
          `,
              )
              .bind(manifestId, expectedVersion, manifestId, time),
            db
              .prepare(
                `UPDATE storage_manifests SET state='published',expires_at=NULL WHERE id=? AND EXISTS (
            SELECT 1 FROM storage_head WHERE singleton=1 AND version=? AND manifest_id=?)
          `,
              )
              .bind(manifestId, expectedVersion + 1, manifestId),
            db
              .prepare(
                `DELETE FROM storage_manifests WHERE
            (state='published' AND id<>? AND EXISTS(SELECT 1 FROM storage_head WHERE version=? AND manifest_id=?))
            OR (state='staged' AND expires_at<=?)
          `,
              )
              .bind(manifestId, expectedVersion + 1, manifestId, time),
            garbage(db, time),
            headStatement(db),
          ]),
        );
        const current = headValue(
          results[4]?.results?.[0] as unknown as HeadRow,
        );
        if (results[0]?.meta?.changes !== 1) {
          // Replay only the exact acknowledgement visible in this same atomic
          // batch. A superseded manifest must never restore an earlier head.
          if (
            current.version === expectedVersion + 1 &&
            current.manifest?.id === manifestId
          )
            return json(current);
          if (current.version !== expectedVersion)
            throw new StorageFailure(
              409,
              'Storage changed. Reload before publishing.',
            );
          throw new StorageFailure(
            422,
            'Storage upload is incomplete or expired.',
          );
        }
        return json(current);
      }
      throw new StorageFailure(404, 'Storage endpoint not found.');
    } catch (error) {
      if (error instanceof StorageFailure)
        return json({ error: error.message }, error.status);
      return json({ error: 'Private storage request failed.' }, 500);
    }
  };
}
export const handleStorage = createStorageHandler();
