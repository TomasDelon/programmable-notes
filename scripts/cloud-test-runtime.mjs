// Local acceptance tooling only. This file is never a deployed Function.
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { Miniflare, convertV4MiniflareOptions } from 'miniflare';

export async function cloudTestRuntime(origin) {
  const issuer = 'https://local-acceptance.cloudflareaccess.com';
  const audience = 'local-acceptance-only';
  const subject = 'local-owner';
  const key = await crypto.subtle.generateKey(
    {
      name: 'RSASSA-PKCS1-v1_5',
      modulusLength: 2048,
      publicExponent: new Uint8Array([1, 0, 1]),
      hash: 'SHA-256',
    },
    true,
    ['sign', 'verify'],
  );
  const jwk = {
    ...(await crypto.subtle.exportKey('jwk', key.publicKey)),
    kid: 'local-test',
    alg: 'RS256',
    use: 'sig',
  };
  const encode = (value) =>
    Buffer.from(JSON.stringify(value)).toString('base64url');
  const claims = {
    iss: issuer,
    aud: [audience],
    sub: subject,
    exp: Math.floor(Date.now() / 1000) + 3600,
    nbf: Math.floor(Date.now() / 1000) - 1,
    iat: Math.floor(Date.now() / 1000),
  };
  const input = `${encode({ alg: 'RS256', kid: jwk.kid, typ: 'JWT' })}.${encode(claims)}`;
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key.privateKey,
    new TextEncoder().encode(input),
  );
  const token = `${input}.${Buffer.from(signature).toString('base64url')}`;
  const output = await mkdtemp(join(tmpdir(), 'pn-pages-function-'));
  let script;
  try {
    // Use the actual Pages router/bundle, rather than a hand-written substitute.
    execFileSync(
      process.execPath,
      [
        resolve('node_modules/wrangler/bin/wrangler.js'),
        'pages',
        'functions',
        'build',
        '--outdir',
        output,
      ],
      {
        env: {
          ...process.env,
          WRANGLER_SEND_METRICS: 'false',
          WRANGLER_LOG_PATH: resolve('.cache/wrangler-local-build.log'),
        },
        stdio: 'pipe',
      },
    );
    script = await readFile(join(output, 'index.js'), 'utf8');
  } finally {
    await rm(output, { recursive: true, force: true });
  }
  const runtime = new Miniflare(
    convertV4MiniflareOptions({
      modules: true,
      script,
      compatibilityDate: '2026-11-01',
      d1Databases: { NOTES_DB: 'local-acceptance-only' },
      bindings: {
        APP_ORIGIN: origin,
        ACCESS_ISSUER: issuer,
        ACCESS_AUD: audience,
        OWNER_SUBJECT: subject,
      },
      // A synthetic identity provider is the only mocked boundary. The deployed
      // verifier, Web Crypto, Function adapter, workerd and D1 execute normally.
      outboundService: (request) => {
        if (
          request.method !== 'GET' ||
          request.url !== issuer + '/cdn-cgi/access/certs'
        )
          return new Response('Unexpected outbound request', { status: 502 });
        return Response.json({ keys: [jwk] });
      },
    }),
  );
  try {
    const database = await runtime.getD1Database('NOTES_DB');
    const schema = await readFile('backend/migrations/0001.sql', 'utf8');
    // D1 exec accepts SQL statements; trigger bodies require a prepared query.
    const statements = schema
      .replace(/^--.*$/gm, '')
      .match(/CREATE TRIGGER[\s\S]*?END;|(?:CREATE|INSERT)[\s\S]*?;/g);
    for (const statement of statements ?? [])
      await database.prepare(statement).run();
    return {
      database,
      async dispatch(request, authenticated = true) {
        const headers = new Headers(request.headers);
        headers.delete('Cf-Access-Jwt-Assertion');
        if (authenticated) headers.set('Cf-Access-Jwt-Assertion', token);
        return runtime.dispatchFetch(request.url, {
          method: request.method,
          headers,
          body:
            request.method === 'GET' || request.method === 'HEAD'
              ? undefined
              : await request.arrayBuffer(),
          redirect: 'manual',
        });
      },
      close: () => runtime.dispose(),
    };
  } catch (error) {
    await runtime.dispose();
    throw error;
  }
}
