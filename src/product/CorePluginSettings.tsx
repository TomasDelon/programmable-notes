import { Moon, Sun } from 'lucide-react';
import {
  CORE_PLUGINS,
  corePluginEnabled,
  type CorePluginId,
  type CorePluginSettings as Settings,
  type PreviewPreferences,
} from '../plugins/coreRegistry';

export interface CorePluginSettingsProps {
  plugins?: Settings;
  preferences?: PreviewPreferences;
  theme: 'light' | 'dark';
  onPlugin(id: CorePluginId, enabled: boolean): void;
  onSource(show: boolean): void;
  onTheme(theme: 'light' | 'dark'): void;
  onReactDisabled(): void;
}
export function CorePluginSettings({
  plugins,
  onPlugin,
  onReactDisabled,
}: Pick<CorePluginSettingsProps, 'plugins' | 'onPlugin' | 'onReactDisabled'>) {
  return (
    <section>
      <h3>Core plugins</h3>
      <p>
        Built into the application. Disabling a plugin changes presentation and
        execution, never your original note source.
      </p>
      {CORE_PLUGINS.map((plugin) => (
        <label key={plugin.id} className="web-plugin-setting">
          <input
            type="checkbox"
            checked={corePluginEnabled(plugins, plugin.id)}
            onChange={(event) => {
              if (plugin.id === 'react' && !event.target.checked)
                onReactDisabled();
              onPlugin(plugin.id, event.target.checked);
            }}
          />
          <span>
            <strong>{plugin.name}</strong>
            <small>{plugin.description}</small>
          </span>
        </label>
      ))}
      <p>
        Source editing, persistence and sandbox restrictions are always
        enforced. Only built-in core plugins are supported.
      </p>
    </section>
  );
}
export function AppearanceSettings({
  preferences,
  theme,
  onSource,
  onTheme,
}: Pick<
  CorePluginSettingsProps,
  'preferences' | 'theme' | 'onSource' | 'onTheme'
>) {
  return (
    <section>
      <h3>Appearance</h3>
      <label className="web-plugin-setting">
        <input
          type="checkbox"
          checked={preferences?.showComponentSource === true}
          onChange={(event) => onSource(event.target.checked)}
        />
        <span>
          Show component source in Preview
          <small>
            Show declarations and JSX as ordinary code blocks alongside rendered
            components.
          </small>
        </span>
      </label>
      <div className="left-panel-theme-buttons">
        <button
          type="button"
          className={theme === 'dark' ? 'selected' : ''}
          onClick={() => onTheme('dark')}
          aria-pressed={theme === 'dark'}
        >
          <Moon size={15} /> Dark
        </button>
        <button
          type="button"
          className={theme === 'light' ? 'selected' : ''}
          onClick={() => onTheme('light')}
          aria-pressed={theme === 'light'}
        >
          <Sun size={15} /> Light
        </button>
      </div>
    </section>
  );
}
