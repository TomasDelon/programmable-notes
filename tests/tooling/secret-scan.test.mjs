import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generateKeyPairSync } from 'node:crypto';
import { mkdtemp, writeFile, rm, copyFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

for (const archived of [false, true])
  test(
    `secret guard rejects an unused synthetic ${archived ? 'archived' : 'Git'} private key without printing its contents`,
    {
      skip:
        !process.env.PN_GITLEAKS_BIN &&
        'Requires the pinned scanner; mandatory CI security step runs this control',
    },
    async () => {
      const directory = await mkdtemp(join(tmpdir(), 'pn-secret-control-'));
      try {
        const key = generateKeyPairSync('ed25519').privateKey.export({
          type: 'pkcs8',
          format: 'pem',
        });
        await writeFile(join(directory, 'unused-fixture.pem'), key);
        const filename = archived ? 'fixture.zip' : 'unused-fixture.pem';
        if (archived) {
          const zipped = spawnSync(
            'python3',
            [
              '-c',
              "import sys,zipfile; z=zipfile.ZipFile(sys.argv[1], 'w'); z.writestr('fixture.txt', sys.stdin.buffer.read()); z.close()",
              join(directory, filename),
            ],
            { input: key, encoding: 'utf8' },
          );
          assert.equal(zipped.status, 0, 'Synthetic ZIP fixture setup failed');
          await rm(join(directory, 'unused-fixture.pem'));
          // rev-list may label this shared ZIP blob using the non-ZIP alias.
          await copyFile(join(directory, filename), join(directory, 'a.bin'));
        }
        for (const args of [
          ['init', '--quiet'],
          ['config', 'user.name', 'Security fixture'],
          ['config', 'user.email', 'fixture@users.noreply.github.com'],
          ['config', 'commit.gpgsign', 'false'],
          ['add', '--force', filename, ...(archived ? ['a.bin'] : [])],
          ['commit', '--quiet', '-m', 'Synthetic scanner control'],
        ]) {
          const result = spawnSync('git', args, {
            cwd: directory,
            encoding: 'utf8',
          });
          assert.equal(result.status, 0, 'Synthetic Git fixture setup failed');
        }
        const result = spawnSync(
          'bash',
          ['scripts/scan-secrets.sh', directory],
          {
            cwd: resolve('.'),
            encoding: 'utf8',
            timeout: 45000,
            env: {
              ...process.env,
              PN_GITLEAKS_BIN: resolve(process.env.PN_GITLEAKS_BIN),
            },
          },
        );
        assert.equal(
          result.status,
          1,
          'Guard must refuse the committed synthetic key',
        );
        assert.match(result.stdout, /private-key/);
        if (archived) {
          assert.match(
            result.stdout,
            /"secretScan":\s*"history",\s*"findings":\s*0/,
          );
          assert.match(
            result.stdout,
            /"secretScan":\s*"archives",\s*"findings":\s*1/,
          );
        }
        assert.ok(!result.stdout.includes(key.toString().split('\n')[1]));
        assert.ok(!result.stderr.includes(key.toString().split('\n')[1]));
      } finally {
        await rm(directory, { recursive: true, force: true });
      }
    },
  );
