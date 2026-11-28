import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyEditorCloseCommands,
  verifyPreviewCloseCommands,
} from '../../scripts/native-close-controls.mjs';

const expected = [
  [
    'enable_editor_close_guard',
    { version: 0 },
    'Unsupported editor close protocol',
  ],
  [
    'editor_close_state',
    { epoch: 'forged-close-epoch' },
    'Unknown editor close epoch',
  ],
  [
    'resolve_editor_close',
    {
      epoch: 'forged-close-epoch',
      request: 'forged-close-request',
      action: 'cancel',
    },
    'Unknown editor close epoch',
  ],
];
test('editor controls reach exact native close domain refusals without negotiating legacy mode', async () => {
  const calls = [];
  await verifyEditorCloseCommands(async (command, args) => {
    calls.push([command, args]);
    return { ok: false, error: expected.find(([name]) => name === command)[2] };
  });
  assert.deepEqual(
    calls,
    expected.map(([command, args]) => [command, args]),
  );
});
for (const [broken] of expected)
  test(`editor close registration rejects missing/denied handler for ${broken}`, async () => {
    for (const error of [
      'Command not found',
      'Command not allowed',
      'preview has no host capabilities',
    ])
      await assert.rejects(
        verifyEditorCloseCommands(async (command) => ({
          ok: false,
          error:
            command === broken
              ? error
              : expected.find(([name]) => name === command)[2],
        })),
        { code: 'ERR_ASSERTION' },
      );
  });
test('preview controls invoke each correctly-shaped close command and reject any admitted result', async () => {
  const calls = [];
  await verifyPreviewCloseCommands(async (command, args) => {
    calls.push([command, args]);
    return { ok: false, error: 'preview has no host capabilities' };
  });
  assert.deepEqual(
    calls,
    expected.map(([command, args]) => [command, args]),
  );
  for (const [broken] of expected) {
    for (const admitted of [
      { ok: true, value: {} },
      { ok: false, error: 'Unknown editor close epoch' },
      { ok: false, error: 'Command not found' },
    ])
      await assert.rejects(
        verifyPreviewCloseCommands(async (command) =>
          command === broken ? admitted : { ok: false, error: 'not allowed' },
        ),
        { code: 'ERR_ASSERTION' },
      );
  }
});
