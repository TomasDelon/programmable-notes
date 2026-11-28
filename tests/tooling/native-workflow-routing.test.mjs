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
  'native-vm',
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
const vmSection = workflow.slice(workflow.indexOf('\n  native-vm:'));
const vmGuard = vmSection.match(/ {8}if: (.+)\n {8}run: \|/);
assert.ok(vmGuard, 'Expected a pre-checkout VM input guard');
const rejectVm = expression(vmGuard[1]);
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

const inlineManifest = 'scripts/native-inline-react-v1/host/Cargo.toml';
const inlineLock = 'scripts/native-inline-react-v1/host/Cargo.lock';
const inlineGate =
  '      - name: Check the fixed inline host Rust formatting\n' +
  `        run: cargo fmt --manifest-path ${inlineManifest} -- --check\n` +
  '      - name: Compile the fixed inline host (not GUI acceptance)\n' +
  `        run: cargo build --manifest-path ${inlineManifest} --release --locked --target-dir src-tauri/target\n` +
  '      - name: Test fixed native lifecycle state (headless logic, not GUI acceptance)\n' +
  `        run: cargo test --manifest-path ${inlineManifest} --release --locked --target-dir src-tauri/target\n`;
function assertInlineHostCompileGate(text) {
  const section = text.slice(
    text.indexOf('\n  native-check:'),
    text.indexOf('\n  deployment-check:'),
  );
  assert.ok(section.includes(inlineGate));
  const gateIndex = section.indexOf(inlineGate);
  const matcherIndex = section.indexOf(
    '::add-matcher::.github/native-problem-matcher.json',
  );
  assert.ok(matcherIndex >= 0 && matcherIndex < gateIndex);
  for (const setup of [
    'install -y libwebkit2gtk-4.1-dev',
    '      - run: npm ci\n',
  ]) {
    const index = section.indexOf(setup);
    assert.ok(index >= 0 && index < gateIndex);
  }
  assert.ok(
    gateIndex < section.indexOf('name: Build the production Linux package'),
  );
  assert.match(section, /runs-on: ubuntu-24\.04/);
  assert.match(section, /CARGO_BUILD_JOBS: 2/);
  const cacheKey = section.match(/^ {10}key: (.+)$/m)?.[1];
  assert.ok(cacheKey?.includes(`'${inlineLock}'`));
  assert.doesNotMatch(section, /continue-on-error:\s*true/);
  for (const mandatory of [
    'npm run native:package',
    'node scripts/verify-linux-package.mjs',
    'npm run native:autosave:test',
    'cargo test --manifest-path src-tauri/Cargo.toml --release --features custom-protocol,security-test --locked',
  ])
    assert.ok(section.includes(mandatory));
}

