import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type ComponentType,
} from 'react';
import {
  BookOpen,
  FilePlus2,
  FileText,
  FolderOpen,
  Settings2,
} from 'lucide-react';
import type { ProductApplication } from './productApplication';
import { useProductApplication } from './useProductApplication';
import {
  useWorkspaceInteraction,
  documentFormattingCommands,
  filterDocumentCommands,
} from './useWorkspaceInteraction';
import {
  WorkspaceNavigation,
  type WorkspaceNavigationHandle,
} from './WorkspaceNavigation';
import { DocumentHeader } from './DocumentHeader';
import {
  DocumentCommandPalette,
  type DocumentCommand,
} from './DocumentCommandPalette';
import { AppearanceSettings, CorePluginSettings } from './CorePluginSettings';
import { ProductDialog } from '../ui/ProductDialog';
import { useNotifications } from '../ui/useNotifications';
import { DocumentSurface } from '../workspace/DocumentSurface';
import { DocumentNavigationRow } from '../workspace/DocumentNavigationRow';
import { useDocumentSession } from '../workspace/useDocumentSession';
import type { EditorCommands, EditorHistory } from '../editor/SourceEditor';
import type { SourceBatch } from '../editor/sourceWitness';
import {
  DocumentRuntime,
  type DocumentRuntimeProps,
} from '../preview/DocumentRuntime';
import type { RenderedRuntimeProps } from '../editor/rendered/RenderedRuntime';
import {
  corePluginEnabled,
  type CorePluginSettings as PluginSettings,
  type PreviewPreferences,
} from '../plugins/coreRegistry';
import { isMdxSource } from '../sourceTypes';
import '../web/web.css';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';

export interface ProductPreferences {
  mode: 'source' | 'preview';
  theme: 'light' | 'dark';
  corePlugins?: PluginSettings;
  previewPreferences?: PreviewPreferences;
}
export interface ProductServices {
  initialPreferences?: ProductPreferences;
  writePreferences?(preferences: ProductPreferences): Promise<void>;
  documentRenderer?: ComponentType<DocumentRuntimeProps>;
  inlineRenderer?: ComponentType<RenderedRuntimeProps>;
}
const emptyServices: ProductServices = {};

