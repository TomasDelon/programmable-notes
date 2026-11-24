import { expect, it } from 'vitest';
import { deploymentOrigin } from '../../scripts/cloudflare-config';

it('uses the local acceptance server or an explicit root HTTPS deployment', () => {
  expect(deploymentOrigin()).toBe('http://127.0.0.1:4174');
  expect(deploymentOrigin('https://notes-beta.tomasdelon.com/')).toBe(
    'https://notes-beta.tomasdelon.com',
  );
  expect(deploymentOrigin('http://127.0.0.1:4174/')).toBe(
    'http://127.0.0.1:4174',
  );
});

it('rejects credential-bearing, insecure and non-root deployment addresses without echoing them', () => {
  for (const value of [
    'https://u:p@notes-beta.tomasdelon.com/',
    'https://notes-beta.tomasdelon.com/?auth=example',
    'https://notes-beta.tomasdelon.com/#fragment',
    'https://notes-beta.tomasdelon.com/prefix/',
    'http://notes-beta.tomasdelon.com/',
    'not an address',
  ]) {
    expect(() => deploymentOrigin(value)).toThrow(
      'Deployment URL must be an HTTPS origin without credentials, path, query or fragment',
    );
  }
});
