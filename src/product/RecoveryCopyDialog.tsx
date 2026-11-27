import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import type {
  ProductApplication,
  ProductRecoveryState,
  ProductSnapshot,
} from './productApplication';
import { ProductDialog } from '../ui/ProductDialog';

/** Trusted recovery chrome; source and native authority stay application-owned. */
export function RecoveryCopyDialog({
  application,
  recovery,
  onClose,
  report,
  onCreated,
  shouldRestoreFocus,
}: {
  application: ProductApplication;
  recovery: ProductRecoveryState;
  onClose(): void;
  report(reason: unknown): void;
  onCreated(
    before: ProductSnapshot,
    path: string,
    initiator: Element | null,
  ): void;
  shouldRestoreFocus(): boolean;
}) {
  const [file, setFile] = useState(recovery.attempt?.version.file ?? '');
  const [path, setPath] = useState(recovery.attempt?.path ?? '');
  const [discoveryState, setDiscovery] = useState<{
    application: ProductApplication;
    status: 'pending' | 'ready' | 'failed';
  }>({ application, status: 'pending' });
  const discovery =
    discoveryState.application === application
      ? discoveryState.status
      : 'pending';
  const lifetime = useRef<AbortController | null>(null);
  const discoveryFlight = useRef<object | null>(null);
  const flight = useRef(false);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    discoveryFlight.current = null;
    return () => controller.abort();
  }, [application]);
  useEffect(() => {
    const controller = lifetime.current;
    if (
      !controller ||
      controller.signal.aborted ||
      discovery !== 'pending' ||
      recovery.operation ||
      discoveryFlight.current
    )
      return;
    const request = {};
    discoveryFlight.current = request;
    // Start after synchronous effect replay has settled; retired lifetimes
    // must not reserve the application's single recovery operation.
    void Promise.resolve()
      .then(async () => {
        if (controller.signal.aborted) return;
        await application.refreshRecovery?.(controller.signal);
        if (!controller.signal.aborted)
          setDiscovery({ application, status: 'ready' });
      })
      .catch((reason) => {
        if (!controller.signal.aborted) {
          setDiscovery({ application, status: 'failed' });
          report(reason);
        }
      })
      .finally(() => {
        if (discoveryFlight.current === request) discoveryFlight.current = null;
      });
  }, [application, discovery, recovery.operation, report]);
  const close = () => {
    lifetime.current?.abort();
    onClose();
  };
  const uncertain = recovery.attempt?.uncertain;
  const pending = discovery === 'pending' || recovery.operation === 'list';
  const busy = pending || !!recovery.operation;
  return (
    <ProductDialog
      title="Recover a copy"
      onClose={close}
      shouldRestoreFocus={shouldRestoreFocus}
    >
      <div className="web-form">
        <p>
          Choose a retained version and a new filename in the selected vault.
          Original files and recovery versions are preserved.
        </p>
        {recovery.warning && (
          <p role="status">
            Some recovery versions could not be read, or storage capacity was
            exceeded. Available versions are listed below.
          </p>
        )}
        {pending && <p role="status">Loading recovery versions…</p>}
        {discovery === 'failed' && (
          <p role="status">Recovery versions could not be refreshed.</p>
        )}
        <form
          onSubmit={(event) => {
            event.preventDefault();
            const controller = lifetime.current;
            if (
              !controller ||
              controller.signal.aborted ||
              flight.current ||
              !application.restoreRecoveryCopy
            )
              return;
            const before = application.snapshot();
            const initiator = globalThis.document.activeElement;
            flight.current = true;
            void application
              .restoreRecoveryCopy(file, path, controller.signal)
              .then(() => {
                if (!controller.signal.aborted) {
                  onCreated(before, path, initiator);
                  close();
                }
              })
              .catch((reason) => {
                if (!controller.signal.aborted) report(reason);
              })
              .finally(() => {
                flight.current = false;
              });
          }}
        >
          <label>
            Recovery version
            <select
              data-autofocus
              aria-label="Recovery version"
              value={file}
              disabled={busy || uncertain}
              onChange={(event) => setFile(event.target.value)}
            >
              <option value="">Choose a version</option>
              {recovery.versions.map((version) => (
                <option key={version.file} value={version.file}>
                  {version.metadata.name} —{' '}
                  {new Date(version.metadata.createdAtMs).toISOString()} —
                  version {version.metadata.generation} —{' '}
                  {version.id.slice(0, 12)}
                </option>
              ))}
            </select>
          </label>
          {discovery === 'ready' &&
            !recovery.operation &&
            !recovery.versions.length && (
              <p>No retained versions are available.</p>
            )}
          <label>
            New vault-relative filename
            <input
              aria-label="Recovered copy filename"
              value={path}
              disabled={busy || uncertain}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <div className="web-form-actions">
            <button
              type="button"
              className="web-button"
              disabled={busy}
              onClick={() => setDiscovery({ application, status: 'pending' })}
            >
              {discovery === 'failed' ? 'Retry discovery' : 'Refresh versions'}
            </button>
            <button
              className="web-button"
              type="submit"
              disabled={
                !file ||
                !path ||
                busy ||
                uncertain ||
                !application.snapshot().vaultLabel
              }
            >
              Create recovered copy
            </button>
          </div>
        </form>
        {uncertain && (
          <p role="status">
            Creation could not be confirmed. A file may already exist. The
            selected version, filename and source remain retained; creation is
            blocked until reconciliation.
          </p>
        )}
      </div>
    </ProductDialog>
  );
}
