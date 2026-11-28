import { mathematicsPlugin } from './core/math';
import { reactPlugin } from './core/react';

/** Build-time allowlist, not a document-controlled or community plugin loader. */
export const CORE_PLUGINS = [mathematicsPlugin, reactPlugin] as const;
export type CorePluginId = (typeof CORE_PLUGINS)[number]['id'];
export type CorePluginSettings = Partial<Record<CorePluginId, boolean>>;
export interface PreviewPreferences {
  showComponentSource?: boolean;
}

export function corePluginEnabled(
  settings: CorePluginSettings | undefined,
  id: CorePluginId,
): boolean {
  return !settings || !Object.hasOwn(settings, id) || settings[id] !== false;
}
function record(value: unknown): value is Record<string, unknown> {
  return (
    value !== null &&
    typeof value === 'object' &&
    !Array.isArray(value) &&
    (Object.getPrototypeOf(value) === Object.prototype ||
      Object.getPrototypeOf(value) === null)
  );
}
export function validCorePluginSettings(
  value: unknown,
): value is CorePluginSettings {
  return (
    record(value) &&
    Object.entries(value).every(
      ([id, enabled]) =>
        CORE_PLUGINS.some((plugin) => plugin.id === id) &&
        typeof enabled === 'boolean',
    )
  );
}
export function validPreviewPreferences(
  value: unknown,
): value is PreviewPreferences {
  return (
    record(value) &&
    Object.entries(value).every(
      ([id, enabled]) =>
        id === 'showComponentSource' && typeof enabled === 'boolean',
    )
  );
}
