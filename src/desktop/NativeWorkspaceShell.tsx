import { useEffect, useState, type ReactNode } from 'react';
import {
  Code2,
  FilePlus2,
  FileText,
  FolderOpen,
  HardDrive,
  Moon,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Pause,
  Redo2,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sun,
  Undo2,
  Upload,
  X,
} from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import '../web/web.css';
import './native-workspace.css';

export type NativeWorkspaceMode = 'source' | 'split' | 'visual';
export interface NativeWorkspaceShellProps {
  documents: {
    key: string;
    name: string;
    source?: string;
    dirty?: boolean;
  }[];
  selected: string;
  title: string;
  mode: NativeWorkspaceMode;
  canVisual: boolean;
  disabled?: boolean;
  saving?: boolean;
  dirty?: boolean;
  theme?: 'dark' | 'light';
  folderLabel?: string | null;
  status?: ReactNode;
  recovery?: ReactNode;
  settings?: ReactNode;
  children: ReactNode;
  onSelect: (key: string) => void;
  onModeChange: (mode: NativeWorkspaceMode) => void;
  onNew: () => void;
  onOpenFiles: () => void;
  onOpenFolder: () => void;
  onSave: () => void;
  onSaveAs: () => void;
  onSettings: () => void;
  onUndo?: () => void;
  onRedo?: () => void;
  onReopen?: () => void;
  onClose?: () => void;
  onStopPreview?: () => void;
  onRebuildPreview?: () => void;
}