/** Product interaction owns no canonical source, native grants or storage fallback. */
export function ProductRoot({
  application,
  services = emptyServices,
}: {
  application: ProductApplication;
  services?: ProductServices;
}) {
  const snapshot = useProductApplication(application);
  const id = snapshot.selectedSessionId;
  const document = useDocumentSession(application.documents, id);
  const metadata = id ? application.loadedDocument(id) : null;
  const [preferences, setPreferences] = useState<ProductPreferences>(
    () => services.initialPreferences ?? { mode: 'source', theme: 'dark' },
  );
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [sidebarView, setSidebarView] = useState<'documents' | 'connections'>(
    'documents',
  );
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [createOpen, setCreateOpen] = useState(false);
  const [filename, setFilename] = useState('Untitled.md');
  const [query, setQuery] = useState('');
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const commands = useRef<EditorCommands>(null);
  const [editorMount, setEditorMount] = useState(0);
  const closeRequests = useRef(new WeakMap<ProductApplication, string>());
  const [closeSettlement, setCloseSettlement] = useState(0);
  const mounted = useRef(false);
  useLayoutEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const closeFlight = useRef<{
    application: ProductApplication;
    request: string;
  } | null>(null);
  const histories = useRef<EditorHistory>(new Map());
  const retainedAttempts = useRef(new Map<string, SourceBatch>());
  const sourcePanel = useRef<HTMLDivElement>(null);
  const documentScroll = useRef<HTMLDivElement>(null);
  const navigation = useRef<WorkspaceNavigationHandle | null>(null);
  const { notify, dismiss } = useNotifications();
  const latest = useRef({ application, id });
  useLayoutEffect(() => {
    latest.current = { application, id };
  });
  const selectedIsNote = !!metadata && isMdxSource(metadata.logicalPath);
  const mode = selectedIsNote ? preferences.mode : 'source';
  const source = document?.witness.source ?? '';
  const reactEnabled = corePluginEnabled(preferences.corePlugins, 'react');

  const report = useCallback(
    (reason: unknown) => {
      notify({
        id: 'product-operation',
        tone: 'error',
        message: 'The operation could not finish.',
        detail: reason instanceof Error ? reason.message : String(reason),
        persistent: true,
      });
    },
    [notify],
  );
  const run = useCallback(
    (action: () => void | Promise<void>) => {
      try {
        void Promise.resolve(action()).catch(report);
      } catch (reason) {
        report(reason);
      }
    },
    [report],
  );
  function changePreferences(next: ProductPreferences) {
    setPreferences(next);
    if (services.writePreferences) run(() => services.writePreferences!(next));
  }
  function canLeave() {
    const app = latest.current.application;
    const state = app.snapshot();
    const current = state.selectedSessionId
      ? app.documents.state(state.selectedSessionId)
      : null;
    if (
      state.operation ||
      state.closing ||
      current?.unapplied ||
      current?.retainedFailures.length
    ) {
      notify({
        id: 'product-pending',
        message:
          'Finish the current edit or save its recovery text before changing notes or replacing this workspace.',
      });
      return false;
    }
    return true;
  }
  useEffect(() => {
    const request = snapshot.closeRequestId;
    if (
      !request ||
      snapshot.closeUncertain ||
      closeRequests.current.get(application) === request
    )
      return;
    // Native nonces do not repeat. Keep only the last request per live application,
    // and one flight, including React StrictMode's repeated effect setup.
    if (closeFlight.current?.application === application) return;
    closeRequests.current.set(application, request);
    const flight = { application, request };
    closeFlight.current = flight;
    const selected = snapshot.selectedSessionId;
    let detached = false;
    const stillOwnsEditor = () =>
      mounted.current &&
      latest.current.application === application &&
      latest.current.id === selected &&
      application.snapshot().selectedSessionId === selected;
    // Admit after React's synchronous effect replay/cleanup has settled. This is
    // lifecycle sequencing, not a substitute for the editor's own clean barrier.
    void Promise.resolve()
      .then(() =>
        application.prepareClose(() => {
          if (!stillOwnsEditor()) return false;
          if (selected === null) return commands.current === null;
          const detach = commands.current?.detachIfClean;
          if (!detach || !detach()) return false;
          detached = true;
          return true;
        }),
      )
      .then((outcome) => {
        // The model alone decides cancellation/durability. Only a proved return to
        // editing may remount exact owning sessions after actual clean detachment.
        if (outcome === 'editing' && detached && stillOwnsEditor())
          setEditorMount((value) => value + 1);
      })
      .catch((reason) => {
        // A rejected/uncertain completion never authorizes reopening input.
        if (stillOwnsEditor()) report(reason);
      })
      .finally(() => {
        if (closeFlight.current === flight) {
          closeFlight.current = null;
          if (mounted.current && latest.current.application === application)
            setCloseSettlement((value) => value + 1);
        }
      });
  }, [
    application,
    snapshot.closeRequestId,
    snapshot.closeUncertain,
    snapshot.selectedSessionId,
    closeSettlement,
    report,
  ]);
  const interaction = useWorkspaceInteraction({
    scope: application,
    selected: id,
    selectedId: () => application.snapshot().selectedSessionId,
    mode,
    canLeave,
    documentPath: (key) => {
      const current = application.snapshot();
      return (
        current.loadedDocuments.find((entry) => entry.sessionId === key)
          ?.logicalPath ??
        current.entries.find((entry) => entry.logicalPath === key)
          ?.logicalPath ??
        null
      );
    },
    selectDocument: (key) => {
      if (
        application
          .snapshot()
          .loadedDocuments.some((entry) => entry.sessionId === key)
      )
        application.select(key);
      else return application.open(key);
    },
    setMode: (next) => changePreferences({ ...preferences, mode: next }),
    sourcePanel,
    documentScroll,
    commands,
    onOpened: () => {
      if (window.innerWidth <= 720) setLeftOpen(false);
    },
    isCurrentSource: (key, text) => {
      const sessionId = application
        .snapshot()
        .loadedDocuments.find(
          (entry) => entry.sessionId === key || entry.logicalPath === key,
        )?.sessionId;
      return (
        !!sessionId && application.session(sessionId).witness.source === text
      );
    },
    onError: report,
  });
  useEffect(() => {
    window.document.documentElement.dataset.theme = preferences.theme;
  }, [preferences.theme]);
  useEffect(() => {
    if (snapshot.error)
      notify({
        id: 'product-workspace',
        tone: 'error',
        message: 'Workspace needs attention',
        detail: snapshot.error,
        persistent: true,
      });
    else dismiss('product-workspace');
  }, [snapshot.error, notify, dismiss]);
  useEffect(() => {
    if (document?.autosave.error)
      notify({
        id: 'product-save',
        tone: 'error',
        message: 'Your changes are not saved.',
        detail: String(document.autosave.error),
        persistent: true,
        actions: [
          {
            label: 'Retry save',
            run: () => {
              if (id) run(() => application.retrySave(id));
            },
          },
        ],
      });
    else dismiss('product-save');
  }, [document?.autosave.error, application, id, notify, dismiss, run]);
  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'k' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (!canLeave()) return;
        setCommandQuery('');
        setCommandIndex(0);
        setCommandOpen((open) => !open);
      } else if (
        (event.ctrlKey || event.metaKey) &&
        event.key.toLowerCase() === 'e' &&
        !settingsOpen &&
        !commandOpen
      ) {
        event.preventDefault();
        interaction.switchMode(
          mode === 'source' && selectedIsNote ? 'preview' : 'source',
        );
      } else if (
        event.isTrusted &&
        (event.ctrlKey || event.metaKey) &&
        !event.altKey &&
        event.key.toLowerCase() === 'z' &&
        !settingsOpen &&
        !commandOpen &&
        !createOpen
      ) {
        // Editor surfaces and forms own their own input history. Chrome focus
        // uses the same canonical editor commands, never the browser's last
        // contenteditable undo stack or a second document/history registry.
        const target = event.target;
        if (
          !(target instanceof HTMLElement) ||
          target.closest(
            'input,textarea,select,[contenteditable="true"],.cm-editor,.ProseMirror,[role="dialog"]',
          )
        )
          return;
        const app = latest.current.application;
        const state = app.snapshot();
        const editor = commands.current;
        if (
          app !== application ||
          !id ||
          state.selectedSessionId !== id ||
          state.operation ||
          state.closing ||
          state.closeUncertain ||
          !editor
        )
          return;
        event.preventDefault();
        if (!canLeave()) return;
        run(() => (event.shiftKey ? editor.redo() : editor.undo()));
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  });
  const entries = [...snapshot.entries];
  for (const loaded of snapshot.loadedDocuments)
    if (!entries.some((entry) => entry.logicalPath === loaded.logicalPath))
      entries.push({
        logicalPath: loaded.logicalPath,
        loadedSessionId: loaded.sessionId,
        bytes: 0,
      });
  const openEntry = (key: string) => run(() => interaction.openDocument(key));
  const action = (key: string) => {
    if (key === 'settings') setSettingsOpen(true);
    if (key === 'choose' && canLeave())
      run(async () => {
        await application.chooseVault();
        if (
          latest.current.application === application &&
          application.snapshot().vaultLabel
        )
          setLeftOpen(true);
      });
    if (key === 'new' && canLeave()) {
      setFilename('Untitled.md');
      setCreateOpen(true);
    }
    if (key === 'close' && id && canLeave())
      run(() => application.closeDocument(id));
  };
  const allCommands: DocumentCommand[] = [
    ...documentFormattingCommands(selectedIsNote, mode),
    ...entries.map((entry) => ({
      id: 'document:' + (entry.loadedSessionId ?? entry.logicalPath),
      name: entry.logicalPath,
      description: snapshot.vaultLabel ?? 'Local vault',
      icon: FileText,
    })),
    {
      id: 'action:source',
      name: 'Edit source',
      description: 'Edit the original document',
      icon: FileText,
      enabled: !!id,
    },
    {
      id: 'action:preview',
      name: 'Preview document',
      description: 'Edit supported Markdown directly',
      icon: BookOpen,
      enabled: selectedIsNote,
    },
    {
      id: 'action:choose',
      name: 'Choose local vault',
      description: 'Choose an authorized local folder',
      icon: FolderOpen,
      enabled: !snapshot.loadedDocuments.length,
    },
    {
      id: 'action:new',
      name: 'New document',
      description: 'Create a real file in this vault',
      icon: FilePlus2,
      enabled: !!snapshot.vaultLabel,
    },
    {
      id: 'action:settings',
      name: 'Settings',
      description: 'Appearance and core plugins',
      icon: Settings2,
    },
    ...(id
      ? [
          {
            id: 'action:close',
            name: 'Close document',
            description: 'Flush and close this document session',
            icon: FileText,
          },
        ]
      : []),
  ];
  const commandResults = filterDocumentCommands(allCommands, commandQuery);
  const saved = document?.autosave;
  const saveLabel = !saved
    ? ''
    : saved.status === 'saved' && saved.durable
      ? 'Saved to file'
      : saved.status === 'blocked'
        ? 'Not saved'
        : 'Saving…';
  return (
    <div
      className={
        'shell web-shell ' +
        (!leftOpen ? 'side-hidden ' : '') +
        (!rightOpen ? 'inspector-hidden' : '')
      }
      data-editor-mode={mode}
    >
      <WorkspaceNavigation
        mode={mode}
        selectedIsNote={selectedIsNote}
        switchMode={interaction.switchMode}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        setLeftOpen={setLeftOpen}
        setRightOpen={setRightOpen}
        sidebarView={sidebarView}
        setSidebarView={setSidebarView}
        showSettings={() => setSettingsOpen(true)}
        moveHistory={interaction.moveHistory}
        canBack={interaction.visitHistory.cursor > 0}
        canForward={
          interaction.visitHistory.cursor <
          interaction.visitHistory.entries.length - 1
        }
        controlsRef={navigation}
        connectionsEnabled={false}
      />
      <aside
        id="notes-navigation"
        className="sidebar workspace-sidebar"
        aria-label="Document navigation"
        aria-hidden={!leftOpen}
        inert={!leftOpen}
      >
        <header className="left-panel-heading">
          <h2>Documents</h2>
        </header>
        <div className="left-panel-search">
          <input
            aria-label="Search documents"
            placeholder="Search documents"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </div>
        <div className="web-inline-actions">
          <button
            type="button"
            className="web-button"
            disabled={
              !!snapshot.operation ||
              !!snapshot.loadedDocuments.length ||
              snapshot.closing
            }
            onClick={() => action('choose')}
          >
            <FolderOpen size={15} /> Choose local vault
          </button>
          {snapshot.vaultLabel && (
            <button
              type="button"
              className="web-button"
              disabled={!!snapshot.operation || snapshot.closing}
              onClick={() => action('new')}
            >
              <FilePlus2 size={15} /> New document
            </button>
          )}
        </div>
        {snapshot.vaultLabel && (
          <p className="web-detail-path">{snapshot.vaultLabel}</p>
        )}
        <nav aria-label="Vault documents">
          {entries
            .filter((entry) =>
              entry.logicalPath
                .toLocaleLowerCase()
                .includes(query.toLocaleLowerCase()),
            )
            .map((entry) => (
              <DocumentNavigationRow
                key={entry.logicalPath}
                title={entry.logicalPath}
                selected={!!id && entry.loadedSessionId === id}
                icon={FileText}
                onOpen={() =>
                  openEntry(entry.loadedSessionId ?? entry.logicalPath)
                }
              />
            ))}
        </nav>
        {!snapshot.vaultLabel && (
          <p>Choose a local folder to open your notes.</p>
        )}
      </aside>
      <main className="main-panel" aria-label="Document workspace">
        <div className="main-scroll" ref={documentScroll}>
          <div className="document-wrap">
            {document && metadata && id ? (
              <>
                <div className="document-heading">
                  <div className="doc-title-row">
                    <DocumentHeader
                      title={metadata.logicalPath.split('/').at(-1)!}
                    />
                    <span role="status" aria-label="Document save status">
                      {saveLabel}
                    </span>
                  </div>
                </div>
                <div className="editor-section">
                  <DocumentRuntime
                    renderer={services.documentRenderer}
                    input={{
                      files: { [metadata.logicalPath]: source },
                      entry: metadata.logicalPath,
                      theme: preferences.theme,
                      images: [],
                      corePlugins: preferences.corePlugins,
                      showComponentSource:
                        preferences.previewPreferences?.showComponentSource,
                      enabled: false,
                    }}
                  >
                    {(runtime) => (
                      <DocumentSurface
                        key={editorMount}
                        documentId={id}
                        mode={mode}
                        fullDocument={false}
                        reactEnabled={reactEnabled}
                        runtime={runtime}
                        sourcePanelRef={sourcePanel}
                        editor={{
                          source,
                          session: application.session(id),
                          documentKey: id,
                          sourcePath: metadata.logicalPath,
                          histories,
                          commandsRef: commands,
                          onChange: () => {},
                          sourceIsCurrent: (text) =>
                            application.session(id).witness.source === text,
                          readOnly:
                            snapshot.closing ||
                            snapshot.closeUncertain ||
                            document.phase !== 'open',
                          onPendingChange: (pending) => {
                            if (
                              !pending &&
                              !application
                                .snapshot()
                                .loadedDocuments.some(
                                  (entry) => entry.sessionId === id,
                                )
                            )
                              return;
                            application.documents.setUnapplied(id, pending);
                          },
                          onRetainAttempt: async (base, text, witness) => {
                            if (
                              !witness ||
                              witness.sessionId !== id ||
                              witness.source !== base
                            )
                              throw Error(
                                'The retained source has no matching session witness.',
                              );
                            const batch = {
                              expected: { ...witness },
                              source: text,
                            };
                            retainedAttempts.current.set(id, batch);
                            await application.retainAttempt(id, batch);
                          },
                          onKeepAttempt: async () => {
                            const batch = retainedAttempts.current.get(id);
                            if (!batch)
                              throw Error(
                                'The exact retained source is unavailable.',
                              );
                            await application.resolveAttempt(id, batch, 'keep');
                            retainedAttempts.current.delete(id);
                          },
                          onDiscardAttempt: async () => {
                            const batch = retainedAttempts.current.get(id);
                            if (!batch)
                              throw Error(
                                'The exact retained source is unavailable.',
                              );
                            await application.resolveAttempt(
                              id,
                              batch,
                              'discard',
                            );
                            retainedAttempts.current.delete(id);
                          },
                          rendered: selectedIsNote
                            ? {
                                active: mode === 'preview',
                                renderer: services.inlineRenderer,
                                files: { [metadata.logicalPath]: source },
                                entry: metadata.logicalPath,
                                theme: preferences.theme,
                                images: [],
                                stopped: !runtime.available || runtime.stopped,
                                corePlugins: preferences.corePlugins,
                                showComponentSource:
                                  preferences.previewPreferences
                                    ?.showComponentSource,
                              }
                            : undefined,
                          onShowSource: (offset, text) => {
                            run(() => interaction.showSource(id, offset, text));
                          },
                        }}
                      />
                    )}
                  </DocumentRuntime>
                </div>
              </>
            ) : (
              <div className="web-empty-state">
                <h1>Your local vault</h1>
                <p>Open a note from your vault to start writing.</p>
                {!snapshot.vaultLabel && (
                  <button
                    type="button"
                    className="web-button"
                    disabled={!!snapshot.operation}
                    onClick={() => action('choose')}
                  >
                    <FolderOpen size={15} /> Choose local vault
                  </button>
                )}
              </div>
            )}
          </div>
        </div>
      </main>
      <aside
        id="notes-details"
        className="inspector blank-inspector"
        aria-label="Note details"
        aria-hidden={!rightOpen}
        inert={!rightOpen}
      >
        <h2>Note details</h2>
        {metadata && <p>{metadata.logicalPath}</p>}
        <p>React preview is unavailable.</p>
      </aside>
      {commandOpen && (
        <DocumentCommandPalette
          query={commandQuery}
          index={commandIndex}
          results={commandResults}
          onQuery={setCommandQuery}
          onIndex={setCommandIndex}
          onRun={(result) =>
            interaction.runCommand(result, () => setCommandOpen(false), action)
          }
          onClose={() => setCommandOpen(false)}
        />
      )}
      {createOpen && (
        <ProductDialog
          title="New document"
          onClose={() => setCreateOpen(false)}
        >
          <form
            onSubmit={(event) => {
              event.preventDefault();
              if (!canLeave()) return;
              run(async () => {
                await application.create(filename, '');
                if (latest.current.application !== application) return;
                setCreateOpen(false);
                changePreferences({ ...preferences, mode: 'source' });
              });
            }}
          >
            <label>
              Vault-relative filename
              <input
                data-autofocus
                aria-label="Vault-relative filename"
                value={filename}
                onChange={(event) => setFilename(event.target.value)}
              />
            </label>
            <button type="submit" className="web-button">
              Create document
            </button>
          </form>
        </ProductDialog>
      )}
      {settingsOpen && (
        <ProductDialog
          title="Settings"
          onClose={() => setSettingsOpen(false)}
          className="web-settings-dialog"
        >
          <div className="web-settings-content">
            <AppearanceSettings
              theme={preferences.theme}
              preferences={preferences.previewPreferences}
              onTheme={(theme) => changePreferences({ ...preferences, theme })}
              onSource={(showComponentSource) =>
                changePreferences({
                  ...preferences,
                  previewPreferences: { showComponentSource },
                })
              }
            />
            <CorePluginSettings
              plugins={preferences.corePlugins}
              onPlugin={(plugin, enabled) =>
                changePreferences({
                  ...preferences,
                  corePlugins: {
                    ...preferences.corePlugins,
                    [plugin]: enabled,
                  },
                })
              }
              onReactDisabled={() => {}}
            />
          </div>
        </ProductDialog>
      )}
    </div>
  );
}
