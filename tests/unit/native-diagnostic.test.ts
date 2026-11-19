import { spawnSync } from 'node:child_process';
import { mkdtempSync, existsSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { expect, it } from 'vitest';

it('refuses invalid native diagnostic repetition before checking drivers or creating fixtures', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pn-diagnostic-guard-'));
  try {
    for (const args of [
      ['--visual-cycles', '0'],
      ['--visual-cycles', '21'],
      ['--visual-cycles', 'NaN'],
      ['--visual-cycles'],
      ['--unknown'],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/native-long-paragraph.mjs', ...args],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_BINARY: join(directory, 'not-an-application'),
            NATIVE_DISPOSABLE_PROFILE: '1',
            NATIVE_FIXTURE_DIR: directory,
            NATIVE_EVIDENCE_DIR: directory,
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Expected --visual-cycles with an integer from 1 to 20',
      );
      expect(result.stderr).not.toContain('NOT RUN: native');
      expect(existsSync(join(directory, 'long-paragraph.mdx'))).toBe(false);
      expect(existsSync(join(directory, 'long-paragraph.json'))).toBe(false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses unknown or incomplete fidelity options before prerequisites and fixture writes', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pn-fidelity-flags-'));
  try {
    for (const [args, message] of [
      [['--same-name'], 'Unknown native fidelity option'],
      [['--quotes', '--visual-budge'], 'Unknown native fidelity option'],
      [['--multiline-quotes'], '--multiline-quotes requires --quotes'],
    ] as const) {
      const result = spawnSync(
        process.execPath,
        ['scripts/native-fidelity.mjs', ...args],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_BINARY: join(directory, 'not-an-application'),
            NATIVE_DISPOSABLE_PROFILE: '1',
            NATIVE_FIXTURE_DIR: directory,
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(message);
      expect(result.stderr).not.toContain('NOT RUN: native');
      expect(existsSync(join(directory, 'fidelity-acceptance.mdx'))).toBe(
        false,
      );
      expect(existsSync(join(directory, 'first'))).toBe(false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('accepts the full supported fidelity flag set before reporting missing native prerequisites', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pn-fidelity-valid-'));
  try {
    const result = spawnSync(
      process.execPath,
      [
        'scripts/native-fidelity.mjs',
        '--mixed-eol',
        '--quotes',
        '--multiline-quotes',
        '--source-navigation',
        '--visual-budget',
        '--same-names',
        '--extension-case',
      ],
      {
        encoding: 'utf8',
        timeout: 10000,
        env: {
          ...process.env,
          NATIVE_BINARY: join(directory, 'not-an-application'),
          NATIVE_DISPOSABLE_PROFILE: '1',
          NATIVE_FIXTURE_DIR: directory,
        },
      },
    );
    expect(result.error).toBeUndefined();
    expect(result.status).toBe(2);
    expect(result.stderr).toContain('NOT RUN: native WebKitGTK prerequisites');
    expect(result.stderr).not.toContain('Unknown native fidelity option');
    expect(existsSync(join(directory, 'fidelity-acceptance.mdx'))).toBe(false);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('refuses ambiguous or misspelled automatic-recovery modes before prerequisites and fixture creation', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pn-auto-flags-'));
  try {
    for (const args of [
      ['--new-note'],
      ['--extension-cas'],
      ['--new-notes', '--extension-case'],
      ['--extension-case', '--extension-case'],
      ['unexpected-positional'],
    ]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/native-auto-recovery.mjs', ...args],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_BINARY: join(directory, 'not-an-application'),
            NATIVE_DISPOSABLE_PROFILE: '1',
            NATIVE_FIXTURE_DIR: directory,
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain(
        'Expected at most one of --new-notes or --extension-case',
      );
      expect(result.stderr).not.toContain('NOT RUN: native');
      for (const name of [
        'automatic-original.mdx',
        'automatic-original.MdX',
        'editor.pid',
      ])
        expect(existsSync(join(directory, name))).toBe(false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});

it('accepts ordinary, unbound and uppercase automatic-recovery modes before missing-prerequisite reporting', () => {
  const directory = mkdtempSync(join(tmpdir(), 'pn-auto-valid-'));
  try {
    for (const args of [[], ['--new-notes'], ['--extension-case']]) {
      const result = spawnSync(
        process.execPath,
        ['scripts/native-auto-recovery.mjs', ...args],
        {
          encoding: 'utf8',
          timeout: 10000,
          env: {
            ...process.env,
            NATIVE_BINARY: join(directory, 'not-an-application'),
            NATIVE_DISPOSABLE_PROFILE: '1',
            NATIVE_FIXTURE_DIR: directory,
          },
        },
      );
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(2);
      expect(result.stderr).toContain(
        'NOT RUN: native WebKitGTK prerequisites',
      );
      for (const name of [
        'automatic-original.mdx',
        'automatic-original.MdX',
        'editor.pid',
      ])
        expect(existsSync(join(directory, name))).toBe(false);
    }
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
});
