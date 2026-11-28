import { boundedBytes } from './input';
import { StorageFailure, type StorageEnvironment } from './types';

interface Configuration {
  origin: string;
  issuer: string;
  audience: string;
  subject: string;
}
export function configuration(env: StorageEnvironment): Configuration {
  const {
    APP_ORIGIN: origin,
    ACCESS_ISSUER: issuer,
    ACCESS_AUD: audience,
    OWNER_SUBJECT: subject,
  } = env;
  try {
    if (
      !env.NOTES_DB ||
      !origin ||
      !issuer ||
      !audience ||
      !subject ||
      origin.length > 2048 ||
      issuer.length > 2048 ||
      audience.length > 256 ||
      subject.length > 256
    )
      throw Error();
    const app = new URL(origin),
      access = new URL(issuer);
    if (
      app.protocol !== 'https:' ||
      app.origin !== origin ||
      access.protocol !== 'https:' ||
      access.origin !== issuer ||
      !access.hostname.endsWith('.cloudflareaccess.com')
    )
      throw Error();
    return { origin, issuer, audience, subject };
  } catch {
    throw new StorageFailure(503, 'Private storage is not configured.');
  }
}
function object(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}
function decode(part: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(part) || part.length % 4 === 1) throw Error();
  return Uint8Array.from(
    atob(
      part.replace(/-/g, '+').replace(/_/g, '/') +
        '='.repeat((4 - (part.length % 4)) % 4),
    ),
    (char) => char.charCodeAt(0),
  );
}
export function accessVerifier(
  cryptography: Crypto,
  fetcher: typeof fetch,
  now: () => number,
) {
  const cache = new Map<
    string,
    { until: number; keys: Record<string, unknown>[] }
  >();
  return async (request: Request, config: Configuration) => {
    const denied = () =>
      new StorageFailure(401, 'Owner authentication required.');
    try {
      const token = request.headers.get('Cf-Access-Jwt-Assertion');
      if (!token || token.length > 16384) throw Error();
      const parts = token.split('.');
      if (parts.length !== 3) throw Error();
      const header: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[0]!)),
      );
      const claims: unknown = JSON.parse(
        new TextDecoder('utf-8', { fatal: true }).decode(decode(parts[1]!)),
      );
      if (
        !object(header) ||
        !object(claims) ||
        header.alg !== 'RS256' ||
        typeof header.kid !== 'string' ||
        !header.kid ||
        header.kid.length > 256 ||
        Object.keys(header).some(
          (key) => !['alg', 'kid', 'typ'].includes(key),
        ) ||
        (header.typ !== undefined && header.typ !== 'JWT')
      )
        throw Error();
      const seconds = Math.floor(now() / 1000);
      const audience =
        typeof claims.aud === 'string' ? [claims.aud] : claims.aud;
      if (
        claims.iss !== config.issuer ||
        claims.sub !== config.subject ||
        !Array.isArray(audience) ||
        audience.length > 16 ||
        audience.some(
          (value) => typeof value !== 'string' || value.length > 256,
        ) ||
        !audience.includes(config.audience) ||
        !Number.isSafeInteger(claims.exp) ||
        (claims.exp as number) <= seconds ||
        (claims.nbf !== undefined &&
          (!Number.isSafeInteger(claims.nbf) ||
            (claims.nbf as number) > seconds))
      )
        throw Error();
      let keys = cache.get(config.issuer);
      if (!keys || keys.until <= now()) {
        const response = await fetcher(
          config.issuer + '/cdn-cgi/access/certs',
          {
            redirect: 'manual',
            signal: AbortSignal.timeout(5000),
            headers: { Accept: 'application/json' },
          },
        );
        if (!response.ok || response.redirected) throw Error();
        const jwks: unknown = JSON.parse(
          new TextDecoder('utf-8', { fatal: true }).decode(
            await boundedBytes(response.body, 65536),
          ),
        );
        if (
          !object(jwks) ||
          !Array.isArray(jwks.keys) ||
          jwks.keys.length > 16 ||
          !jwks.keys.every(object)
        )
          throw Error();
        keys = { until: now() + 60_000, keys: jwks.keys };
        if (cache.size >= 4) cache.clear();
        cache.set(config.issuer, keys);
      }
      const candidates = keys.keys.filter(
        (key) =>
          key.kid === header.kid &&
          key.kty === 'RSA' &&
          (key.alg === undefined || key.alg === 'RS256') &&
          (key.use === undefined || key.use === 'sig'),
      );
      if (candidates.length !== 1) throw Error();
      const key = await cryptography.subtle.importKey(
        'jwk',
        candidates[0] as JsonWebKey,
        { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
        false,
        ['verify'],
      );
      if (
        !(await cryptography.subtle.verify(
          'RSASSA-PKCS1-v1_5',
          key,
          decode(parts[2]!),
          new TextEncoder().encode(parts[0] + '.' + parts[1]),
        ))
      )
        throw Error();
      if ((claims.exp as number) <= Math.floor(now() / 1000)) throw Error();
    } catch {
      throw denied();
    }
  };
}
