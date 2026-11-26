import { lazy } from 'react';
import { isTauri } from '@tauri-apps/api/core';

const Editor = lazy(async () => {
  if (isTauri()) return { default: (await import('../App')).App };
  if (location.pathname === '/engine') {
    await import('../styles.css');
    return { default: (await import('../App')).App };
  }
  return { default: (await import('./WebApp')).WebApp };
});

export function EditorEntry() {
  return <Editor />;
}
