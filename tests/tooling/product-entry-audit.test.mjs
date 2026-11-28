import assert from 'node:assert/strict';
import { readFileSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import test from 'node:test';
import { auditEntry } from '../../scripts/audit-product-entry.mjs';

const script = new URL(
  '../../scripts/audit-product-entry.mjs',
  import.meta.url,
);
const actual = new URL('../../src/web/EditorEntry.tsx', import.meta.url);
const fixture = (body) => `
import { lazy as deferred } from 'react';
import { isTauri as desktop } from '@tauri-apps/api/core';
const Product = deferred(async () => { ${body} });
export function EditorEntry() { return <Product />; }
`;
const root = (module, name = 'Workspace') =>
  `return { default: (await import('${module}')).${name} };`;

const assertReport = (report) => {
  assert.ok(
    ['divergent', 'shared-entry-only', 'inconclusive'].includes(report.status),
  );
  assert.equal(report.productReadinessVerified, false);
  assert.equal(typeof report.entry, 'string');
  assert.equal(typeof report.routes, 'object');
  assert.ok(Array.isArray(report.reasons));
  assert.ok(Array.isArray(report.limits));
};

test('audits the actual entry without freezing its architecture; frozen legacy fixture diverges', () => {
  const report = auditEntry(readFileSync(actual, 'utf8'), actual.pathname);
  assertReport(report);
  const legacy = auditEntry(
    fixture(`
    if (desktop()) { ${root('../App', 'App')} }
    if (location.pathname === '/engine') { ${root('../App', 'App')} }
    ${root('./WebApp', 'WebApp')}
  `),
  );
  assert.equal(legacy.status, 'divergent');
  assert.equal(legacy.routes.native.export, 'App');
  assert.equal(legacy.routes.browser.export, 'WebApp');
  assertReport(legacy);
});

test('recognizes shared root and ignores explicit engine fixture', () => {
  const report = auditEntry(
    fixture(`
    if (location.pathname === '/engine') { await import('./fixture.css'); ${root('./old', 'Engine')} }
    ${root('./arbitrary-product')}
  `),
    '/fixture/OtherEntry.tsx',
  );
  assert.equal(report.status, 'shared-entry-only');
  assert.equal(report.routes.native.module, '/fixture/arbitrary-product');
  assert.equal(report.productReadinessVerified, false);
});

test('accepts directly rendered static named and default relative imports', () => {
  for (const [binding, expectedExport] of [
    ['{ ProductApp as Workspace }', 'ProductApp'],
    ['Workspace', 'default'],
  ]) {
    const report = auditEntry(
      `
      import ${binding} from '../app/ProductApp';
      export function EditorEntry() { return <Workspace />; }
    `,
      '/fixture/web/Entry.tsx',
    );
    assertReport(report);
    assert.equal(report.status, 'shared-entry-only');
    assert.deepEqual(report.routes.native, {
      module: '/fixture/app/ProductApp',
      export: expectedExport,
    });
    assert.deepEqual(report.routes.browser, report.routes.native);
  }
  const conditional = auditEntry(`
    import { ProductApp } from '../app/ProductApp';
    export function EditorEntry() { return unknown ? <ProductApp /> : <Other />; }
  `);
  assert.equal(conditional.status, 'inconclusive');
});

test('resolves aliased imports and different filenames or exports as divergence', () => {
  for (const second of [
    root('./other-file'),
    root('./first-file', 'OtherExport'),
  ]) {
    const report = auditEntry(
      fixture(`if (desktop()) { ${root('./first-file')} } ${second}`),
    );
    assert.equal(report.status, 'divergent');
  }
});

test('handles aliased routing and normalized relative paths sharing a root', () => {
  const report = auditEntry(
    fixture(
      `if (!desktop()) { ${root('./nested/../same')} } else { ${root('./same')} }`,
    ),
  );
  assert.equal(report.status, 'shared-entry-only');
});

test('unknown conditions, shadowed-looking calls, decoys and malformed source are inconclusive', () => {
  for (const source of [
    fixture(`if (featureFlag) { ${root('./same')} } ${root('./same')}`),
    fixture(`if (isTauri()) { ${root('./a')} } ${root('./b')}`),
    fixture(`${root('./same')}`).replace(
      'return <Product />',
      'return <Different />',
    ),
    fixture(`const decision = desktop(); ${root('./same')}`),
    'export function EditorEntry( {',
    fixture('return { default: Unknown };'),
  ])
    assert.equal(auditEntry(source).status, 'inconclusive');
});

test('default CLI is informational; strict mode rejects divergence and inconclusive', () => {
  const current = spawnSync(process.execPath, [script.pathname], {
    encoding: 'utf8',
  });
  assert.equal(current.status, 0);
  assertReport(JSON.parse(current.stdout));
  const directory = mkdtempSync(join(tmpdir(), 'product-entry-audit-'));
  try {
    for (const [body, expected] of [
      [root('./same'), 0],
      [`if (desktop()) { ${root('./a')} } ${root('./b')}`, 1],
      [`if (unknown) { ${root('./a')} } ${root('./b')}`, 1],
    ]) {
      const path = join(directory, 'Alternate.tsx');
      writeFileSync(path, fixture(body));
      const result = spawnSync(
        process.execPath,
        [script.pathname, '--entry', path, '--require-shared-entry'],
        { encoding: 'utf8' },
      );
      assert.equal(result.status, expected, result.stderr);
      assert.equal(JSON.parse(result.stdout).productReadinessVerified, false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

test('malformed CLI arguments and unreadable files fail safely', () => {
  for (const args of [
    ['--entry'],
    ['--entry', '--require-shared-entry'],
    ['--unknown'],
    ['--require-shared-entry', '--require-shared-entry'],
    ['--entry', '/does-not-exist/entry.tsx'],
  ]) {
    const result = spawnSync(process.execPath, [script.pathname, ...args], {
      encoding: 'utf8',
    });
    assert.equal(result.status, 2);
    assert.match(result.stderr, /Usage:/);
    assert.equal(result.stdout, '');
  }
});
