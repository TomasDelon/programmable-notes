import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { RootBoundary } from './web/RootBoundary';
import { startOffline } from './web/offline';
import { EditorEntry } from './web/EditorEntry';
import { NotificationProvider } from './ui/Notifications';

// Native uses the current editor presentation with its own persistence/runtime authority.
// The legacy /engine fixture retains its regression path; offline storage is browser-only.
const native = isTauri();
const legacy = location.pathname === '/engine';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
document.documentElement.dataset.runtime = native
  ? 'native'
  : legacy
    ? 'engine'
    : 'web';

createRoot(root).render(
  <StrictMode>
    <NotificationProvider>
      <RootBoundary>
        <Suspense
          fallback={<p className="boot-message">Opening your workspace…</p>}
        >
          <EditorEntry />
        </Suspense>
      </RootBoundary>
    </NotificationProvider>
  </StrictMode>,
);

if (import.meta.env.PROD && !native && !legacy) startOffline();
