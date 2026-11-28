// Prepare an owner testing download; this never publishes a release/update feed.
import assert from 'node:assert/strict';
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve, basename, relative } from 'node:path';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { auditEntry } from './audit-product-entry.mjs';

const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const filename = `${config.productName}_${config.version}_amd64.deb`;
const packagePath = resolve('src-tauri/target/release/bundle/deb', filename);
// Includes fail-closed native notice inventory and the production-only binary.
execFileSync(
  process.execPath,
  ['scripts/verify-linux-package.mjs', packagePath],
  { stdio: 'inherit' },
);
const bytes = await readFile(packagePath);
assert.ok(bytes.length > 0);
const digest = createHash('sha256').update(bytes).digest('hex');
const directory = resolve('.cache/linux-testing');
await mkdir(directory, { recursive: true });
await copyFile(packagePath, resolve(directory, filename));
await writeFile(resolve(directory, 'SHA256SUMS'), `${digest}  ${filename}\n`);
const entryPath = resolve('src/web/EditorEntry.tsx');
const entryAudit = auditEntry(await readFile(entryPath, 'utf8'), entryPath);
// Package only repository-relative diagnostic paths, never note content or grants.
entryAudit.entry = relative(process.cwd(), entryAudit.entry);
for (const route of Object.values(entryAudit.routes))
  route.module = relative(process.cwd(), route.module);
await writeFile(
  resolve(directory, 'product-entry-audit.json'),
  JSON.stringify(entryAudit, null, 2) + '\n',
);
const revision =
  process.env.GITHUB_SHA ||
  execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
await writeFile(
  resolve(directory, 'build.json'),
  JSON.stringify(
    {
      version: config.version,
      sourceRevision: revision,
      sourceTree: execFileSync('git', ['rev-parse', 'HEAD^{tree}'], {
        encoding: 'utf8',
      }).trim(),
      platform: 'linux-amd64-deb',
      file: basename(packagePath),
      bytes: bytes.length,
      sha256: digest,
      installedRuntimeVerified: false,
      productionSecurityReadiness: false,
      productAcceptance: 'unverified',
      deliveryClass: 'engineering-test',
      directProductEntryStatus: entryAudit.status,
      updateChannelConfigured: Boolean(
        process.env.PN_UPDATE_PUBLIC_KEY?.trim(),
      ),
    },
    null,
    2,
  ) + '\n',
);
await writeFile(
  resolve(directory, 'README.md'),
  `# Programmable Notes ${config.version}: Linux engineering test build

This is an owner testing download, not a production security certification or a
published release. The source revision and exact package digest are in build.json.
An installer/build inspection is not evidence of a successful installed GUI run.

Product acceptance is unverified. The native entry now selects the shared document workspace through a guarded
window-lifetime owner. product-entry-audit.json is a bounded EditorEntry-only
diagnostic; main.tsx native selection is outside its scope, so an inconclusive
result is not routing proof. Shared code alone proves neither behavior nor
native isolation. A green
build is not acceptance of the owner's unified local-vault product contract.
Do not present this artifact as an accepted product delivery without separate
contract acceptance and actual target-platform evidence.

Target: Linux amd64 Debian/Ubuntu desktop with AppArmor 4+, systemd 252+, WebKitGTK
4.1, DBus user session and a graphical Polkit agent. Other distributions and
architectures are not certified by this artifact.

After extracting this artifact, verify and install through the system package manager:

If replacing an older testing build, save your sources and close its editor and
preview windows first. An already running process keeps the previous interface
until it is closed. Keep your notes and recovery files; do not delete application
data as an upgrade step. Engineering builds can share a version number;
--reinstall ensures this exact local package replaces an older build of that version.

\x60\x60\x60sh
sha256sum --check SHA256SUMS
sudo apt install --reinstall './${filename}'
\x60\x60\x60

Open **Programmable Notes** from your desktop application launcher. Choose
**Choose local vault** and explicitly authorize a disposable folder of real
MD/MDX/JS/TS source files. Open a note and edit in Source or Preview. Edits are
written automatically to the original file through scoped native grants, with
revision checks; no Save button or browser database is the saving model.
Initially reselect the folder after restarting. Keep independent backups and
confirm actual disk contents while testing; installed autosave/close acceptance
is still pending. Limits are 32 loaded sources, 8 MiB combined, 500,000 bytes per
file. Oversized or unsafe scopes are refused, not truncated.

Preview edits supported Markdown and mathematics in the trusted shared editor.
Arbitrary JSX remains opaque. Native inline React execution is not yet enabled:
its startup/input and containment gates are unresolved. No separate preview
window or privileged iframe substitutes for it. Never disable isolation to make
an unsupported runtime work.

Close requests must pass the clean editor, autosave and native guard handshake.
A refused request returns to editing only after validated cancellation. An
uncertain response or fatal startup/rendering error deliberately blocks a claimed
safe close; do not treat it as confirmation that all edits reached the file.
Unpublished data may require manual recovery. Do not delete recovery data as an
upgrade step.

The shared Settings surface currently exposes appearance and core modules.
The existing signed updater backend remains separate; this candidate has no
configured public update feed or active update control. No test key is trusted.
Do not mistake an expiring Actions download for automatic update distribution.

The production source retains unresolved native renderer/CPU Stop and installed
runtime validation gates. See docs/LINUX_DESKTOP_TESTING.md and
docs/NATIVE_SECURITY.md in the linked repository for reproducible procedures.
Do not use hostile third-party documents as your first test.

GitHub Actions testing downloads expire according to artifact retention. They are
not the permanent update feed. Notes and personal folders are not in this package.
`,
);
console.log(
  `Prepared Linux testing download (${bytes.length} bytes); runtime verification remains separate.`,
);
