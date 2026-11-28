import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import vm from 'node:vm';

function assignment(payload, expectedLocation) {
  const source = readFileSync('src-tauri/src/preview_permissions.rs', 'utf8');
  const prefix = source.match(
    /const ASSIGNMENT_PREFIX: &str = r#"([\s\S]*?)"#;/,
  )?.[1];
  const suffix = source.match(
    /const ASSIGNMENT_SUFFIX: &str = r#"([\s\S]*?)"#;/,
  )?.[1];
  const middle = source.match(
    /const ASSIGNMENT_MIDDLE: &str = r#"([\s\S]*?)"#;/,
  )?.[1];
  assert.notEqual(prefix, undefined);
  assert.notEqual(suffix, undefined);
  assert.notEqual(middle, undefined);
  return (
    prefix +
    JSON.stringify(expectedLocation) +
    middle +
    JSON.stringify(payload) +
    suffix
  );
}

function realm(href, sandbox = 'allow-scripts', hasFrame = true) {
  const iframe = { srcdoc: '', getAttribute: () => sandbox };
  return {
    iframe,
    context: vm.createContext({
      location: { href },
      document: { querySelector: () => (hasFrame ? iframe : null) },
    }),
  };
}

test('actual assignment template treats author payload as iframe data', () => {
  for (const payload of [
    '<button>Count: 0</button>',
    '"; globalThis.parentExecuted = true; //',
    '</script><script>globalThis.parentExecuted = true</script>',
    '\\u0022; globalThis.parentExecuted = true; //\n\u2028\u2029',
  ]) {
    const expectedLocation = 'tauri://localhost/native-preview.html';
    const { iframe, context } = realm(expectedLocation);
    vm.runInContext(assignment(payload, expectedLocation), context);
    assert.equal(iframe.srcdoc, payload);
    assert.equal(context.parentExecuted, undefined);
  }
});

test('actual publisher refuses changed realm and sandbox before author assignment', () => {
  const expectedLocation = 'tauri://localhost/native-preview.html';
  const script = assignment('<button>Count: 0</button>', expectedLocation);
  for (const href of [
    'about:blank',
    'about:srcdoc',
    'tauri://localhost/index.html',
    expectedLocation + '?changed=1',
  ]) {
    const { iframe, context } = realm(href);
    assert.throws(
      () => vm.runInContext(script, context),
      /preview_publication_refused/,
    );
    assert.equal(iframe.srcdoc, '');
  }
  for (const sandbox of [
    null,
    '',
    'allow-scripts allow-same-origin',
    'allow-scripts allow-modals',
  ]) {
    const { iframe, context } = realm(expectedLocation, sandbox);
    assert.throws(
      () => vm.runInContext(script, context),
      /preview_publication_refused/,
    );
    assert.equal(iframe.srcdoc, '');
  }
  const { context } = realm(expectedLocation, 'allow-scripts', false);
  assert.throws(
    () => vm.runInContext(script, context),
    /preview_publication_refused/,
  );
});

test('shipping child uses completion callback activation rather than author initialization', () => {
  const source = readFileSync('src-tauri/src/main.rs', 'utf8');
  assert.doesNotMatch(source, /initialization_script/);
  assert.match(source, /\.on_page_load\(/);
  assert.match(source, /preview_permissions::activate/);
  assert.match(source, /\.on_download\(downloads::deny\)/);
});
