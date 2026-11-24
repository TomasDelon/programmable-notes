const rules: { path: string; headers: Record<string, string> }[] = [
  {
    path: '/*',
    headers: {
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'X-Frame-Options': 'DENY',
      'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
      'Content-Security-Policy':
        "base-uri 'none'; object-src 'none'; frame-ancestors 'none'",
      'X-Robots-Tag': 'noindex, nofollow',
    },
  },
  {
    path: '/assets/*',
    headers: {
      'Cache-Control': 'public, max-age=31536000, immutable, no-transform',
    },
  },
  ...[
    '/',
    '/index.html',
    '/engine',
    '/sw.js',
    '/manifest.webmanifest',
    '/THIRD_PARTY_NOTICES.txt',
  ].map((path) => ({
    path,
    headers: { 'Cache-Control': 'no-cache, no-transform' },
  })),
];

export function cloudflareHeaders(): string {
  return (
    rules
      .map(
        ({ path, headers }) =>
          path +
          '\n' +
          Object.entries(headers)
            .map(([name, value]) => `  ${name}: ${value}`)
            .join('\n'),
      )
      .join('\n\n') + '\n'
  );
}

export function headersForPath(pathname: string): Record<string, string> {
  const result: Record<string, string> = {};
  for (const rule of rules) {
    if (
      rule.path.endsWith('*')
        ? pathname.startsWith(rule.path.slice(0, -1))
        : pathname === rule.path
    )
      Object.assign(result, rule.headers);
  }
  return result;
}

export function deploymentOrigin(value?: string): string {
  if (!value) return 'http://127.0.0.1:4174';
  try {
    const url = new URL(value);
    if (
      (url.protocol !== 'https:' && url.origin !== 'http://127.0.0.1:4174') ||
      url.username ||
      url.password ||
      url.search ||
      url.hash ||
      url.pathname !== '/'
    )
      throw Error();
    return url.origin;
  } catch {
    throw Error(
      'Deployment URL must be an HTTPS origin without credentials, path, query or fragment',
    );
  }
}
