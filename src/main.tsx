import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { RootBoundary } from './web/RootBoundary';
import { startOffline } from './web/offline';
import { EditorEntry } from './web/EditorEntry';

// Keep the native editor and its regression fixture on their existing path.
// The browser product has its own presentation and persistence adapter.
const legacy = isTauri() || location.pathname === '/engine';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
document.documentElement.dataset.runtime = legacy ? 'engine' : 'web';

createRoot(root).render(
  <StrictMode>
    <RootBoundary>
      <Suspense
        fallback={<p className="boot-message">Opening your workspace…</p>}
      >
        <EditorEntry />
      </Suspense>
    </RootBoundary>
  </StrictMode>,
);

if (import.meta.env.PROD && !legacy) startOffline();
