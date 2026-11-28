import { createHash } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { setTimeout as sleep } from 'node:timers/promises';
import { deploymentOrigin } from './cloudflare-config.ts';

class VerificationError extends Error {}

function explicitOrigin(value) {
  try {
    if (!value) throw new Error();
    return deploymentOrigin(value);
  } catch {
    throw new VerificationError('Invalid deployment origin.');
  }
}

async function matchesWorker(response, expectedLength, expectedSha) {
  if (response.status !== 200 || !response.body) {
    await response.body?.cancel();
    return false;
  }
  const digest = createHash('sha256');
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.byteLength;
    if (length > expectedLength) return false;
    digest.update(chunk);
  }
  return length === expectedLength && digest.digest('hex') === expectedSha;
}

export async function verifyDeploymentBuild({
  origin,
  expectedWorker,
  fetchWorker = fetch,
  wait = sleep,
}) {
  const url = explicitOrigin(origin) + '/sw.js';
  const localWorker = expectedWorker ?? (await readFile('dist/sw.js'));
  const declarations = localWorker
    .toString('utf8')
    .split('\n')
    .filter((line) => /^\s*const\s+CACHE\b/.test(line));
  const release =
    declarations.length === 1 &&
    /^const CACHE = 'programmable-notes-web-([0-9a-f]{16})';$/.exec(
      declarations[0],
    )?.[1];
  if (!release)
    throw new VerificationError('Invalid local service worker identity.');
  const workerSha = createHash('sha256').update(localWorker).digest('hex');
  for (let attempt = 1; attempt <= 12; attempt++) {
    try {
      const response = await fetchWorker(url, {
        redirect: 'error',
        credentials: 'omit',
        cache: 'no-cache',
        signal: AbortSignal.timeout(10_000),
      });
      if (await matchesWorker(response, localWorker.length, workerSha))
        return { release, workerSha };
    } catch {
      // The next attempt gets its own deadline. Avoid printing transport details.
    }
    if (attempt < 12) await wait(5000);
  }
  throw new VerificationError(
    'Deployed service worker did not match the expected build.',
  );
}

if (import.meta.main) {
  try {
    const { release, workerSha } = await verifyDeploymentBuild({
      origin: process.env.PN_DEPLOYMENT_URL,
    });
    const summary = `Verified deployment release ${release}, worker SHA-256 ${workerSha}.`;
    console.log(summary);
    if (process.env.GITHUB_ACTIONS === 'true')
      console.log('::notice::' + summary);
  } catch (error) {
    console.error(
      error instanceof VerificationError
        ? error.message
        : 'Could not verify the deployment build.',
    );
    process.exitCode = 1;
  }
}
