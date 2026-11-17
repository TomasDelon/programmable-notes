import { render } from '@testing-library/react';
import { expect, it, vi } from 'vitest';
import { SourceEditor } from '../../src/editor/SourceEditor';
it('does not report programmatic source replacement as a user edit', () => {
  const change = vi.fn();
  const view = render(<SourceEditor source="first" onChange={change} />);
  view.rerender(<SourceEditor source={'second\r\nline'} onChange={change} />);
  expect(change).not.toHaveBeenCalled();
});
