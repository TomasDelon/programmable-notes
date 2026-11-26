import { invoke } from '@tauri-apps/api/core';

export interface DesktopUpdateCheck {
  installedVersion: string;
  state: 'disabled' | 'current' | 'available';
  availableVersion?: string;
  id?: string;
  message?: string;
}

export interface DesktopUpdateInstall {
  state: 'installed' | 'cancelled' | 'unconfirmed';
  message?: string;
}

export const desktopUpdates = {
  check: () => invoke<DesktopUpdateCheck>('desktop_update_check'),
  install: (id: string) =>
    invoke<DesktopUpdateInstall>('desktop_update_install', { id }),
};
