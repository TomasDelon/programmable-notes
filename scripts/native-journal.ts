/** Journald's underscore fields identify the sender; MESSAGE alone is untrusted. */
export function oomKillRecord(
  records: readonly unknown[],
  unit: string,
  uid: number,
): Record<string, unknown> | undefined {
  return records.find((value): value is Record<string, unknown> => {
    if (value === null || typeof value !== 'object' || Array.isArray(value))
      return false;
    const record = value as Record<string, unknown>;
    return (
      (record._EXE === '/usr/lib/systemd/systemd' ||
        record._EXE === '/lib/systemd/systemd') &&
      record._COMM === 'systemd' &&
      record._UID === String(uid) &&
      record._TRANSPORT === 'journal' &&
      record.MESSAGE_ID === 'd9b373ed55a64feb8242e02dbe79a49c' &&
      record.USER_UNIT === unit &&
      record.UNIT_RESULT === 'oom-kill'
    );
  });
}
