import { StrictMode, Suspense } from 'react';
import { createRoot } from 'react-dom/client';
import { isTauri } from '@tauri-apps/api/core';
import { RootBoundary } from './web/RootBoundary';
import { startOffline } from './web/offline';
import { EditorEntry } from './web/EditorEntry';
import { NotificationProvider } from './ui/Notifications';
import { nativeProductBootstrap } from './desktop/nativeProductBootstrap';
import { NativeProductStartup } from './desktop/NativeProductStartup';

// Native is a development candidate using the shared product and scoped native
// services. Installed Linux acceptance remains separate from this entry wiring.
const native = isTauri();
const legacy = location.pathname === '/engine';

const root = document.getElementById('root');
if (!root) throw new Error('Missing root element');
document.documentElement.dataset.runtime = native
  ? 'native'
  : legacy
    ? 'engine'
    : 'web';

const opening = <p className="boot-message">Opening your workspace…</p>;
if (native) {
  // This permanent owner boundary catches even startup chunk failures before
  // negotiation. Neither StrictMode effects nor a reload create its authority.
  const Boundary = nativeProductBootstrap.Boundary;
  createRoot(root).render(
    <Boundary>
      <StrictMode>
        <Suspense fallback={opening}>
          <NativeProductStartup />
        </Suspense>
      </StrictMode>
    </Boundary>,
  );
} else {
  createRoot(root).render(
    <StrictMode>
      <NotificationProvider>
        <RootBoundary>
          <Suspense fallback={opening}>
            <EditorEntry />
          </Suspense>
        </RootBoundary>
      </NotificationProvider>
    </StrictMode>,
  );
}

if (import.meta.env.PROD && !native && !legacy) startOffline();
