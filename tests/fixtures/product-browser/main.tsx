import { createRoot } from 'react-dom/client';
import { createNativeWorkspace } from '../../../src/application/nativeWorkspace';
import { createNativeProduct } from '../../../src/application/nativeProduct';
import { ProductRoot } from '../../../src/product/ProductRoot';
import { NotificationProvider } from '../../../src/ui/Notifications';

// Trusted test entry only. These OS ports are simulated, not native I/O.
const originalMixed =
  '\uFEFFimport { useState } from "react"\r\n\r\n{/* untouched */}\r\n\r\n# Mixed\r\n\r\n<Component value={{ nested: true }} />\r\n';
const files = new Map([
  [
    'primary.md',
    { source: '\uFEFF# Primary\r\n\r\nBody.\r\n', revision: 'disk-0' },
  ],
  ['mixed.mdx', { source: originalMixed, revision: 'disk-0' }],
]);
const grants = new Map<string, string>();
let sequence = 0;
let saveCalls = 0;
let failNext = false;
let closeState = { dirty: false, busy: false };
const recovery: unknown[] = [];
function acquire(logicalPath: string) {
  const file = files.get(logicalPath);
  if (!file) throw Error('Synthetic fixture file missing.');
  const id = `synthetic-grant-${++sequence}`;
  grants.set(id, logicalPath);
  return {
    id,
    logicalPath,
    ...file,
    name: logicalPath,
    displayPath: '/synthetic-vault/' + logicalPath,
    durabilityWarning: false,
  };
}
const workspace = createNativeWorkspace(
  {
    chooseVault: async () => ({
      vaultId: 'synthetic-vault',
      displayPath: '/synthetic-vault',
    }),
    vaultInventory: async () => ({
      vaultId: 'synthetic-vault',
      entries: [...files].map(([logicalPath, file]) => ({
        logicalPath,
        bytes: new TextEncoder().encode(file.source).length,
      })),
    }),
    openVaultSources: async (_vault, paths) => ({
      status: 'acquired',
      vaultId: 'synthetic-vault',
      documents: paths.map(acquire),
    }),
    createVaultSource: async (_vault, path, source) => {
      if (files.has(path)) throw Error('Synthetic file already exists.');
      files.set(path, { source, revision: `disk-${++sequence}` });
      return {
        status: 'acquired',
        vaultId: 'synthetic-vault',
        document: acquire(path),
      };
    },
    save: async (id, expected, source) => {
      saveCalls++;
      const path = grants.get(id);
      const file = path && files.get(path);
      if (!file || file.revision !== expected)
        throw Error('Synthetic revision conflict.');
      if (failNext) {
        failNext = false;
        throw Error('Synthetic write failure.');
      }
      file.source = source;
      file.revision = `disk-${++sequence}`;
      return { revision: file.revision, durable: true };
    },
    close: async (id) => {
      if (!grants.delete(id)) throw Error('Synthetic grant missing.');
    },
  },
  () => `browser-session-${++sequence}`,
);
const application = createNativeProduct(workspace, {
  setCloseState: async (state) => {
    closeState = { ...state };
  },
  preserveAttempt: async (input) => {
    recovery.push(structuredClone(input));
    return { durable: true };
  },
});
Object.assign(window, {
  productBrowserFixture: {
    originalMixed,
    read(path: string) {
      const snapshot = application.snapshot();
      const sessionId =
        snapshot.loadedDocuments.find((entry) => entry.logicalPath === path)
          ?.sessionId ?? null;
      const state = sessionId ? application.documents.state(sessionId) : null;
      return {
        disk: files.get(path)?.source,
        canonical: state?.witness.source,
        sessionId,
        status: state?.autosave.status,
        saveCalls,
        closeState,
        recoveryCopies: recovery.length,
      };
    },
    failNextSave() {
      failNext = true;
    },
    externalWrite(source: string) {
      files.set('primary.md', { source, revision: `external-${++sequence}` });
    },
  },
});
createRoot(document.getElementById('root')!).render(
  <NotificationProvider>
    <ProductRoot application={application} />
  </NotificationProvider>,
);
