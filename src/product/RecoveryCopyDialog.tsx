import { useLayoutEffect, useRef, useState } from 'react';
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
  const lifetime = useRef<AbortController | null>(null);
  const flight = useRef(false);
  useLayoutEffect(() => {
    const controller = new AbortController();
    lifetime.current = controller;
    if (!application.snapshot().recovery?.operation)
      void application.refreshRecovery?.(controller.signal).catch((reason) => {
        if (!controller.signal.aborted) report(reason);
      });
    return () => controller.abort();
  }, [application, report]);
  const close = () => {
    lifetime.current?.abort();
    onClose();
  };
  const uncertain = recovery.attempt?.uncertain;
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
              disabled={!!recovery.operation || uncertain}
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
          {!recovery.operation && !recovery.versions.length && (
            <p>No retained versions are available.</p>
          )}
          <label>
            New vault-relative filename
            <input
              aria-label="Recovered copy filename"
              value={path}
              disabled={!!recovery.operation || uncertain}
              onChange={(event) => setPath(event.target.value)}
            />
          </label>
          <div className="web-form-actions">
            <button
              className="web-button"
              type="submit"
              disabled={
                !file ||
                !path ||
                !!recovery.operation ||
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
