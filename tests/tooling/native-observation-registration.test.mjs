import assert from 'node:assert/strict';
import test from 'node:test';
import {
  verifyEditorObservationCommands,
  verifyPreviewObservationCommands,
} from '../../scripts/native-observation-controls.mjs';

const controls = [
  [
    'observe_document',
    { id: 'forged-document', revision: 'forged-revision' },
    { ok: true, value: { status: 'unavailable', reason: 'retired' } },
  ],
  [
    'watch_document',
    { id: 'forged-document', revision: 'forged-revision' },
    { ok: false, error: 'Unknown document authorization' },
  ],
  [
    'poll_document_watch',
    { id: 'forged-document', watchId: 'forged-watch' },
    { ok: false, error: 'Unknown document authorization' },
  ],
  [
    'unwatch_document',
    { id: 'forged-document', watchId: 'forged-watch' },
    { ok: false, error: 'Unknown document authorization' },
  ],
];
test('editor controls reach exact safe domain outcomes for all four registered observation commands', async () => {
  const calls = [];
  await verifyEditorObservationCommands(async (command, args) => {
    calls.push([command, args]);
    return controls.find(([name]) => name === command)[2];
  });
  assert.deepEqual(
    calls,
    controls.map(([command, args]) => [command, args]),
  );
});
for (const [broken] of controls) {
  test(`editor observation registration rejects missing or denied handler: ${broken}`, async () => {
    for (const error of [
      'Command not found',
      'Command not allowed',
      'preview has no host capabilities',
    ]) {
      await assert.rejects(
        verifyEditorObservationCommands(async (command) =>
          command === broken
            ? { ok: false, error }
            : controls.find(([name]) => name === command)[2],
        ),
        { code: 'ERR_ASSERTION' },
      );
    }
  });
  test(`preview observation probe rejects admitted or absent handler: ${broken}`, async () => {
    for (const admitted of [
      { ok: true, value: {} },
      { ok: false, error: 'Unknown document authorization' },
      { ok: false, error: 'Command not found' },
    ]) {
      await assert.rejects(
        verifyPreviewObservationCommands(async (command) =>
          command === broken ? admitted : { ok: false, error: 'not allowed' },
        ),
        { code: 'ERR_ASSERTION' },
      );
    }
  });
}
test('preview controls use all correct argument shapes and require authorization refusals', async () => {
  const calls = [];
  await verifyPreviewObservationCommands(async (command, args) => {
    calls.push([command, args]);
    return { ok: false, error: 'preview has no host capabilities' };
  });
  assert.deepEqual(
    calls,
    controls.map(([command, args]) => [command, args]),
  );
});
