import { useEffect, useRef, useState } from 'react';
import { nativeDocuments } from './native';
import { recoveryDigest, type RecoveryInventory } from './recovery';

const empty: RecoveryInventory = {
  snapshots: [],
  errors: [],
  capacityExceeded: false,
};
export function RecoveryHistory({
  documentKey,
  name,
  source,
  baseline,
  displayPath,
  busy,
  restore,
}: {
  documentKey: string;
  name: string;
  source: string;
  baseline?: string;
  displayPath?: string;
  busy: boolean;
  restore: (file: string) => Promise<void>;
}) {
  const [inventory, setInventory] = useState(empty);
  const [selected, setSelected] = useState('');
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [session] = useState(() => crypto.randomUUID());
  const running = useRef(false);
  const alive = useRef(false);
  async function refresh() {
    setInventory(await nativeDocuments.snapshots());
  }
  async function perform(action: () => Promise<void>) {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (alive.current) setError(String(error));
    } finally {
      running.current = false;
      if (alive.current) setWorking(false);
    }
  }
  useEffect(() => {
    alive.current = true;
    void perform(refresh);
    return () => {
      alive.current = false;
    };
    // Discovery is independent of the selected source. StrictMode reuses the in-flight request.
  }, []);
  const chosen =
    inventory.snapshots.find((s) => s.file === selected) ||
    inventory.snapshots[0];
  async function keep() {
    const documentId = (
      await recoveryDigest(
        displayPath
          ? `native-path:${displayPath}`
          : `session:${session}:${documentKey}`,
      )
    ).slice(0, 32);
    const head = inventory.snapshots.find(
      (s) => s.metadata.documentId === documentId,
    );
    const written = await nativeDocuments.snapshot({
      documentId,
      name,
      source,
      baseline: baseline === undefined ? null : await recoveryDigest(baseline),
      parent: head?.id || null,
    });
    await refresh();
    if (!written.durable)
      throw Error(
        written.warning ||
          'Snapshot publication could not be confirmed durable; previous versions retained.',
      );
    setSelected(written.snapshot.file);
    setNotice(
      written.warning ||
        'Recovery version stored separately from the original file.',
    );
  }
  return (
    <section aria-label="Versioned recovery">
      <p>
        Recovery versions never save the original file. Restoring creates a
        separate unsaved source. Keep up to five versions per document; total
        storage is bounded.
      </p>
      <button disabled={busy || working} onClick={() => void perform(keep)}>
        Keep versioned snapshot
      </button>
      <button disabled={busy || working} onClick={() => void perform(refresh)}>
        Refresh recovery versions
      </button>
      <button
        disabled={busy || working}
        onClick={() =>
          void perform(async () => {
            await nativeDocuments.migrateRecovery();
            await refresh();
            setNotice('Legacy copy imported without deleting it.');
          })
        }
      >
        Import legacy recovery copy
      </button>
      {inventory.snapshots.length > 0 && (
        <>
          <label>
            Recovery version{' '}
            <select
              aria-label="Recovery version"
              value={chosen?.file || ''}
              onChange={(e) => setSelected(e.target.value)}
            >
              {inventory.snapshots.map((s) => (
                <option key={s.file} value={s.file}>
                  {s.metadata.name} · version {s.metadata.generation} ·{' '}
                  {new Date(s.metadata.createdAtMs).toLocaleString()}
                </option>
              ))}
            </select>
          </label>
          <button
            disabled={busy || working || !chosen}
            onClick={() =>
              void perform(async () => {
                if (chosen) await restore(chosen.file);
              })
            }
          >
            Restore selected version
          </button>
          <button
            disabled={busy || working || !chosen}
            onClick={() =>
              void perform(async () => {
                if (chosen) await nativeDocuments.deleteSnapshot(chosen.file);
                await refresh();
                setNotice('Selected recovery version deleted.');
              })
            }
          >
            Delete selected version
          </button>
        </>
      )}
      {!inventory.snapshots.length && !working && (
        <p>No versioned snapshots found.</p>
      )}
      {inventory.capacityExceeded && (
        <p role="alert">
          Recovery storage exceeds its limit. Existing valid versions remain
          available; delete unneeded versions before new snapshots.
        </p>
      )}
      {inventory.errors.map((item) => (
        <div key={item.file}>
          <p role="alert">
            {item.file}: {item.message}
          </p>
          {/^[a-f0-9]{32}-[0-9]{20}-[a-f0-9]{64}\.pnrec$/.test(item.file) && (
            <button
              disabled={busy || working}
              onClick={() =>
                void perform(async () => {
                  await nativeDocuments.deleteSnapshot(item.file);
                  await refresh();
                })
              }
            >
              Delete damaged version
            </button>
          )}
        </div>
      ))}
      {error && <p role="alert">{error}</p>}
      {notice && <p aria-live="polite">{notice}</p>}
    </section>
  );
}
