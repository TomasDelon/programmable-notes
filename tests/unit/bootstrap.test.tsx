import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { EditorState } from '@codemirror/state';
import { EditorView } from '@codemirror/view';
import { markdown } from '@codemirror/lang-markdown';
import { defaultKeymap } from '@codemirror/commands';
import { keymap } from '@codemirror/view';
import { App } from '../../src/App';

describe('toolchain smoke tests', () => {
  it('renders the React shell and compiled MDX', () => {
    render(<App />);
    expect(
      screen.getByRole('heading', { level: 1, name: 'Programmable Notes' }),
    ).toBeVisible();
    expect(screen.getByRole('main')).toHaveTextContent('technical handoff');
  });

  it('creates, updates, and destroys a CodeMirror 6 Markdown view', () => {
    const parent = document.createElement('div');
    document.body.append(parent);
    const view = new EditorView({
      state: EditorState.create({
        doc: '# Bootstrap',
        extensions: [markdown(), keymap.of(defaultKeymap)],
      }),
      parent,
    });
    try {
      expect(parent.querySelector('.cm-content')).toHaveTextContent(
        '# Bootstrap',
      );
      view.dispatch({
        changes: { from: 2, to: view.state.doc.length, insert: 'Ready' },
      });
      expect(view.state.doc.toString()).toBe('# Ready');
      expect(parent.querySelector('.cm-content')).toHaveTextContent('# Ready');
    } finally {
      view.destroy();
      expect(parent).toBeEmptyDOMElement();
      parent.remove();
    }
  });
});
