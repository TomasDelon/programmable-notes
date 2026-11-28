import { describe, expect, it } from 'vitest';
import {
  createWebState,
  validateWebState,
  parseBackup,
  serializeBackup,
} from '../../src/web/workspace';

describe('trusted core plugin workspace settings', () => {
  it('rejects unknown plugins instead of interpreting names as loadable code', () => {
    expect(() =>
      validateWebState({
        ...createWebState(),
        corePlugins: { 'https://untrusted.invalid/plugin.js': true },
      }),
    ).toThrow();
  });
  it('rejects nonboolean core activation and source-visibility values', () => {
    expect(() =>
      validateWebState({
        ...createWebState(),
        corePlugins: { react: 'false' },
      }),
    ).toThrow();
    expect(() =>
      validateWebState({
        ...createWebState(),
        previewPreferences: { showComponentSource: 'yes' },
      }),
    ).toThrow();
  });
  it('round-trips preferences without modifying any original document bytes', () => {
    const state = {
      ...createWebState(),
      corePlugins: { react: false, mathematics: true },
      previewPreferences: { showComponentSource: true },
    };
    const restored = parseBackup(serializeBackup(state));
    expect(restored).toEqual(state);
    expect(restored.workspace.files).toEqual(state.workspace.files);
  });
});

import { executablePreviewKind } from '../../src/plugins/core/react';
it('does not execute invisible MDX comment/empty expressions but keeps actual expressions live', () => {
  expect(executablePreviewKind('mdxFlowExpression', '{/* comment */}')).toBe(
    false,
  );
  expect(
    executablePreviewKind('mdxTextExpression', '{ /* first */ /* second */ }'),
  ).toBe(false);
  expect(executablePreviewKind('mdxFlowExpression', '{}')).toBe(false);
  expect(
    executablePreviewKind('mdxTextExpression', '{/* a */ value /* b */}'),
  ).toBe(true);
});
