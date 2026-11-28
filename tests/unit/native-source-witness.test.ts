import { act, renderHook, cleanup } from '@testing-library/react';
import { afterEach, expect, it, vi } from 'vitest';
import { useDocuments } from '../../src/documents/useDocuments';

vi.mock('@tauri-apps/api/core', () => ({
  isTauri: () => true,
  invoke: vi.fn(() => Promise.resolve()),
}));
afterEach(cleanup);

it('publishes the accepted source witness synchronously before descendant history refresh', () => {
  const { result } = renderHook(() =>
    useDocuments({ 'note.mdx': '# Original\r\n' }, 'note.mdx'),
  );
  act(() => {
    result.current.change('# Edited\r\n');
    expect(result.current.isCurrentSource('note.mdx', '# Edited\r\n')).toBe(
      true,
    );
    expect(result.current.isCurrentSource('note.mdx', '# Original\r\n')).toBe(
      false,
    );
    result.current.change('# Original\r\n');
    expect(result.current.isCurrentSource('note.mdx', '# Edited\r\n')).toBe(
      false,
    );
    expect(result.current.isCurrentSource('note.mdx', '# Original\r\n')).toBe(
      true,
    );
  });
  expect(result.current.workspace.files['note.mdx']).toBe('# Original\r\n');
});
