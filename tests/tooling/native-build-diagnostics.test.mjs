import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';

test('native build errors remain available as annotations when log downloads are unavailable', () => {
  const matcher = JSON.parse(
    readFileSync('.github/native-problem-matcher.json', 'utf8'),
  ).problemMatcher[0];
  const pattern = matcher.pattern[0];
  const expression = new RegExp(pattern.regexp);
  for (const line of [
    'error[E0425]: cannot find value in this scope',
    'error: could not compile the native application',
    'Error: Missing upstream license text',
  ]) {
    assert.ok(expression.exec(line)?.[pattern.message]);
  }
  for (const line of [
    '   Compiling native-updates',
    'test result: ok. 15 passed; 0 failed',
    'warning: unused import',
  ]) {
    assert.equal(expression.test(line), false);
  }
  const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
  assert.ok(
    workflow.indexOf('::add-matcher::.github/native-problem-matcher.json') <
      workflow.indexOf('npm run native:package'),
  );
});
