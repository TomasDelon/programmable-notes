import { useCallback, useEffect, useRef, useState } from 'react';
import { nativeDocuments } from './native';
import {
  recoveryDigest,
  type RecoveryCandidate,
  type RecoveryInventory,
} from './recovery';

const noCandidates: RecoveryCandidate[] = [];
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
  candidates = noCandidates,
  onHealth,
}: {
  candidates?: RecoveryCandidate[];
  onHealth?: (health: { message: string; error: boolean }) => void;
  documentKey: string;
  name: string;
  source: string;
  baseline?: string;
  displayPath?: string;
  busy: boolean;
  restore: (file: string) => Promise<void>;
}) {
  const [automatic, setAutomatic] = useState(true);
  const [ready, setReady] = useState(false);
  const lastWritten = useRef(new Map<string, RecoveryCandidate>());
  const latestCandidates = useRef(candidates);
  const [inventory, setInventory] = useState(empty);
  const [selected, setSelected] = useState('');
  const [working, setWorking] = useState(false);
  const [notice, setNotice] = useState('');
  const [error, setError] = useState('');
  const [session] = useState(() => crypto.randomUUID());
  const running = useRef(false);
  const alive = useRef(false);
  const refresh = useCallback(async () => {
    setInventory(await nativeDocuments.snapshots());
    setReady(true);
  }, []);
  const perform = useCallback(async (action: () => Promise<void>) => {
    if (running.current) return;
    running.current = true;
    setWorking(true);
    setError('');
    try {
      await action();
    } catch (error) {
      if (alive.current) {
        setError(String(error));
        setAutomatic(false);
      }
    } finally {
      running.current = false;
      if (alive.current) setWorking(false);
    }
  }, []);
  useEffect(() => {
    alive.current = true;
    void perform(refresh);
    return () => {
      alive.current = false;
    };
    // Discovery is independent of the selected source. StrictMode reuses the in-flight request.
  }, [perform, refresh]);
  useEffect(() => {
    const problem =
      error ||
      inventory.errors[0]?.message ||
      (inventory.capacityExceeded ? 'Recovery storage exceeds its limit.' : '');
    onHealth?.({
      message: problem
        ? `Automatic recovery needs attention: ${problem}`
        : automatic
          ? 'Automatic recovery enabled for modified buffers.'
          : 'Automatic recovery paused.',
      error: Boolean(problem),
    });
  }, [automatic, error, inventory, onHealth]);
  const chosen =
    inventory.snapshots.find((s) => s.file === selected) ||
    inventory.snapshots[0];
  const identity = useCallback(
    async (candidate: RecoveryCandidate) => {
      return (
        await recoveryDigest(`buffer:${session}:${candidate.documentKey}`)
      ).slice(0, 32);
    },
    [session],
  );
  const keepCandidate = useCallback(
    async (candidate: RecoveryCandidate) => {
      const documentId = await identity(candidate);
      const head = inventory.snapshots.find(
        (s) => s.metadata.documentId === documentId,
      );
      const written = await nativeDocuments.snapshot({
        documentId,
        name: candidate.name,
        source: candidate.source,
        baseline:
          candidate.baseline === undefined
            ? null
            : await recoveryDigest(candidate.baseline),
        parent: head?.id || null,
      });
      await refresh();
      if (!written.durable)
        throw Error(
          written.warning ||
            'Snapshot publication could not be confirmed durable; previous versions retained.',
        );
      if (written.warning) throw Error(written.warning);
      lastWritten.current.set(candidate.documentKey, candidate);
      setSelected(written.snapshot.file);
      setNotice(
        written.warning ||
          'Recovery version stored separately from the original file.',
      );
    },
    [identity, inventory, refresh],
  );
  useEffect(() => {
    latestCandidates.current = candidates;
    const keys = new Set(candidates.map((c) => c.documentKey));
    for (const key of lastWritten.current.keys())
      if (!keys.has(key)) lastWritten.current.delete(key);
  }, [candidates]);
  useEffect(() => {
    if (
      !automatic ||
      !ready ||
      busy ||
      working ||
      inventory.errors.length ||
      inventory.capacityExceeded
    )
      return;
    const changed = candidates.filter((candidate) => {
      const previous = lastWritten.current.get(candidate.documentKey);
      return (
        candidate.source !== candidate.baseline &&
        (!previous ||
          previous.source !== candidate.source ||
          previous.baseline !== candidate.baseline ||
          previous.displayPath !== candidate.displayPath ||
          previous.name !== candidate.name)
      );
    });
    if (!changed.length) return;
    const timer = setTimeout(
      () =>
        void perform(async () => {
          for (const candidate of changed) {
            const latest = latestCandidates.current.find(
              (c) => c.documentKey === candidate.documentKey,
            );
            if (
              latest?.source !== candidate.source ||
              latest.baseline !== candidate.baseline ||
              latest.displayPath !== candidate.displayPath
            )
              continue;
            await keepCandidate(candidate);
          }
        }),
      2000,
    );
    return () => clearTimeout(timer);
  }, [
    automatic,
    ready,
    busy,
    working,
    candidates,
    inventory,
    perform,
    identity,
    keepCandidate,
  ]);
  return (
    <section aria-label="Versioned recovery">
      <p>
        Automatic recovery{' '}
        {automatic ? 'is enabled after two seconds of inactivity' : 'is paused'}
        . It writes only recovery records; original files require Save or Save
        As.
      </p>
      <button
        disabled={busy || working}
        onClick={() => {
          if (automatic) setAutomatic(false);
          else
            void perform(async () => {
              await refresh();
              setAutomatic(true);
            });
        }}
      >
        {automatic ? 'Pause automatic recovery' : 'Resume automatic recovery'}
      </button>
      <p>
        Recovery versions never save the original file. Restoring creates a
        separate unsaved source. Keep up to five versions per buffer; total
        storage is bounded.
      </p>
      <button
        disabled={busy || working}
        onClick={() =>
          void perform(() =>
            keepCandidate({ documentKey, name, source, baseline, displayPath }),
          )
        }
      >
        Keep versioned snapshot
      </button>
      <button disabled={busy || working} onClick={() => void perform(refresh)}>
        Refresh recovery versions
      </button>
      <button
        disabled={busy || working}
        onClick={() =>
          void perform(async () => {
            const imported = await nativeDocuments.migrateRecovery();
            await refresh();
            setNotice(
              imported
                ? 'Legacy copy imported without deleting it.'
                : 'No legacy recovery copy was found.',
            );
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
