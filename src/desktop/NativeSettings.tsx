import { useEffect, useRef, useState } from 'react';
import {
  desktopUpdates,
  type DesktopUpdateCheck,
  type DesktopUpdateInstall,
} from './updates';

interface NativeSettingsProps {
  open: boolean;
  onClose: () => void;
  notesFolder: string | null;
  canOpenFolder: boolean;
  onOpenFolder: () => Promise<void>;
  canInstall: boolean;
  restartRequired: boolean;
  onInstall: (id: string) => Promise<DesktopUpdateInstall>;
}

export function NativeSettings({
  open,
  onClose,
  notesFolder,
  canOpenFolder,
  onOpenFolder,
  canInstall,
  restartRequired,
  onInstall,
}: NativeSettingsProps) {
  const panel = useRef<HTMLDialogElement>(null);
  const [check, setCheck] = useState<DesktopUpdateCheck | null>(null);
  const [working, setWorking] = useState<'checking' | 'installing' | null>(
    null,
  );
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const installing = working === 'installing';

  useEffect(() => {
    const dialog = panel.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  async function checkForUpdates() {
    if (working || restartRequired) return;
    setWorking('checking');
    setCheck(null);
    setMessage('');
    setError('');
    try {
      setCheck(await desktopUpdates.check());
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(null);
    }
  }

  async function installUpdate() {
    const id = check?.id;
    if (!canInstall || working || check?.state !== 'available' || !id) return;
    setWorking('installing');
    // A ticket can authorize only one attempt. A cancellation requires rechecking.
    setCheck(null);
    setMessage('');
    setError('');
    try {
      const result = await onInstall(id);
      setMessage(
        result.state === 'installed'
          ? 'Update installed. Close and reopen Programmable Notes to use it.'
          : result.message ||
              (result.state === 'unconfirmed'
                ? 'The update result is unconfirmed. Check the system installer before reopening Programmable Notes.'
                : 'Update cancelled. Check again to get a new update offer.'),
      );
    } catch (reason) {
      setError(String(reason));
    } finally {
      setWorking(null);
    }
  }

  const available =
    check?.state === 'available' && check.id && check.availableVersion;
  return (
    <dialog
      ref={panel}
      className="native-settings"
      aria-labelledby="native-settings-title"
      onClose={onClose}
      onCancel={(event) => {
        if (installing) event.preventDefault();
      }}
    >
      <header>
        <h2 id="native-settings-title">Settings</h2>
        <button
          type="button"
          disabled={installing}
          onClick={() => panel.current?.close()}
        >
          Close
        </button>
      </header>
      <section aria-labelledby="native-folder-settings">
        <h3 id="native-folder-settings">Notes folder</h3>
        <p className="native-settings-path">
          {notesFolder ? (
            <>
              Last opened this session <bdi>{notesFolder}</bdi>
            </>
          ) : (
            'No notes folder opened this session.'
          )}
        </p>
        <p>
          Save source writes to the opened file on this computer. Open the
          folder again after restarting.
        </p>
        <button
          type="button"
          disabled={!canOpenFolder || installing}
          onClick={() => void onOpenFolder()}
        >
          Choose notes folder
        </button>
      </section>
      <section aria-labelledby="native-update-settings">
        <h3 id="native-update-settings">Updates</h3>
        {check && <p>Running version {check.installedVersion}</p>}
        <button
          type="button"
          disabled={working !== null || restartRequired}
          onClick={() => void checkForUpdates()}
        >
          Check for updates
        </button>
        {available && (
          <>
            <p>Version {check.availableVersion} is available.</p>
            {check.message && <p>{check.message}</p>}
            {!canInstall && (
              <p>
                Save all sources and finish pending edits before installing.
              </p>
            )}
            <button
              type="button"
              disabled={!canInstall || working !== null}
              onClick={() => void installUpdate()}
            >
              Download and install
            </button>
          </>
        )}
        {error && <p role="alert">{error}</p>}
        {(working || message || (check && !available)) && (
          <p role="status">
            {working === 'checking'
              ? 'Checking for updates…'
              : installing
                ? 'Preparing the update…'
                : message ||
                  check?.message ||
                  (check?.state === 'current'
                    ? 'This version is up to date.'
                    : 'A signed update channel is unavailable.')}
          </p>
        )}
      </section>
    </dialog>
  );
}
