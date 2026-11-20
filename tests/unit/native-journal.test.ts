import { expect, it } from 'vitest';
import { oomKillRecord } from '../../scripts/native-journal';

const unit = 'programmable-notes-preview-123-456.service';
const record = {
  _EXE: '/usr/lib/systemd/systemd',
  _COMM: 'systemd',
  _UID: '1000',
  _TRANSPORT: 'journal',
  MESSAGE_ID: 'd9b373ed55a64feb8242e02dbe79a49c',
  USER_UNIT: unit,
  UNIT_RESULT: 'oom-kill',
  MESSAGE: `${unit}: Failed with result 'oom-kill'.`,
};
it('accepts only the matching user-manager structured OOM-kill result', () => {
  expect(oomKillRecord([record], unit, 1000)).toBe(record);
  for (const patch of [
    { _EXE: '/usr/lib/WebKitWebProcess', _COMM: 'WebKitWebProces' },
    { UNIT_RESULT: 'timeout' },
    { UNIT_RESULT: undefined },
    { USER_UNIT: 'another.service' },
    { _UID: '1001' },
    { _TRANSPORT: 'stdout' },
    { MESSAGE_ID: 'another-message' },
    { _EXE: ['/usr/lib/systemd/systemd'] },
  ]) {
    expect(
      oomKillRecord([{ ...record, ...patch }], unit, 1000),
    ).toBeUndefined();
  }
});
it('does not accept allocation diagnostics or author-controlled OOM text as kernel enforcement', () => {
  expect(
    oomKillRecord(
      [
        null,
        42,
        [],
        { MESSAGE: 'RangeError: Out of memory / OOM / oom-kill' },
        {
          ...record,
          _EXE: '/usr/bin/programmable-notes',
          MESSAGE: record.MESSAGE,
        },
        {
          ...record,
          UNIT_RESULT: 'timeout',
          MESSAGE: 'OOM killer terminated the app',
        },
      ],
      unit,
      1000,
    ),
  ).toBeUndefined();
});
