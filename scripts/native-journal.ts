/** Journald's underscore fields identify the sender; MESSAGE alone is untrusted. */
function trustedManagerRecord(
  value: unknown,
  unit: string,
  uid: number,
): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value))
    return false;
  const record = value as Record<string, unknown>;
  return (
    (record._EXE === '/usr/lib/systemd/systemd' ||
      record._EXE === '/lib/systemd/systemd') &&
    record._COMM === 'systemd' &&
    record._UID === String(uid) &&
    record._TRANSPORT === 'journal' &&
    record.USER_UNIT === unit
  );
}

function failureRecord(
  records: readonly unknown[],
  unit: string,
  uid: number,
  result: 'oom-kill' | 'timeout',
): Record<string, unknown> | undefined {
  return records.find((value): value is Record<string, unknown> => {
    return (
      trustedManagerRecord(value, unit, uid) &&
      value.MESSAGE_ID === 'd9b373ed55a64feb8242e02dbe79a49c' &&
      value.UNIT_RESULT === result
    );
  });
}

export function oomKillRecord(
  records: readonly unknown[],
  unit: string,
  uid: number,
): Record<string, unknown> | undefined {
  return failureRecord(records, unit, uid, 'oom-kill');
}

export function runtimeExpiryRecord(
  records: readonly unknown[],
  unit: string,
  uid: number,
): Record<string, unknown> | undefined {
  if (!failureRecord(records, unit, uid, 'timeout')) return undefined;
  return records.find(
    (value): value is Record<string, unknown> =>
      trustedManagerRecord(value, unit, uid) &&
      value.MESSAGE ===
        `${unit}: Service reached runtime time limit. Stopping.`,
  );
}
