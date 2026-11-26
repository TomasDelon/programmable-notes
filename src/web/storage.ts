import { createCloudStorage } from './cloudStorage';
import * as browser from './persistence';
import { storageMode } from './storageMode';

export {
  RecoveryReadUnavailableError,
  WorkspaceConflictError,
  type RetainedAttempt,
  type StoredWorkspace,
} from './persistence';

export const cloudStorageEnabled =
  storageMode(import.meta.env.VITE_STORAGE_BACKEND) === 'cloud';
export const workspaceAutosaveDelay = cloudStorageEnabled ? 2000 : 250;

const storage = cloudStorageEnabled ? createCloudStorage() : browser;

export const readWorkspace: typeof browser.readWorkspace = (...args) =>
  storage.readWorkspace(...args);
export const readWorkspaceRevision: typeof browser.readWorkspaceRevision = (
  ...args
) => storage.readWorkspaceRevision(...args);
export const writeWorkspace: typeof browser.writeWorkspace = (...args) =>
  storage.writeWorkspace(...args);
export const listRecoveryVersions: typeof browser.listRecoveryVersions = (
  ...args
) => storage.listRecoveryVersions(...args);
export const readRecoveryVersion: typeof browser.readRecoveryVersion = (
  ...args
) => storage.readRecoveryVersion(...args);
export const readRecoverySnapshots: typeof browser.readRecoverySnapshots = (
  ...args
) => storage.readRecoverySnapshots(...args);
export const readRetainedAttempts: typeof browser.readRetainedAttempts = (
  ...args
) => storage.readRetainedAttempts(...args);
export const writeRetainedAttempt: typeof browser.writeRetainedAttempt = (
  ...args
) => storage.writeRetainedAttempt(...args);
export const deleteRetainedAttempt: typeof browser.deleteRetainedAttempt = (
  ...args
) => storage.deleteRetainedAttempt(...args);
