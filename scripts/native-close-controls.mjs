/** Fixed native registration controls; transport-mocked tests are not IPC evidence. */
import assert from 'node:assert/strict';
const cases = [
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
export async function verifyEditorCloseCommands(invoke) {
  for (const [command, args, expected] of cases) {
    const result = await invoke(command, { ...args });
    assert.equal(result.ok, false);
    assert.equal(result.error, expected);
    assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
  }
}
export async function verifyPreviewCloseCommands(invoke) {
  for (const [command, args] of cases) {
    const result = await invoke(command, { ...args });
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.match(
      result.error,
      /not allowed|not permitted|denied|no host capabilities/i,
    );
  }
}