/** Presentation only: the owner retains document, IPC, recovery and runtime authority. */
export function NativeWorkspaceShell({
  documents,
  selected,
  title,
  mode,
  canVisual,
  disabled = false,
  saving = false,
  dirty = false,
  theme = 'dark',
  folderLabel,
  status,
  recovery,
  settings,
  children,
  onSelect,
  onModeChange,
  onNew,
  onOpenFiles,
  onOpenFolder,
  onSave,
  onSaveAs,
  onSettings,
  onUndo,
  onRedo,
  onReopen,
  onClose,
  onStopPreview,
  onRebuildPreview,
}: NativeWorkspaceShellProps) {
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [modeOpen, setModeOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [appearance, setAppearance] = useState(theme);
  const needle = query.trim().toLocaleLowerCase();
  const matches = documents.filter(
    (document) =>
      !needle ||
      `${document.name}\n${document.key}\n${document.source ?? ''}`
        .toLocaleLowerCase()
        .includes(needle),
  );
  useEffect(() => {
    document.documentElement.dataset.theme = appearance;
    document.title = `${title} · Programmable Notes`;
  }, [appearance, title]);
  const closePanels = () => {
    setLeftOpen(false);
    setRightOpen(false);
  };
  return (
    <div
      className={
        'shell web-shell native-workspace-shell ' +
        (!leftOpen ? 'side-hidden ' : '') +
        (!rightOpen ? 'inspector-hidden' : '')
      }
      data-editor-mode={mode === 'visual' ? 'preview' : mode}
      data-save-status={saving ? 'saving' : dirty ? 'dirty' : 'saved'}
      onKeyDown={(event) => {
        if (event.key === 'Escape' && modeOpen) {
          setModeOpen(false);
          if (event.target instanceof HTMLElement) event.target.blur();
          event.preventDefault();
          event.stopPropagation();
          return;
        }
        if (event.key === 'Escape' && (leftOpen || rightOpen)) {
          closePanels();
          event.stopPropagation();
        }
      }}
    >
      <div
        className={
          'mode-island native-mode-island ' + (modeOpen ? 'is-open' : '')
        }
      >
        <div className="mode-island-surface">
          <div
            className="mode-island-actions"
            role="group"
            aria-label="Document mode"
          >
            {(['source', 'visual', 'split'] as const).map((value) => (
              <button
                key={value}
                type="button"
                className={mode === value ? 'selected' : ''}
                aria-pressed={mode === value}
                disabled={disabled || (!canVisual && value !== 'source')}
                onClick={(event) => {
                  onModeChange(value);
                  setModeOpen(false);
                  event.currentTarget.blur();
                }}
              >
                {value === 'visual'
                  ? 'Preview'
                  : value === 'source'
                    ? 'Source'
                    : 'Split'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="mode-island-handle"
          aria-label="Show document modes"
          aria-expanded={modeOpen}
          onClick={() => setModeOpen((open) => !open)}
        >
          {modeOpen && <X size={15} aria-hidden="true" />}
        </button>
      </div>
      <button
        type="button"
        className="floating-toggle floating-left"
        aria-label={leftOpen ? 'Close left panel' : 'Open left panel'}
        aria-expanded={leftOpen}
        aria-controls="notes-navigation"
        onClick={() => {
          setLeftOpen((open) => !open);
          if (window.innerWidth <= 720) setRightOpen(false);
        }}
      >
        {leftOpen ? <PanelLeftClose size={19} /> : <PanelLeftOpen size={19} />}
      </button>
      <button
        type="button"
        className="floating-toggle floating-right"
        aria-label={rightOpen ? 'Close right panel' : 'Open right panel'}
        aria-expanded={rightOpen}
        aria-controls="notes-details"
        onClick={() => {
          setRightOpen((open) => !open);
          if (window.innerWidth <= 720) setLeftOpen(false);
        }}
      >
        {rightOpen ? (
          <PanelRightClose size={19} />
        ) : (
          <PanelRightOpen size={19} />
        )}
      </button>
      {(leftOpen || rightOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          aria-label="Close open panel"
          onClick={closePanels}
        />
      )}
      <aside
        id="notes-navigation"
        className="sidebar workspace-sidebar"
        aria-label="Workspace navigation"
        aria-hidden={!leftOpen}
        inert={!leftOpen}
      >
        <header className="left-panel-heading">
          <h2>Documents</h2>
        </header>
        <div
          className="native-sidebar-actions"
          role="group"
          aria-label="Document actions"
        >
          <button
            type="button"
            className="icon-button"
            aria-label="New document"
            title="New document"
            disabled={disabled}
            onClick={onNew}
          >
            <FilePlus2 size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Open local files"
            title="Open files"
            disabled={disabled}
            onClick={onOpenFiles}
          >
            <Upload size={17} />
          </button>
          <button
            type="button"
            className="icon-button"
            aria-label="Open local folder"
            title="Open notes folder"
            disabled={disabled}
            onClick={onOpenFolder}
          >
            <FolderOpen size={17} />
          </button>
        </div>
        <label className="left-panel-search">
          <Search size={15} aria-hidden="true" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Search notes and content…"
            aria-label="Search notes and content"
          />
          {query && (
            <button
              type="button"
              aria-label="Clear sidebar search"
              onClick={() => setQuery('')}
            >
              <X size={14} />
            </button>
          )}
        </label>
        <div className="left-panel-scroll">
          <div className="left-folder-list" aria-label="Open documents">
            {matches.map((document) => (
              <button
                key={document.key}
                type="button"
                className={
                  'nav-file ' + (selected === document.key ? 'selected' : '')
                }
                title={document.key}
                aria-label={`Open ${document.name}`}
                aria-current={selected === document.key ? 'page' : undefined}
                disabled={disabled}
                onClick={() => onSelect(document.key)}
              >
                {/\.(?:md|mdx)$/i.test(document.key) ? (
                  <FileText size={14} />
                ) : (
                  <Code2 size={14} />
                )}
                <span>{document.name}</span>
                {document.dirty && (
                  <small
                    className="native-dirty-dot"
                    aria-label="Unsaved changes"
                  >
                    •
                  </small>
                )}
              </button>
            ))}
            {!matches.length && (
              <p className="left-panel-empty">No matching notes.</p>
            )}
          </div>
        </div>
        <footer className="left-panel-footer">
          <div className="left-panel-footer-item">
            <button
              type="button"
              className="left-panel-footer-row left-panel-settings"
              onClick={onSettings}
            >
              <Settings2 size={17} />
              <span>Open settings</span>
            </button>
          </div>
          <div className="left-panel-footer-item native-folder-summary">
            <HardDrive size={17} aria-hidden="true" />
            <span className="left-panel-account-label">
              <strong>Local workspace</strong>
              <small title={folderLabel ?? undefined}>
                {folderLabel || 'Files on your computer'}
              </small>
            </span>
          </div>
        </footer>
      </aside>
      <main className="main-panel" aria-label="Document workspace">
        <div className="main-scroll">
          <div className="document-wrap">
            <div className="document-heading">
              <div className="doc-title-row">
                <h1 className="doc-title-text">{title}</h1>
              </div>
            </div>
            <div className="editor-section">{children}</div>
          </div>
        </div>
        <div
          className="native-save-status"
          role="status"
          aria-label="Save status"
        >
          {saving ? 'Saving…' : dirty ? 'Unsaved changes' : 'Source unchanged'}
        </div>
      </main>
      <aside
        id="notes-details"
        className="inspector"
        aria-label="Document details"
        aria-hidden={!rightOpen}
        inert={!rightOpen}
      >
        <div className="web-detail-panel">
          <header className="web-inspector-heading">
            <h2>Document</h2>
          </header>
          <section className="web-inspector-detail-section">
            <h3>Local file</h3>
            <p className="web-detail-path">{selected}</p>
            <div className="web-action-list">
              <button type="button" disabled={disabled} onClick={onSave}>
                <Save size={16} />
                Save source
              </button>
              <button type="button" disabled={disabled} onClick={onSaveAs}>
                <Save size={16} />
                Save As
              </button>
              <button type="button" disabled={disabled} onClick={onNew}>
                <FilePlus2 size={16} />
                New note
              </button>
              <button type="button" disabled={disabled} onClick={onOpenFiles}>
                <Upload size={16} />
                Open files
              </button>
              <button type="button" disabled={disabled} onClick={onOpenFolder}>
                <FolderOpen size={16} />
                Open notes folder
              </button>
              {onUndo && (
                <button type="button" disabled={disabled} onClick={onUndo}>
                  <Undo2 size={16} />
                  Undo
                </button>
              )}
              {onRedo && (
                <button type="button" disabled={disabled} onClick={onRedo}>
                  <Redo2 size={16} />
                  Redo
                </button>
              )}
              {onReopen && (
                <button type="button" disabled={disabled} onClick={onReopen}>
                  <RotateCcw size={16} />
                  Reopen source
                </button>
              )}
              {onClose && (
                <button type="button" disabled={disabled} onClick={onClose}>
                  <X size={16} />
                  Close source
                </button>
              )}
              <button type="button" onClick={onSettings}>
                <Settings2 size={16} />
                Settings
              </button>
              <button
                type="button"
                onClick={() =>
                  setAppearance(appearance === 'dark' ? 'light' : 'dark')
                }
                aria-label={
                  appearance === 'dark'
                    ? 'Switch to light theme'
                    : 'Switch to dark theme'
                }
              >
                {appearance === 'dark' ? <Sun size={16} /> : <Moon size={16} />}
                {appearance === 'dark' ? 'Light appearance' : 'Dark appearance'}
              </button>
            </div>
          </section>
          <section
            className="web-inspector-detail-section"
            aria-label="Preview controls"
          >
            <h3>React preview</h3>
            <p className="web-inspector-subtitle">
              Runs in a separate restricted process in Split mode.
            </p>
            <div className="web-action-list">
              {onStopPreview && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onStopPreview}
                >
                  <Pause size={16} />
                  Stop preview
                </button>
              )}
              {onRebuildPreview && (
                <button
                  type="button"
                  disabled={disabled}
                  onClick={onRebuildPreview}
                >
                  <RotateCcw size={16} />
                  Rebuild preview
                </button>
              )}
            </div>
            {status}
          </section>
          {recovery && (
            <section
              className="web-inspector-detail-section"
              aria-label="Recovery controls"
            >
              <h3>Recovery</h3>
              {recovery}
            </section>
          )}
        </div>
      </aside>
      {settings}
    </div>
  );
}