test('the mandatory native job compiles the fixed inline host after setup with locked shared-target dependencies', () => {
  assertInlineHostCompileGate(workflow);
});
test('the inline host compile control rejects missing formatting, unlocked builds, separate targets and stale cache keys', () => {
  for (const broken of [
    workflow.replace(
      `cargo fmt --manifest-path ${inlineManifest} -- --check`,
      'true',
    ),
    workflow.replace(
      `cargo build --manifest-path ${inlineManifest} --release --locked`,
      `cargo build --manifest-path ${inlineManifest} --release`,
    ),
    workflow.replace(
      '--target-dir src-tauri/target',
      '--target-dir other-target',
    ),
    workflow.replace(`, '${inlineLock}'`, ''),
    workflow.replace(
      '::add-matcher::.github/native-problem-matcher.json',
      '::notice::matcher omitted',
    ),
    workflow.replace(
      `cargo test --manifest-path ${inlineManifest} --release --locked`,
      `cargo test --manifest-path ${inlineManifest} --release`,
    ),
    workflow.replace(
      '      - name: Test fixed native lifecycle state (headless logic, not GUI acceptance)\n' +
        `        run: cargo test --manifest-path ${inlineManifest} --release --locked --target-dir src-tauri/target\n`,
      '',
    ),
    workflow.replace(
      '      - name: Compile the fixed inline host (not GUI acceptance)\n',
      '      - name: Compile the fixed inline host (not GUI acceptance)\n        if: false\n',
    ),
  ])
    assert.throws(() => assertInlineHostCompileGate(broken));
});

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
            'native-vm': false,
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
        native_vm: true,
        native_debian13: true,
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
test('VM admission is isolated from every other dispatch mode and never duplicates ordinary builds', () => {
  for (let mask = 0; mask < 128; mask++) {
    for (const editing_scope of scopes) {
      for (const editing_browser of browsers) {
        const inputs = Object.fromEntries(
          flags.map((flag, bit) => [flag, Boolean(mask & (1 << bit))]),
        );
        Object.assign(inputs, {
          native_vm: true,
          editing_scope,
          editing_browser,
          deployment_url: mask & 64 ? 'https://fixture.example/' : '',
        });
        const sandbox = context(inputs);
        assert.equal(evaluate(group, sandbox), 'native-vm-47');
        for (const name of names)
          assert.equal(
            Boolean(evaluate(jobs[name], sandbox)),
            name === 'native-vm',
          );
        assert.equal(
          Boolean(evaluate(rejectVm, sandbox)),
          flags.some((flag) => inputs[flag]) ||
            Boolean(inputs.deployment_url) ||
            editing_scope !== 'all' ||
            editing_browser !== 'all',
        );
      }
    }
  }
  assert.ok(
    vmSection.indexOf('Reject combined VM') <
      vmSection.indexOf('uses: actions/checkout@'),
  );
  assert.match(vmSection, /runs-on: ubuntu-24\.04/);
  assert.match(vmSection, /persist-credentials: false/);
  assert.match(vmSection, /path: \.cache\/native-vm-evidence\/smoke\.json\n/);
  assert.match(
    vmSection,
    /python3 -I -B scripts\/report-native-vm-receipt\.py/,
  );
  assert.doesNotMatch(
    vmSection,
    /path: .*\*|runs-on:.*self-hosted|permissions:.*write/,
  );
  assert.doesNotMatch(vmSection, /continue-on-error:\s*true/);
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

test('the fixed inline diagnostic requires explicit VM mode and cannot duplicate application jobs', () => {
  for (const native_vm of [false, true]) {
    const inputs = Object.fromEntries(flags.map((flag) => [flag, false]));
    Object.assign(inputs, {
      native_vm,
      native_inline_react: true,
      editing_scope: 'all',
      editing_browser: 'all',
      deployment_url: '',
    });
    const sandbox = context(inputs);
    assert.equal(evaluate(group, sandbox), 'native-vm-47');
    for (const name of names)
      assert.equal(
        Boolean(evaluate(jobs[name], sandbox)),
        name === 'native-vm',
      );
    assert.equal(Boolean(evaluate(rejectVm, sandbox)), !native_vm);
  }
  assert.match(vmSection, /if: inputs\.native_inline_react\n/);
  assert.match(
    vmSection,
    /cargo build --manifest-path scripts\/native-inline-react-v1\/host\/Cargo.toml --release --locked --target-dir src-tauri\/target/,
  );
  assert.match(
    vmSection,
    /python3 -I -B scripts\/native-vm-inline-react.py --run "\$PN_VM_ROOT"/,
  );
  assert.match(vmSection, /if: \$\{\{ !inputs\.native_inline_react \}\}/);
});

test('inline diagnostics reject mixed inputs before checkout and retain only fixed public summaries', () => {
  for (const id of ['os_evidence', 'inline_evidence']) {
    assert.match(vmSection, new RegExp(`id: ${id}\\n`));
    assert.ok(
      vmSection.includes(
        `if: always() && steps.${id}.outputs.copied == 'true'`,
      ),
    );
  }
  assert.doesNotMatch(vmSection, /if:.*hashFiles/);
  for (let mask = 1; mask < 128; mask++) {
    const inputs = Object.fromEntries(
      flags.map((flag, bit) => [flag, Boolean(mask & (1 << bit))]),
    );
    Object.assign(inputs, {
      native_vm: true,
      native_inline_react: true,
      editing_scope: 'all',
      editing_browser: 'all',
      deployment_url: mask & 64 ? 'https://fixture.example/' : '',
    });
    const sandbox = context(inputs);
    assert.equal(Boolean(evaluate(rejectVm, sandbox)), true);
    for (const name of names)
      assert.equal(
        Boolean(evaluate(jobs[name], sandbox)),
        name === 'native-vm',
      );
  }
  assert.match(
    vmSection,
    /path: \.cache\/native-vm-evidence\/inline-react\.json\n/,
  );
  assert.doesNotMatch(vmSection, /path:.*(?:auth|host\.log|PN_VM_ROOT|\*)/);
  assert.ok(
    vmSection.indexOf('Reject combined VM') <
      vmSection.indexOf('uses: actions/checkout@'),
  );
});

function assertInlineStepGuards(text) {
  const matcherIndex = text.indexOf(
    '::add-matcher::.github/native-problem-matcher.json',
  );
  assert.ok(
    matcherIndex >= 0 &&
      matcherIndex <
        text.indexOf('name: Compile only the fixed diagnostic host'),
  );
  for (const name of [
    'Prepare locked native diagnostic dependencies',
    'Register fixed host compiler error annotations',
    'Compile only the fixed diagnostic host (not the product application)',
    'Test fixed native lifecycle state before guest admission (headless logic only)',
    'Run the fixed native diagnostic after same-lifecycle OS admission',
  ]) {
    assert.ok(
      text.includes(
        `- name: ${name}\n        if: inputs.native_inline_react\n`,
      ),
    );
  }
  assert.ok(
    text.includes(
      '- name: Verify boot, SSH identity and OS admission (not native application acceptance)\n        if: ${{ !inputs.native_inline_react }}\n',
    ),
  );
}
test('each optional payload step is guarded and OS-only smoke remains mutually exclusive', () => {
  assertInlineStepGuards(vmSection);
  for (const fragment of vmSection.matchAll(
    /- name: .+\n {8}if: (?:inputs\.native_inline_react|\$\{\{ !inputs\.native_inline_react \}\})\n/g,
  )) {
    assert.throws(() =>
      assertInlineStepGuards(
        vmSection.replace(fragment[0], fragment[0].replace(/ {8}if: .+\n/, '')),
      ),
    );
  }
});

test('the sealed Debian flag requires VM mode and preserves exclusive profile preparation', () => {
  for (const native_vm of [false, true]) {
    for (const native_inline_react of [false, true]) {
      const inputs = Object.fromEntries(flags.map((flag) => [flag, false]));
      Object.assign(inputs, {
        native_vm,
        native_inline_react,
        native_debian13: true,
        editing_scope: 'all',
        editing_browser: 'all',
        deployment_url: '',
      });
      const sandbox = context(inputs);
      assert.equal(evaluate(group, sandbox), 'native-vm-47');
      for (const name of names)
        assert.equal(
          Boolean(evaluate(jobs[name], sandbox)),
          name === 'native-vm',
        );
      assert.equal(Boolean(evaluate(rejectVm, sandbox)), !native_vm);
    }
  }
  assert.ok(
    vmSection.includes(
      '- name: Prepare host-only authentication and public context\n        if: ${{ !inputs.native_debian13 }}\n',
    ),
  );
  assert.ok(
    vmSection.includes(
      '- name: Prepare sealed Debian 13 context\n        if: inputs.native_debian13\n        run: python3 -I -B scripts/native-vm-provision.py --prepare-debian13 "$PN_VM_ROOT"\n',
    ),
  );
});

test('Debian VM mode rejects unrelated dispatch inputs before checkout', () => {
  for (let mask = 1; mask < 128; mask++) {
    const inputs = Object.fromEntries(
      flags.map((flag, bit) => [flag, Boolean(mask & (1 << bit))]),
    );
    Object.assign(inputs, {
      native_vm: true,
      native_debian13: true,
      editing_scope: 'all',
      editing_browser: 'all',
      deployment_url: mask & 64 ? 'https://fixture.example/' : '',
    });
    const sandbox = context(inputs);
    assert.equal(evaluate(group, sandbox), 'native-vm-47');
    assert.equal(Boolean(evaluate(rejectVm, sandbox)), true);
    for (const name of names)
      assert.equal(
        Boolean(evaluate(jobs[name], sandbox)),
        name === 'native-vm',
      );
  }
});
