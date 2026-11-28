import assert from 'node:assert/strict';
import test from 'node:test';
import { runObservationRegistration } from '../../scripts/native-observation-registration.mjs';

function fixture(failPreview = false) {
  const calls = [];
  let preview = false;
  const ports = {
    launch: async (args) => {
      calls.push(['launch', args]);
      preview = args[0] === '--security-probe';
    },
    close: async () => {
      calls.push(['close']);
    },
    invoke: async (command, args) => {
      calls.push(['invoke', command, args]);
      if (preview)
        return failPreview
          ? { ok: true, value: 'unexpected authority' }
          : { ok: false, error: 'not allowed on window preview' };
      if (command === 'host_probe')
        return { ok: true, value: 'editor-host-only' };
      if (command === 'observe_document')
        return {
          ok: true,
          value: { status: 'unavailable', reason: 'retired' },
        };
      return { ok: false, error: 'Unknown document authorization' };
    },
  };
  return { ports, calls };
}

test('registration-only journey uses both real-shell arguments and exact command probes without starting a payload or service', async () => {
  const f = fixture();
  const result = await runObservationRegistration(f.ports);
  assert.deepEqual(result, {
    editorCommands: 4,
    previewDenials: 4,
    sessionsClosed: 2,
  });
  assert.deepEqual(
    f.calls.filter((c) => c[0] === 'launch'),
    [
      ['launch', ['--security-editor']],
      ['launch', ['--security-probe']],
    ],
  );
  assert.equal(f.calls.filter((c) => c[0] === 'close').length, 2);
  const commands = f.calls.filter((c) => c[0] === 'invoke').map((c) => c[1]);
  assert(
    !commands.some((c) =>
      [
        'start_preview',
        'save_document',
        'choose_vault',
        'open_documents',
        'recovery_draft',
      ].includes(c),
    ),
  );
});

test('registration-only journey refuses an authorized preview call and still closes its session', async () => {
  const f = fixture(true);
  await assert.rejects(runObservationRegistration(f.ports));
  assert.equal(f.calls.filter((c) => c[0] === 'close').length, 2);
});
