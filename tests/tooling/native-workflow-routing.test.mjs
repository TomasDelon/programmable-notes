import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import test from 'node:test';
import { Script, createContext } from 'node:vm';

const workflow = readFileSync('.github/workflows/ci.yml', 'utf8');
const normalize = (text) => text.replace(/\s+/g, ' ').trim();
function expression(text) {
  text = text.trim();
  if (text.startsWith('${{')) text = text.slice(3, -2).trim();
  return new Script('(' + text + ')');
}
function lastExpression(text) {
  return [...text.matchAll(/\$\{\{([\s\S]*?)\}\}/g)].at(-1)[1];
}
const runName = workflow.slice(
  workflow.indexOf('run-name:'),
  workflow.indexOf('\non:'),
);
const concurrency = workflow.slice(
  workflow.indexOf('concurrency:'),
  workflow.indexOf('\njobs:'),
);
const groupText = lastExpression(concurrency);
const group = expression(groupText);
const names = [
  'check',
  'native-check',
  'deployment-check',
  'preview-input-regression',
  'native-preflight',
];
const jobs = Object.fromEntries(
  names.map((name) => {
    const line = workflow.match(
      new RegExp('^  ' + name + ':\\n {4}if: (.+)$', 'm'),
    );
    assert.ok(line, 'Expected explicit job routing for ' + name);
    return [name, expression(line[1])];
  }),
);
const nativeSection = workflow.slice(workflow.indexOf('\n  native-preflight:'));
const guardLine = nativeSection.match(/ {8}if: (.+)\n {8}run: \|/);
assert.ok(guardLine, 'Expected a pre-checkout native input guard');
const rejectNative = expression(guardLine[1]);
const scopes = ['all', 'core', 'math', 'source', 'authoring', 'pages'];
const browsers = ['all', 'firefox', 'webkit', 'chromium'];
const flags = [
  'native_preflight',
  'kvm_role_probe',
  'browser_qa',
  'review_artifacts',
  'editing_qa',
  'editing_core_only',
];
function context(inputs, event = 'workflow_dispatch') {
  return createContext({
    inputs,
    github: {
      event_name: event,
      workflow: 'CI',
      ref: 'refs/heads/fixture',
      run_id: 47,
    },
    format: (template, value) => template.replace('{0}', String(value)),
  });
}
function evaluate(script, sandbox) {
  return script.runInContext(sandbox, { timeout: 100 });
}

test('the visible run title and scheduler use the same concurrency decision', () => {
  assert.equal(normalize(lastExpression(runName)), normalize(groupText));
});
test('native and role requests reject mixed modes without canceling a valid native group or running privileged steps', () => {
  let cases = 0;
  for (let mask = 0; mask < 128; mask++) {
    for (const editing_scope of scopes) {
      for (const editing_browser of browsers) {
        const inputs = Object.fromEntries(
          flags.map((flag, bit) => [flag, Boolean(mask & (1 << bit))]),
        );
        Object.assign(inputs, {
          editing_scope,
          editing_browser,
          deployment_url: mask & 64 ? 'https://fixture.example/' : '',
        });
        const native = inputs.native_preflight || inputs.kvm_role_probe;
        const invalid =
          !inputs.native_preflight ||
          inputs.browser_qa ||
          inputs.review_artifacts ||
          inputs.editing_qa ||
          inputs.editing_core_only ||
          inputs.deployment_url !== '' ||
          editing_scope !== 'all' ||
          editing_browser !== 'all';
        const sandbox = context(inputs);
        const expectedGroup = native
          ? invalid
            ? 'native-preflight-invalid-47'
            : 'native-preflight'
          : inputs.editing_qa
            ? 'editing'
            : inputs.deployment_url
              ? 'deployment'
              : inputs.browser_qa
                ? 'browser-qa'
                : 'build';
        assert.equal(evaluate(group, sandbox), expectedGroup);
        assert.deepEqual(
          Object.fromEntries(
            names.map((name) => [name, Boolean(evaluate(jobs[name], sandbox))]),
          ),
          {
            check: !native && !inputs.deployment_url && !inputs.editing_qa,
            'native-check':
              !native &&
              !inputs.browser_qa &&
              !inputs.deployment_url &&
              !inputs.editing_qa,
            'deployment-check': !native && Boolean(inputs.deployment_url),
            'preview-input-regression': !native && inputs.editing_qa,
            'native-preflight': native,
          },
        );
        if (native)
          assert.equal(
            Boolean(evaluate(rejectNative, sandbox)),
            Boolean(invalid),
          );
        cases++;
      }
    }
  }
  assert.equal(cases, 3072);
});
test('automatic PR and main events keep both mandatory gates and cannot invoke a role', () => {
  for (const event of ['pull_request', 'push']) {
    for (let mask = 0; mask < 64; mask++) {
      const inputs = Object.fromEntries(
        flags.map((flag, bit) => [flag, Boolean(mask & (1 << bit))]),
      );
      Object.assign(inputs, {
        editing_scope: 'all',
        editing_browser: 'all',
        deployment_url: '',
      });
      const sandbox = context(inputs, event);
      assert.equal(evaluate(group, sandbox), 'build');
      assert.equal(Boolean(evaluate(jobs.check, sandbox)), true);
      assert.equal(Boolean(evaluate(jobs['native-check'], sandbox)), true);
      for (const name of names.slice(2))
        assert.equal(Boolean(evaluate(jobs[name], sandbox)), false);
    }
  }
});
test('role opt-in is guarded before checkout and remains a fixed optional command', () => {
  assert.ok(
    nativeSection.indexOf('Reject combined preflight') <
      nativeSection.indexOf('uses: actions/checkout@'),
  );
  assert.match(
    nativeSection,
    /name: Opt-in fixed KVM API observation under an isolated temporary role\n {8}if: inputs\.kvm_role_probe/,
  );
  assert.match(
    nativeSection,
    /run: bash scripts\/native-kvm-role-probe\.sh --api-only\n/,
  );
  assert.match(
    workflow,
    /kvm_role_probe:\n {8}description:.+\n {8}type: boolean\n {8}default: false/,
  );
});
