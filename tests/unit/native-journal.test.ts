import { expect, it } from 'vitest';
import {
  oomKillRecord,
  runtimeExpiryRecord,
} from '../../scripts/native-journal';

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

const timeout = { ...record, UNIT_RESULT: 'timeout' };
const expiry = {
  ...record,
  MESSAGE_ID: undefined,
  UNIT_RESULT: undefined,
  MESSAGE: `${unit}: Service reached runtime time limit. Stopping.`,
};
it('requires the matching trusted runtime-limit cause and structured timeout result', () => {
  expect(runtimeExpiryRecord([timeout, expiry], unit, 1000)).toBe(expiry);
  expect(runtimeExpiryRecord([expiry], unit, 1000)).toBeUndefined();
  expect(runtimeExpiryRecord([timeout], unit, 1000)).toBeUndefined();
});
it('rejects author console text even beside a genuine timeout result', () => {
  expect(/Service reached runtime time limit/.test(expiry.MESSAGE)).toBe(true);
  for (const patch of [
    { _EXE: '/usr/lib/WebKitWebProcess', _COMM: 'WebKitWebProces' },
    { _EXE: '/usr/bin/programmable-notes' },
    { _COMM: 'another-process' },
    { _TRANSPORT: 'stdout' },
    { _UID: '1001' },
    { USER_UNIT: 'another.service' },
    { _EXE: ['/usr/lib/systemd/systemd'] },
    {
      MESSAGE: `another.service: Service reached runtime time limit. Stopping.`,
    },
  ]) {
    expect(
      runtimeExpiryRecord([timeout, { ...expiry, ...patch }], unit, 1000),
    ).toBeUndefined();
  }
});
it('rejects other timeout causes, wrong units and OOM results for runtime expiry', () => {
  for (const patch of [
    { UNIT_RESULT: 'oom-kill' },
    { UNIT_RESULT: undefined },
    { _TRANSPORT: 'stdout' },
    { _EXE: '/usr/bin/programmable-notes' },
    { _UID: '1001' },
    { USER_UNIT: 'another.service' },
    { MESSAGE_ID: 'another-message' },
  ]) {
    expect(
      runtimeExpiryRecord([{ ...timeout, ...patch }, expiry], unit, 1000),
    ).toBeUndefined();
  }
  expect(
    runtimeExpiryRecord(
      [timeout, { ...expiry, MESSAGE: `${unit}: start operation timed out.` }],
      unit,
      1000,
    ),
  ).toBeUndefined();
});
it('rejects malformed records and a console-only runtime-limit claim', () => {
  expect(
    runtimeExpiryRecord(
      [null, [], 42, { MESSAGE: expiry.MESSAGE }],
      unit,
      1000,
    ),
  ).toBeUndefined();
});
