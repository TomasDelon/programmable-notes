# Development source-server private-cache protection

The existing dev server allowed ignored private audit output under its project
root. The npm dev/preview scripts also bound all interfaces. A real **loopback
only** server exposed an unused synthetic cache payload before the fix. No real
private file body was requested, and no external exploitation is inferred.
Gitignore and file mode0700 do not constrain a same-user HTTP process.

Dev/preview now default to127.0.0.1. The source-server deny list adds
`public-audit` and `.cache/security-scan-*`, retaining every installed upstream
Vite8.3.8 rule for env/git, certificate/key formats and npm/yarn configuration.
Review caught an incomplete proposed inherited list before commit. Expanded
synthetic controls exposed the omitted key protection, then passed when the exact
installed defaults were restored. The test dynamically requires default-set
inclusion to catch future dependency additions. No secret files were used.

Final actual HTTP test: twelve exclusive unused fixtures, each through bare
direct, bare `/@fs/`, raw, raw `/@fs/` and encoded-dot paths. All60 requests
returned403 and no marker. The required generated runtime raw import remained200.
Fixtures include isolated unused key/cert extensions, npmrc/yarnrc, env and both
private-cache categories. Actual configs/credentials were never fetched. Owned
files/directories are cleaned up; the private audit parent is preserved.

The full check passed114unit/37production Chromium/eight tooling controls,
format/lint/strict types/fresh build. Tooling now explicitly prepares runtime
when invoked standalone. Real-browser dev React interaction and unsaved MDX
compilation are separately recorded. This protects known private directories; it
does not make every ignored file private or turn source serving into an
authenticated public deployment. Packaged native authority and policy are unchanged.

Reproduce with `npm ci`, `npm run test:tooling` and `npm run check`. The HTTP
control starts its own ephemeral loopback Vite server and uses only synthetic
fixtures. Current native GUI/resource evidence remains scoped to its recorded
production ELF; this regression concerns development source serving.
