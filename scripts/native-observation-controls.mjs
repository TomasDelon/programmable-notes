/** Registration probe only; mocked transport does not prove native IPC denial. */
import assert from 'node:assert/strict';
const cases = [
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
export async function verifyEditorObservationCommands(invoke) {
  for (const [command, args, expected] of cases) {
    const result = await invoke(command, { ...args });
    assert.equal(result.ok, expected.ok);
    if (expected.ok) {
      assert.deepEqual(Object.keys(result).sort(), ['ok', 'value']);
      assert.deepEqual(Object.keys(result.value).sort(), ['reason', 'status']);
      assert.equal(result.value.status, expected.value.status);
      assert.equal(result.value.reason, expected.value.reason);
    } else {
      assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
      assert.equal(result.error, expected.error);
    }
  }
}
export async function verifyPreviewObservationCommands(invoke) {
  for (const [command, args] of cases) {
    const result = await invoke(command, { ...args });
    assert.equal(result.ok, false);
    assert.equal(typeof result.error, 'string');
    assert.deepEqual(Object.keys(result).sort(), ['error', 'ok']);
    assert.match(
      result.error,
      /not allowed|not permitted|denied|no host capabilities/i,
    );
  }
}
