import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import test from 'node:test';
import { runInNewContext } from 'node:vm';
import ts from 'typescript';

// Execute the real probe's editor phase with a transport boundary only. This is a
// regression for probe ordering/assertions, never evidence of native IPC/ACL behavior.
const source = readFileSync('scripts/native-webdriver.mjs', 'utf8');
const compiled = ts.transpileModule(source, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
}).outputText;
const domainError = 'Unknown or replaced vault session; select a vault again';
const commands = [
  'vault_inventory',
  'open_vault_sources',
  'create_vault_source',
];
const require = createRequire(import.meta.url);

async function editorProbe(brokenCommand, error = 'Command not found') {
  const calls = [];
  const sandbox = {
    exports: {},
    console: { log() {} },
    __builtin: (name) => require(name),
    __invoke(command, args) {
      calls.push({ command, args: args && JSON.parse(JSON.stringify(args)) });
      if (command === 'host_probe')
        return JSON.stringify({ ok: true, value: 'editor-host-only' });
      if (commands.includes(command))
        return JSON.stringify({
          ok: false,
          error: command === brokenCommand ? error : domainError,
        });
      if (command === 'stop_preview') return JSON.stringify({ ok: true });
      if (command === 'preview_connection_active')
        return JSON.stringify({ ok: true, value: false });
      if (command === 'start_preview') throw Error('END_EDITOR_PHASE');
      throw Error(`Unexpected external operation ${command}`);
    },
  };
  const running = runInNewContext(
    `(async () => {
    const native = {
      preflight: async () => {}, launch: async () => {}, close: async () => {},
      artifact: async () => '<html></html>', wd: async () => true,
      invoke: async (command, args) => JSON.parse(__invoke(command, args)),
    };
    const require = (name) => name === './native-webdriver-lib.mjs' ? native
      : name === 'node:process' ? { env: {} } : __builtin(name);
    ${compiled}
  })()`,
    sandbox,
    { timeout: 1000 },
  );
  return { calls, running };
}

test('actual probe checks correctly shaped editor registration controls before starting preview execution', async () => {
  const { calls, running } = await editorProbe();
  await assert.rejects(running, /END_EDITOR_PHASE/);
  assert.deepEqual(calls.slice(1, 4), [
    { command: 'vault_inventory', args: { vaultId: 'forged-vault' } },
    {
      command: 'open_vault_sources',
      args: { vaultId: 'forged-vault', paths: ['note.mdx'] },
    },
    {
      command: 'create_vault_source',
      args: {
        vaultId: 'forged-vault',
        path: 'note.mdx',
        source: 'registration control',
      },
    },
  ]);
  assert.equal(calls.at(-1).command, 'start_preview');
});
for (const command of commands) {
  test(`actual editor registration control rejects unknown-command and ACL errors for ${command}`, async () => {
    for (const error of [
      'Command not found',
      'Command not allowed',
      'preview has no host capabilities',
    ]) {
      const { calls, running } = await editorProbe(command, error);
      await assert.rejects(running, { code: 'ERR_ASSERTION' });
      assert(!calls.some((call) => call.command === 'start_preview'));
    }
  });
}
