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

Product acceptance is unverified. Read product-entry-audit.json for the direct
browser/native route finding. Different direct entries need architecture review;
a matching entry alone still proves neither behavior nor native isolation. A green
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
data as an upgrade step.

\x60\x60\x60sh
sha256sum --check SHA256SUMS
sudo apt install './${filename}'
\x60\x60\x60

Open **Programmable Notes** from your desktop application launcher. Choose
**Open notes folder**, select a folder of real MD/MDX/JS/TS source files, edit and
save with Ctrl+S. Source bytes are saved through authorized native file grants,
not a browser database. Initially reselect the folder after restarting. Keep
independent backups; supported folder limits are 32 sources, 8 MiB combined,
500,000 bytes per file. Oversized or unsafe folders are refused, not truncated.

Visual mode edits Markdown and mathematics in the trusted document editor. React
executes only through the separate restricted native preview in Split mode.
If your desktop cannot enforce preview namespaces/resource limits, preview fails
closed; never disable isolation to make it run.

Settings contains the update checker and signed-package installation flow.
Until the real public signing key and distribution channel are configured, it
truthfully reports that the update channel is unavailable. No test key is trusted.
Configured updates use system PackageKit/Polkit; the app never collects a password.
Save all notes before installing. After confirmed installation, close and reopen.
If installation completion is unknown, inspect the system installer first.

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
