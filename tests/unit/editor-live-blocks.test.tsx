import { act, fireEvent, render, screen } from '@testing-library/react';
import { EditorView } from '@codemirror/view';
import { redo, undo } from '@codemirror/commands';
import { describe, expect, it, vi } from 'vitest';
import { SourceEditor } from '../../src/editor/SourceEditor';
import { liveTokens } from '../../src/editor/live/livePreview';
import { rawSource } from '../../src/editor/live/rawSource';

function editorIn(container: HTMLElement): EditorView {
  return EditorView.findFromDOM(container.querySelector('.cm-editor')!)!;
}

describe('Live rendered Markdown blocks', () => {
  it('renders parser-owned bullets, ordered numbers and interactive tasks', () => {
    const source =
      '# Intro\n\n- first\n  - nested\n- [ ] pending\n- [X] complete\n\n3. third\n9. fourth\n';
    const ui = render(
      <SourceEditor source={source} onChange={() => {}} live />,
    );
    expect(
      [...ui.container.querySelectorAll('.cm-live-list-marker')].map(
        (marker) => marker.textContent,
      ),
    ).toEqual(['•', '•', '3.', '4.']);
    expect(
      screen.getByRole('checkbox', { name: 'Task: pending' }),
    ).not.toBeChecked();
    expect(
      screen.getByRole('checkbox', { name: 'Task: complete' }),
    ).toBeChecked();
    expect(rawSource(editorIn(ui.container).state)).toBe(source);
  });

  it('toggles exactly one task marker byte, preserving BOM, Unicode, mixed breaks and undo', () => {
    const original = '\uFEFF# Note\r\n\r\n- [ ] tâche 🧠\n- [X] done\rTail';
    const change = vi.fn();
    const ui = render(
      <SourceEditor source={original} onChange={change} live />,
    );
    const editor = editorIn(ui.container);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Task: tâche 🧠' }));
    const changed = original.replace('[ ]', '[x]');
    expect(rawSource(editor.state)).toBe(changed);
    expect(change).toHaveBeenLastCalledWith(changed);
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe(original);
    act(() => redo(editor));
    expect(rawSource(editor.state)).toBe(changed);
    fireEvent.click(screen.getByRole('checkbox', { name: 'Task: done' }));
    expect(rawSource(editor.state)).toBe(changed.replace('[X]', '[ ]'));
    act(() => undo(editor));
    expect(rawSource(editor.state)).toBe(changed);
  });

  it('rejects checkbox changes during protected equation drafts and stale widget events', () => {
    const source = '# Note\n\n- [ ] pending\n\n$x$';
    const ui = render(
      <SourceEditor source={source} onChange={() => {}} live />,
    );
    const editor = editorIn(ui.container);
    const stale = screen.getByRole('checkbox', { name: 'Task: pending' });
    fireEvent.click(
      screen.getByRole('button', { name: 'Edit inline equation: x' }),
    );
    fireEvent.click(stale);
    expect(rawSource(editor.state)).toBe(source);
    expect(stale).not.toBeChecked();
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }));
    act(() =>
      editor.dispatch({
        changes: { from: editor.state.doc.length, insert: '!' },
      }),
    );
    fireEvent.click(stale);
    expect(rawSource(editor.state)).toBe(source + '!');
  });

  it('respects the document transaction guard when checkbox changes are refused', () => {
    const source = '# Note\n\n- [ ] pending';
    const ui = render(
      <SourceEditor
        source={source}
        onChange={() => {}}
        acceptChange={() => false}
        live
      />,
    );
    fireEvent.click(screen.getByRole('checkbox', { name: 'Task: pending' }));
    expect(rawSource(editorIn(ui.container).state)).toBe(source);
    expect(
      screen.getByRole('checkbox', { name: 'Task: pending' }),
    ).not.toBeChecked();
  });

  it('shows source syntax for the active list row without changing the source', () => {
    const source = '# Note\n\n- [ ] pending\n- other';
    const change = vi.fn();
    const ui = render(<SourceEditor source={source} onChange={change} live />);
    const editor = editorIn(ui.container);
    act(() =>
      editor.dispatch({ selection: { anchor: source.indexOf('pending') + 3 } }),
    );
    expect(screen.queryByRole('checkbox')).not.toBeInTheDocument();
    expect(ui.container.querySelector('.cm-content')).toHaveTextContent(
      '- [ ] pending',
    );
    expect(rawSource(editor.state)).toBe(source);
    expect(change).not.toHaveBeenCalled();
  });

  it('renders literal code and rules with safe keyboard source reveal', () => {
    const source =
      '# Note\n\n```html\n<img src=x onerror=alert(1)>\n```\n\n---\n';
    const change = vi.fn();
    const ui = render(<SourceEditor source={source} onChange={change} live />);
    const code = screen.getByLabelText('Edit code block');
    expect(code).toHaveTextContent('<img src=x onerror=alert(1)>');
    expect(code.querySelector('img')).toBeNull();
    expect(
      screen.getByRole('separator', { name: 'Edit horizontal rule' }),
    ).toBeInTheDocument();
    fireEvent.keyDown(code, { key: 'Enter' });
    expect(screen.queryByLabelText('Edit code block')).not.toBeInTheDocument();
    expect(editorIn(ui.container).state.selection.main.head).toBe(
      source.indexOf('```'),
    );
    expect(rawSource(editorIn(ui.container).state)).toBe(source);
    expect(change).not.toHaveBeenCalled();
  });

  it('does not turn code, frontmatter, JSX or escaped markers into task controls', () => {
    const source =
      '---\ntitle: - [ ] metadata\n---\n\n`- [ ] inline`\n\n```md\n- [ ] code\n```\n\n<div>- [ ] JSX</div>\n\n\\- [ ] escaped\n\n- [ ] real';
    const tokens = liveTokens(source, 'note.mdx');
    expect(
      tokens.filter((token) => token.task).map((token) => token.task?.label),
    ).toEqual(['real']);
    expect(
      tokens.filter((token) => token.code).map((token) => token.code),
    ).toEqual(['- [ ] code']);
    expect(liveTokens('- [ ] text\n<unclosed', 'note.mdx')).toEqual([]);
  });

  it('renders blockquotes and full-width display equations without source mutation', () => {
    const source =
      '# Note\n\n> quoted\n> **strong**\n\n$$\n\\forall x\\in\\mathbb{R}\n$$';
    const ui = render(
      <SourceEditor source={source} onChange={() => {}} live />,
    );
    expect(ui.container.querySelectorAll('.cm-live-blockquote')).toHaveLength(
      2,
    );
    expect(
      ui.container.querySelector('.cm-live-math-display .katex-display'),
    ).not.toBeNull();
    expect(rawSource(editorIn(ui.container).state)).toBe(source);
  });
});
