/** Package inspection only. Installation/runtime checks remain separate. */
import assert from 'node:assert/strict';
import { readFile, mkdtemp, rm } from 'node:fs/promises';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';
const config = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const pkg = resolve(
  process.argv[2] ||
    `src-tauri/target/release/bundle/deb/${config.productName}_${config.version}_amd64.deb`,
);
const temp = await mkdtemp(join(tmpdir(), 'pn-deb-audit-'));
const dpkg = (...args) =>
  execFileSync('dpkg-deb', args, { encoding: 'utf8' }).trim();
try {
  assert.equal(dpkg('--field', pkg, 'Package'), 'programmable-notes');
  assert.equal(dpkg('--field', pkg, 'Architecture'), 'amd64');
  assert.equal(dpkg('--field', pkg, 'Version'), config.version);
  const dependencies = dpkg('--field', pkg, 'Depends');
  for (const dep of [
    'libwebkit2gtk-4.1-0',
    'systemd',
    'dbus-user-session',
    'apparmor',
    'bubblewrap',
    'xdg-dbus-proxy',
    'packagekit',
  ])
    assert.ok(dependencies.includes(dep), `Missing dependency ${dep}`);
  dpkg('--extract', pkg, temp);
  dpkg('--control', pkg, join(temp, 'CONTROL'));
  const binary = await readFile(join(temp, 'usr/bin/programmable-notes'));
  assert.equal(binary.subarray(0, 4).toString('hex'), '7f454c46');
  assert.ok(
    !binary.includes(Buffer.from('--security-probe')) &&
      !binary.includes(Buffer.from('--security-editor')),
    'Test-only CLI shells in production binary',
  );
  const sections = execFileSync(
    'readelf',
    ['--sections', join(temp, 'usr/bin/programmable-notes')],
    { encoding: 'utf8' },
  );
  assert.ok(!sections.includes('.debug_info'), 'Unexpected debug build');
  const profile = await readFile(
    join(temp, 'etc/apparmor.d/programmable-notes'),
    'utf8',
  );
  assert.ok(profile.includes('/usr/bin/programmable-notes'));
  assert.ok(profile.includes('userns,'));
  const notices = await readFile(
    join(
      temp,
      'usr/share/doc/programmable-notes/NATIVE_THIRD_PARTY_NOTICES.txt',
    ),
  );
  const metadata = JSON.parse(
    await readFile(
      join(
        temp,
        'usr/share/doc/programmable-notes/native-notices-metadata.json',
      ),
      'utf8',
    ),
  );
  assert.equal(
    metadata.verified,
    true,
    'Native notice inventory was not verified',
  );
  assert.ok(metadata.packages.length > 0, 'Missing native notice inventory');
  assert.equal(
    createHash('sha256').update(notices).digest('hex'),
    metadata.noticeSha256,
    'Native notice text checksum differs',
  );
  const install = await readFile(join(temp, 'CONTROL/postinst'), 'utf8');
  assert.ok(
    install.includes('apparmor_parser -r /etc/apparmor.d/programmable-notes'),
  );
  assert.ok(
    !/sysctl\s|systemd-executor|unprivileged_userns/.test(
      install
        .split('\n')
        .filter((line) => !line.trim().startsWith('#'))
        .join('\n'),
    ),
    'Package modifies broader administrator policy',
  );
  console.log(
    'PACKAGE_INSPECTION_PASS',
    JSON.stringify({
      pkg,
      bytes: (await readFile(pkg)).length,
      sha256: createHash('sha256')
        .update(await readFile(pkg))
        .digest('hex'),
      binarySha256: createHash('sha256').update(binary).digest('hex'),
      dependencies,
      runtimeExecuted: false,
    }),
  );
} finally {
  await rm(temp, { recursive: true, force: true });
}
