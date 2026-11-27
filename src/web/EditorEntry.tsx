import { lazy } from 'react';
import { isTauri } from '@tauri-apps/api/core';

const Editor = lazy(async () => {
  // main owns native negotiation and its permanent fatal boundary. This entry
  // must never initialize browser persistence or legacy App inside a native host.
  if (isTauri()) throw Error('Native startup requires its guarded owner.');
  if (location.pathname === '/engine') {
    await import('../styles.css');
    return { default: (await import('../App')).App };
  }
  return { default: (await import('./WebApp')).WebApp };
});

export function EditorEntry() {
  return <Editor />;
}
