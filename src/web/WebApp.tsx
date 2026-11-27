import {
  useWorkspaceInteraction,
  documentFormattingCommands,
  filterDocumentCommands,
} from '../product/useWorkspaceInteraction';
import {
  WorkspaceNavigation,
  type WorkspaceNavigationHandle,
} from '../product/WorkspaceNavigation';
import { DocumentCommandPalette } from '../product/DocumentCommandPalette';
import {
  CorePluginSettings,
  AppearanceSettings,
} from '../product/CorePluginSettings';
import { ProductDialog as Dialog } from '../ui/ProductDialog';
import { DocumentHeader } from '../product/DocumentHeader';
import { corePluginEnabled } from '../plugins/coreRegistry';
import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type DragEvent,
  type ReactNode,
  type ComponentType,
} from 'react';
import {
  AlertCircle,
  BookOpen,
  Check,
  ChevronDown,
  ChevronRight,
  CircleHelp,
  Clock,
  Code2,
  Download,
  Eye,
  FilePlus2,
  FileText,
  Folder,
  FolderInput,
  FolderPlus,
  HardDrive,
  Keyboard,
  LoaderCircle,
  Moon,
  Network,
  Pause,
  Paperclip,
  Pencil,
  Play,
  RotateCcw,
  Save,
  Search,
  Settings2,
  Sun,
  Trash2,
  Upload,
  X,
} from 'lucide-react';
import '@fontsource-variable/dm-sans';
import '@fontsource-variable/dm-sans/wght-italic.css';
import type { EditorCommands, EditorHistory } from '../editor/SourceEditor';
import { DocumentSurface } from '../workspace/DocumentSurface';
import { DocumentNavigationRow } from '../workspace/DocumentNavigationRow';
import { compilerFiles } from '../documents/workspace';
import { isMdxSource } from '../sourceTypes';
import { useWebWorkspace } from './useWebWorkspace';
import { cloudStorageEnabled } from './storage';
import {
  DocumentRuntime,
  type DocumentRuntimeInput,
  type DocumentRuntimeProps,
  type DocumentRuntimeSession,
} from '../preview/DocumentRuntime';
import { WebDocumentRuntime } from './WebDocumentRuntime';
import { shouldCompileWholeDocument } from './previewExecution';
import { WebRenderedRuntime } from './WebRenderedRuntime';
import { useOffline, activateUpdate } from './offline';
import { indexWorkspaceLinks } from '../links';
import { NoteConnections } from './NoteConnections';
import { AttachmentGallery } from './AttachmentGallery';
import { RetainedEdits } from './RetainedEdits';
import { attachmentReferences, referencedPreviewAssets } from './previewAssets';
import {
  normalizeFolder,
  orderedChildren,
  type TreeEntry,
  type TreePlacement,
  type WebState,
} from './workspace';
import './web.css';
import { useNotifications } from '../ui/useNotifications';

type WorkspaceModel = ReturnType<typeof useWebWorkspace>;
type SettingsTab = 'storage' | 'plugins' | 'recovery' | 'trash' | 'help';
type NewItem = {
  kind: 'note' | 'folder';
  parent: string;
  value: string;
  error: string;
};
type ModalKind = 'settings' | 'document' | 'rename' | 'move' | 'trash' | null;
type RecoveryPoint = { revision: number; updated: number };
const RECENT_VISIBLE = 7;
const folderParent = (path: string) =>
  path.includes('/') ? path.slice(0, path.lastIndexOf('/')) : '';
const folderName = (path: string) => path.slice(path.lastIndexOf('/') + 1);
const dateLabel = (value: number) =>
  new Date(value).toLocaleString(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short',
  });

export function WebApp() {
  const model = useWebWorkspace();
  if (model.loading)
    return (
      <div className="web-loading" role="status">
        <LoaderCircle className="web-spin" size={24} />
        <h1>Opening your workspace</h1>
        <p>Loading your saved notes.</p>
      </div>
    );
  if (!model.state) return <StorageFailure model={model} />;
  return (
    <WorkspaceApp
      model={model}
      state={model.state}
      runtimeRenderer={WebDocumentRuntime}
    />
  );
}

function StorageFailure({ model }: { model: WorkspaceModel }) {
  const input = useRef<HTMLInputElement>(null);
  const [points, setPoints] = useState<RecoveryPoint[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  return (
    <div className="web-loading web-storage-failure">
      {model.cloudWorkspaceEmpty ? (
        <HardDrive size={26} />
      ) : (
        <AlertCircle size={26} />
      )}
      <h1>
        {model.cloudWorkspaceEmpty
          ? 'Your private workspace is empty'
          : 'Your workspace could not open'}
      </h1>
      {(!model.cloudWorkspaceEmpty || model.error) && (
        <p role="alert">
          {model.error ||
            (cloudStorageEnabled
              ? 'Cloud storage is unavailable.'
              : 'Browser storage is unavailable.')}
        </p>
      )}
      <p>
        {model.cloudWorkspaceEmpty
          ? 'Create a workspace, or restore a backup exported from your browser. Nothing is uploaded until you choose.'
          : cloudStorageEnabled
            ? 'Check your connection and sign-in, then try again. Keep any existing backups.'
            : 'Retry, restore a workspace backup, or check recovery history. Use a regular browser window with site storage enabled.'}
      </p>
      <RetainedEdits attempts={model.attempts} error={model.attemptError} />
      <div className="web-inline-actions">
        {cloudStorageEnabled && (
          <a
            className="web-button"
            href="/api/storage/session"
            target="_blank"
            rel="noopener noreferrer"
          >
            Sign in
          </a>
        )}
        {model.cloudWorkspaceEmpty && (
          <button
            className="web-button"
            type="button"
            disabled={busy}
            onClick={() => void model.createCloudWorkspace()}
          >
            Create workspace
          </button>
        )}
        <button
          className="web-button"
          type="button"
          disabled={busy}
          onClick={() => void model.reloadFromStorage()}
        >
          Try again
        </button>
        <button
          className="web-button"
          type="button"
          disabled={busy}
          onClick={() => input.current?.click()}
        >
          <Upload size={15} /> Restore backup
        </button>
        <button
          className="web-button"
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            setHistoryError('');
            void model
              .listRecovery()
              .then((list) => {
                setPoints(list);
                setChecked(true);
              })
              .catch((error: unknown) =>
                setHistoryError(
                  error instanceof Error
                    ? error.message
                    : 'Recovery history is unavailable.',
                ),
              )
              .finally(() => setBusy(false));
          }}
        >
          <RotateCcw size={15} /> Check recovery history
        </button>
      </div>
      <input
        ref={input}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Choose workspace backup"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) {
            setBusy(true);
            void model.restoreBackup(file).finally(() => setBusy(false));
          }
        }}
      />
      {historyError && <p role="alert">{historyError}</p>}
      {checked && !points.length && <p>No recovery points are available.</p>}
      {points.map((point) => (
        <div className="web-list-row" key={point.revision}>
          <Clock size={16} />
          <span>{dateLabel(point.updated)}</span>
          <button
            className="web-button"
            disabled={busy}
            type="button"
            onClick={() => {
              setBusy(true);
              void model
                .restoreRecovery(point.revision)
                .finally(() => setBusy(false));
            }}
          >
            Restore
          </button>
        </div>
      ))}
    </div>
  );
}

interface WorkspaceExecution {
  files: DocumentRuntimeInput['files'];
  images: DocumentRuntimeInput['images'];
  fullDocument: boolean;
  requested: boolean;
  setRequested: (requested: boolean) => void;
}

function WorkspaceApp({
  model,
  state,
  runtimeRenderer,
}: {
  model: WorkspaceModel;
  state: WebState;
  runtimeRenderer?: ComponentType<DocumentRuntimeProps>;
}) {
  const { workspace } = state;
  const selected = workspace.selected;
  const reactEnabled = corePluginEnabled(state.corePlugins, 'react');
  const mode =
    isMdxSource(selected) && state.mode !== 'source' ? 'preview' : 'source';
  const [runtimeDocument, setRuntimeDocument] = useState<string | null>(null);
  const fullDocument = reactEnabled && runtimeDocument === selected;
  const previewImages = useMemo(
    () =>
      referencedPreviewAssets(
        workspace.files[workspace.entry] ?? '',
        workspace.entry,
        state.assets,
      ),
    [workspace.files, workspace.entry, state.assets],
  );
  const files = useMemo(
    () =>
      compilerFiles({
        files: workspace.files,
        groups: workspace.groups,
        entry: workspace.entry,
      }),
    [workspace.files, workspace.groups, workspace.entry],
  );
  return (
    <DocumentRuntime
      renderer={runtimeRenderer}
      input={{
        files,
        entry: workspace.entry,
        theme: state.theme,
        images: previewImages,
        corePlugins: state.corePlugins,
        showComponentSource: state.previewPreferences?.showComponentSource,
        enabled: shouldCompileWholeDocument(reactEnabled, mode, fullDocument),
      }}
    >
      {(documentPreview) => (
        <WorkspaceBody
          model={model}
          state={state}
          documentPreview={documentPreview}
          execution={{
            files,
            images: previewImages,
            fullDocument,
            requested: runtimeDocument === selected,
            setRequested: (requested) =>
              setRuntimeDocument(requested ? selected : null),
          }}
        />
      )}
    </DocumentRuntime>
  );
}

function WorkspaceBody({
  model,
  state,
  execution,
  documentPreview,
}: {
  model: WorkspaceModel;
  state: WebState;
  execution: WorkspaceExecution;
  documentPreview: DocumentRuntimeSession;
}) {
  const { notify, dismiss } = useNotifications();
  const { workspace } = state;
  const reactEnabled = corePluginEnabled(state.corePlugins, 'react');
  const offline = useOffline();
  const selected = workspace.selected;
  const metadata = state.documents[selected]!;
  const source = workspace.files[selected] ?? '';
  const selectedIsNote = isMdxSource(selected);
  const mode = selectedIsNote && state.mode !== 'source' ? 'preview' : 'source';
  const { files, images: previewImages, fullDocument } = execution;
  const [analysisDiagnostic, setAnalysisDiagnostic] = useState<{
    path: string;
    source: string;
    message: string | null;
  } | null>(null);
  const [islandRebuildVersion, setIslandRebuildVersion] = useState(0);
  const attachmentRefs = useMemo(
    () => attachmentReferences(source, selected),
    [source, selected],
  );
  const attachmentIds = useMemo(
    () => [...new Set(attachmentRefs.map((reference) => reference.id))],
    [attachmentRefs],
  );
  const preview = {
    ...documentPreview,
    error:
      documentPreview.error ||
      (mode === 'preview' &&
      !fullDocument &&
      analysisDiagnostic?.path === selected &&
      analysisDiagnostic.source === source
        ? (analysisDiagnostic.message ?? '')
        : ''),
    rebuild: () => {
      documentPreview.rebuild();
      if (mode === 'preview' && !fullDocument)
        setIslandRebuildVersion((value) => value + 1);
    },
  };
  const histories = useRef<EditorHistory>(new Map());
  const commands = useRef<EditorCommands>(null);
  const documentScroll = useRef<HTMLDivElement>(null);
  const sourcePanel = useRef<HTMLDivElement>(null);
  const noteInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const newItemInput = useRef<HTMLInputElement>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);

  const [sidebarView, setSidebarView] = useState<'documents' | 'connections'>(
    'documents',
  );
  const [sidebarQuery, setSidebarQuery] = useState('');
  const [expandedFolders, setExpandedFolders] = useState<
    Record<string, boolean>
  >({});
  const [recentCollapsed, setRecentCollapsed] = useState(false);
  const [recentShowAll, setRecentShowAll] = useState(false);
  const [documentsCollapsed, setDocumentsCollapsed] = useState(false);
  const [newItem, setNewItem] = useState<NewItem | null>(null);
  const [selectedFolder, setSelectedFolder] = useState('');
  const draggedItem = useRef<TreeEntry | null>(null);
  const [draggedName, setDraggedName] = useState('');
  const [dropHint, setDropHint] = useState<{
    id: string;
    placement: TreePlacement;
  } | null>(null);
  const [commandOpen, setCommandOpen] = useState(false);
  const [commandQuery, setCommandQuery] = useState('');
  const [commandIndex, setCommandIndex] = useState(0);
  const [modal, setModal] = useState<ModalKind>(null);
  const [settingsTab, setSettingsTab] = useState<SettingsTab>('storage');
  const [formValue, setFormValue] = useState('');
  const [recoveryPoints, setRecoveryPoints] = useState<RecoveryPoint[]>([]);
  const [recoveryError, setRecoveryError] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
  const [persistentStatus, setPersistentStatus] = useState('');
  const [operationPending, setOperationPending] = useState(false);

  const [pendingEdit, setPendingEdit] = useState(false);
  const [toast, setToast] = useState('');
  const recoveryNoticeShown = useRef(false);
  useEffect(() => {
    if (model.attempts.length && !pendingEdit && !recoveryNoticeShown.current) {
      recoveryNoticeShown.current = true;
      setToast('A retained edit is available in Settings → Recovery.');
    }
  }, [model.attempts.length, pendingEdit]);
  const navigation = useRef<WorkspaceNavigationHandle | null>(null);
  const activeKeys = Object.keys(state.documents).filter(
    (key) => !state.documents[key]!.trashedAt,
  );
  const trashKeys = Object.keys(state.documents).filter(
    (key) => state.documents[key]!.trashedAt,
  );
  const needle = sidebarQuery.trim().toLocaleLowerCase();
  const matches = (key: string, query = needle) =>
    !query ||
    (
      state.documents[key]!.title +
      '\n' +
      state.documents[key]!.folder +
      '\n' +
      workspace.files[key]
    )
      .toLocaleLowerCase()
      .includes(query);
  const recentKeys = state.recentIds.filter(
    (key) =>
      state.documents[key] && !state.documents[key]!.trashedAt && matches(key),
  );
  const visibleRecent = recentShowAll
    ? recentKeys
    : recentKeys.slice(0, RECENT_VISIBLE);

  useEffect(() => {
    if (state.mode === 'live') model.setMode('preview');
  }, [state.mode, model]); // Migrate legacy stored view preference.
  const linkIndex = useMemo(
    () =>
      indexWorkspaceLinks(
        Object.entries(state.documents).map(([id, meta]) => ({
          id,
          title: meta.title,
          folder: meta.folder,
          trashed: Boolean(meta.trashedAt),
          source: workspace.files[id] ?? '',
        })),
      ),
    [state.documents, workspace.files],
  );
  const words = source.trim() ? source.trim().split(/\s+/).length : 0;
  const saveLabel = pendingEdit
    ? 'Resolve the pending edit before saving'
    : (
        {
          loading: 'Opening workspace',
          saving: 'Saving…',
          saved: cloudStorageEnabled
            ? 'Saved to cloud'
            : 'Saved in this browser',
          error: 'Not saved',
          conflict: cloudStorageEnabled
            ? 'This workspace was saved elsewhere'
            : 'Another tab changed this workspace',
        } as const
      )[model.saveStatus];

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.title = metadata.title + ' · Programmable Notes';
  }, [state.theme, metadata.title]);
  useEffect(() => {
    if (newItem) newItemInput.current?.focus();
  }, [newItem?.kind, newItem?.parent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return;
    notify({ id: 'workspace-feedback', message: toast });
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast, notify]);
  const admitNavigation = () => {
    if (operationPending) {
      setToast('Wait for the current import or restore to finish.');
      return false;
    }
    if (!pendingEdit) return true;
    setToast(
      'Finish the current edit or save its recovery text before changing notes or replacing this workspace.',
    );
    return false;
  };
  const interaction = useWorkspaceInteraction({
    selected,
    mode,
    canLeave: admitNavigation,
    documentPath: (id) =>
      state.documents[id] && !state.documents[id]!.trashedAt ? id : null,
    selectDocument: (id) => model.select(id),
    setMode: model.setMode,
    sourcePanel,
    documentScroll,
    commands,
    onOpened: () => {
      if (window.innerWidth <= 720) setLeftOpen(false);
    },
    isCurrentSource: model.isCurrentSource,
    onError: (reason) =>
      setToast(
        reason instanceof Error
          ? reason.message
          : 'The note could not be opened.',
      ),
  });
  const {
    canLeaveDraft,
    switchMode,
    openDocument,
    moveHistory,
    visitHistory,
    setVisitHistory,
    showSource,
    focusCreatedDocument,
  } = interaction;
  const closePeek = () => navigation.current?.closePeek();
  const importAttachments = async (files: File[]) => {
    if (!files.length || !selectedIsNote || model.conflict || !canLeaveDraft())
      return;
    const target = selected;
    setOperationPending(true);
    try {
      await model.importAttachments(files, target);
    } finally {
      setOperationPending(false);
    }
  };
  const openLeft = (view: 'documents' | 'connections' = 'documents') =>
    navigation.current?.openLeft(view);
  const startNew = (kind: 'note' | 'folder', parent = selectedFolder) => {
    if (!canLeaveDraft()) return;
    setSidebarQuery('');
    if (parent) setExpandedFolders((old) => ({ ...old, [parent]: true }));
    if (kind === 'note') {
      const taken = new Set(
        Object.values(state.documents)
          .filter(
            (document) => !document.trashedAt && document.folder === parent,
          )
          .map((document) => document.title.toLocaleLowerCase()),
      );
      let name = 'Untitled';
      for (let number = 2; taken.has(name.toLocaleLowerCase()); number++) {
        name = 'Untitled ' + number;
      }
      const key = model.createNote(name, parent);
      if (!key) return;
      focusCreatedDocument(key);
      setNewItem(null);
      model.setMode('source');
      documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
      setVisitHistory((history) => {
        const entries = [...history.entries.slice(0, history.cursor + 1), key];
        return { entries, cursor: entries.length - 1 };
      });
      if (window.innerWidth <= 720) setLeftOpen(false);
      return;
    }
    openLeft();
    setNewItem({ kind, parent, value: '', error: '' });
  };
  const commitNew = (event: FormEvent) => {
    event.preventDefault();
    if (!newItem) return;
    const name = newItem.value.trim();
    if (!name) {
      setNewItem(null);
      return;
    }
    if (
      name.includes('/') ||
      name.includes('\\') ||
      [...name].some((char) => char.charCodeAt(0) < 32) ||
      name === '.' ||
      name === '..' ||
      name.length > 200
    ) {
      setNewItem({
        ...newItem,
        error: 'Use a name of up to 200 characters without slashes.',
      });
      return;
    }
    if (newItem.kind === 'folder') {
      let path: string;
      try {
        path = normalizeFolder(
          newItem.parent ? newItem.parent + '/' + name : name,
        );
      } catch (error) {
        setNewItem({
          ...newItem,
          error:
            error instanceof Error
              ? error.message
              : 'Choose a valid folder name.',
        });
        return;
      }
      if (
        state.folders.some(
          (folder) => folder.toLocaleLowerCase() === path.toLocaleLowerCase(),
        )
      ) {
        setNewItem({ ...newItem, error: 'This folder already exists.' });
        return;
      }
      model.createFolder(path);
      setSelectedFolder(path);
      setExpandedFolders((old) => ({ ...old, [path]: true }));
    } else {
      const key = model.createNote(
        name.replace(/\.mdx?$/i, '') || name,
        newItem.parent,
      );
      if (!key) return;
      focusCreatedDocument(key);
      model.setMode('source');
      documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
      setVisitHistory((history) => {
        const entries = [...history.entries.slice(0, history.cursor + 1), key];
        return { entries, cursor: entries.length - 1 };
      });
      if (window.innerWidth <= 720) setLeftOpen(false);
    }
    setNewItem(null);
  };
  const exportSource = () => {
    if (!canLeaveDraft()) return;
    const blob = new Blob([source], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download =
      selected.slice(selected.lastIndexOf('/') + 1) || 'note.mdx';
    anchor.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setToast('Source download requested');
  };
  const loadRecovery = async () => {
    setRecoveryLoading(true);
    setRecoveryError('');
    try {
      const [points] = await Promise.all([
        model.listRecovery(),
        model.reloadAttempts(),
      ]);
      setRecoveryPoints(points);
    } catch (error) {
      setRecoveryError(
        error instanceof Error
          ? error.message
          : 'Recovery history could not load.',
      );
    } finally {
      setRecoveryLoading(false);
    }
  };
  const showSettings = (tab: SettingsTab = 'storage') => {
    if (!canLeaveDraft()) return;
    setSettingsTab(tab);
    if (tab === 'recovery') void loadRecovery();
    setModal('settings');
    closePeek();
  };
  const openDocumentAction = (kind: 'rename' | 'move' | 'trash') => {
    if (!canLeaveDraft()) return;
    setFormValue(kind === 'rename' ? metadata.title : metadata.folder);
    setModal(kind);
  };
  const restoreRecovery = async (revision: number) => {
    if (!canLeaveDraft()) return;
    setOperationPending(true);
    try {
      await model.restoreRecovery(revision);
      setModal(null);
    } finally {
      setOperationPending(false);
    }
  };
  const requestPersistentStorage = async () => {
    if (cloudStorageEnabled) return;
    try {
      const granted = await navigator.storage?.persist?.();
      setPersistentStatus(
        granted
          ? 'Persistent storage is enabled. Keep regular backups as well.'
          : 'The browser did not grant persistent storage. Your notes still save locally; keep regular backups.',
      );
    } catch {
      setPersistentStatus(
        'Persistent storage is unavailable in this browser. Keep regular backups.',
      );
    }
  };

  useEffect(() => {
    const keydown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.isComposing || event.repeat) return;
      const key = event.key.toLocaleLowerCase();
      if ((event.metaKey || event.ctrlKey) && key === 's') {
        event.preventDefault();
        if (canLeaveDraft()) void model.saveNow();
      } else if (
        (event.metaKey || event.ctrlKey) &&
        key === 'k' &&
        !event.shiftKey
      ) {
        event.preventDefault();
        if (!canLeaveDraft()) return;
        setModal(null);
        setCommandQuery('');
        setCommandIndex(0);
        setCommandOpen((open) => !open);
      } else if (
        (event.metaKey || event.ctrlKey) &&
        key === 'e' &&
        !modal &&
        !commandOpen
      ) {
        event.preventDefault();
        switchMode(mode === 'source' && selectedIsNote ? 'preview' : 'source');
      } else if (
        (event.metaKey || event.ctrlKey) &&
        key === '\\' &&
        !modal &&
        !commandOpen
      ) {
        event.preventDefault();
        closePeek();
        setLeftOpen((open) => !open);
      } else if (event.key === 'Escape' && !modal && !commandOpen) {
        setNewItem(null);
        setLeftOpen(false);
        setRightOpen(false);
        closePeek();
      }
    };
    window.addEventListener('keydown', keydown);
    return () => window.removeEventListener('keydown', keydown);
  }); // Handlers always use the currently selected document and latest workspace.

  const treeKey = (item: TreeEntry) =>
    (item.kind === 'folder' ? 'f:' : 'd:') + item.id;
  const nodeParent = (
    target: TreeEntry | null,
    placement: TreePlacement,
  ): string => {
    if (!target) return '';
    if (target.kind === 'document')
      return state.documents[target.id]?.folder ?? '';
    return placement === 'into' ? target.id : folderParent(target.id);
  };
  const canDropTree = (
    source: TreeEntry | null,
    target: TreeEntry | null,
    placement: TreePlacement,
  ): boolean => {
    if (!source) return false;
    if (target && treeKey(source) === treeKey(target)) return false;
    const destination = nodeParent(target, placement);
    if (source.kind !== 'folder') return true;
    if (destination === source.id || destination.startsWith(source.id + '/'))
      return false;
    const basename = folderName(source.id);
    const destinationPath = destination
      ? destination + '/' + basename
      : basename;
    if (
      destinationPath !== source.id &&
      state.folders.includes(destinationPath)
    )
      return false;
    return destinationPath.length <= 512;
  };
  const clearTreeDrag = () => {
    draggedItem.current = null;
    setDraggedName('');
    setDropHint(null);
  };
  const startTreeDrag = (event: DragEvent<HTMLElement>, item: TreeEntry) => {
    event.stopPropagation();
    draggedItem.current = item;
    setDraggedName(treeKey(item));
    setDropHint(null);
    event.dataTransfer.effectAllowed = 'move';
    event.dataTransfer.setData('text/plain', treeKey(item));
  };
  const rowDropPlacement = (
    event: DragEvent<HTMLElement>,
    folder: boolean,
  ): TreePlacement => {
    const rect = event.currentTarget.getBoundingClientRect();
    const y = (event.clientY - rect.top) / rect.height;
    return !folder
      ? y < 0.5
        ? 'before'
        : 'after'
      : y < 0.26
        ? 'before'
        : y > 0.74
          ? 'after'
          : 'into';
  };
  const previewTreeDrop = (
    event: DragEvent<HTMLElement>,
    target: TreeEntry,
    placement: TreePlacement,
  ) => {
    event.stopPropagation();
    if (!canDropTree(draggedItem.current, target, placement)) {
      setDropHint(null);
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
    const id = treeKey(target);
    setDropHint((prev) =>
      prev?.id === id && prev.placement === placement
        ? prev
        : { id, placement },
    );
  };
  const finishTreeDrop = (
    event: DragEvent<HTMLElement>,
    target: TreeEntry | null,
    placement: TreePlacement,
  ) => {
    event.preventDefault();
    event.stopPropagation();
    const source = draggedItem.current;
    if (canDropTree(source, target, placement) && source) {
      model.reorderTree(source, target, placement);
      const destination = nodeParent(target, placement);
      if (destination)
        setExpandedFolders((old) => ({ ...old, [destination]: true }));
      setSelectedFolder(destination);
    }
    clearTreeDrag();
  };
  const treeDropClass = (item: TreeEntry) => {
    const id = treeKey(item);
    return (
      (draggedName === id ? ' tree-dragged' : '') +
      (dropHint?.id === id ? ' tree-drop-' + dropHint.placement : '')
    );
  };
  const renderTreeNodes = (parent: string, depth: number): ReactNode =>
    orderedChildren(state, parent)
      .filter((item) =>
        item.kind === 'folder'
          ? folderMatches(item.id)
          : activeKeys.includes(item.id) && matches(item.id),
      )
      .map((item) =>
        item.kind === 'folder'
          ? renderFolder(item.id, depth)
          : navDocument(item.id, depth),
      );

  function navDocument(key: string, depth = 0) {
    const note = state.documents[key]!;
    const Icon = isMdxSource(key) ? FileText : Code2;
    return (
      <DocumentNavigationRow
        key={key}
        title={note.title}
        selected={key === selected}
        depth={depth}
        icon={Icon}
        extraClass={treeDropClass({ kind: 'document', id: key })}
        draggable
        onDragStart={(event) =>
          startTreeDrag(event, { kind: 'document', id: key })
        }
        onDragEnd={clearTreeDrag}
        onDragOver={(event) =>
          previewTreeDrop(
            event,
            { kind: 'document', id: key },
            rowDropPlacement(event, false),
          )
        }
        onDrop={(event) =>
          finishTreeDrop(
            event,
            { kind: 'document', id: key },
            rowDropPlacement(event, false),
          )
        }
        onDragLeave={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget as Node))
            setDropHint(null);
        }}
        onOpen={() => openDocument(key)}
      />
    );
  }
  function draftRow(parent: string, depth: number) {
    if (!newItem || newItem.kind !== 'folder' || newItem.parent !== parent)
      return null;
    const Icon = newItem.kind === 'folder' ? Folder : FileText;
    return (
      <form
        className="folder-inline-create"
        onSubmit={commitNew}
        style={{ paddingLeft: 10 + depth * 16 }}
      >
        <Icon size={14} />
        <input
          ref={newItemInput}
          aria-label={
            newItem.kind === 'folder' ? 'New folder name' : 'New document name'
          }
          value={newItem.value}
          placeholder={
            newItem.kind === 'folder' ? 'Folder name' : 'Document name'
          }
          maxLength={200}
          onChange={(event) =>
            setNewItem({ ...newItem, value: event.target.value, error: '' })
          }
          onKeyDown={(event) => {
            if (event.key === 'Escape') {
              event.stopPropagation();
              setNewItem(null);
            }
          }}
        />
        <button type="submit" aria-label={'Create ' + newItem.kind}>
          <Check size={14} />
        </button>
        <button
          type="button"
          aria-label="Cancel creation"
          onClick={() => setNewItem(null)}
        >
          <X size={14} />
        </button>
        {newItem.error && <small role="alert">{newItem.error}</small>}
      </form>
    );
  }
  function folderMatches(path: string) {
    return (
      !needle ||
      path.toLocaleLowerCase().includes(needle) ||
      activeKeys.some(
        (key) =>
          (state.documents[key]!.folder === path ||
            state.documents[key]!.folder.startsWith(path + '/')) &&
          matches(key),
      )
    );
  }
  function renderFolder(path: string, depth = 0): ReactNode {
    if (!folderMatches(path)) return null;
    const open = Boolean(needle) || (expandedFolders[path] ?? true);

    return (
      <div className="folder-tree-group" key={path}>
        <div
          className={
            'folder-tree-row ' +
            (selectedFolder === path ? 'selected-folder' : '') +
            treeDropClass({ kind: 'folder', id: path })
          }
          style={{ paddingLeft: depth * 16 }}
          draggable
          onDragStart={(event) =>
            startTreeDrag(event, { kind: 'folder', id: path })
          }
          onDragEnd={clearTreeDrag}
          onDragOver={(event) =>
            previewTreeDrop(
              event,
              { kind: 'folder', id: path },
              rowDropPlacement(event, true),
            )
          }
          onDrop={(event) =>
            finishTreeDrop(
              event,
              { kind: 'folder', id: path },
              rowDropPlacement(event, true),
            )
          }
          onDragLeave={(event) => {
            if (!event.currentTarget.contains(event.relatedTarget as Node))
              setDropHint(null);
          }}
        >
          <button
            type="button"
            className="left-folder-title"
            aria-expanded={open}
            title={path}
            onClick={() => {
              setSelectedFolder(path);
              setExpandedFolders((old) => ({ ...old, [path]: !open }));
            }}
          >
            <ChevronRight
              className="folder-disclosure-icon"
              size={14}
              aria-hidden="true"
            />
            <Folder
              className="folder-static-icon"
              size={14}
              strokeWidth={1.6}
              aria-hidden="true"
            />
            <span>{folderName(path)}</span>
          </button>
          <div className="folder-row-actions">
            <button
              type="button"
              aria-label={'New document in ' + path}
              title={'New document in ' + path}
              onClick={() => startNew('note', path)}
            >
              <FilePlus2 size={14} />
            </button>
            <button
              type="button"
              aria-label={'New subfolder in ' + path}
              title={'New subfolder in ' + path}
              onClick={() => startNew('folder', path)}
            >
              <FolderPlus size={14} />
            </button>
          </div>
        </div>
        <div
          className={'folder-tree-motion' + (open ? ' is-expanded' : '')}
          aria-hidden={!open}
          inert={!open}
        >
          <div className="folder-tree-children">
            {renderTreeNodes(path, depth + 1)}
            {draftRow(path, depth + 1)}
          </div>
        </div>
      </div>
    );
  }

  const commandNeedle = commandQuery.trim().toLocaleLowerCase();
  const commandMatchRank = (key: string) => {
    if (!commandNeedle) return 0;
    const document = state.documents[key]!;
    const title = document.title.toLocaleLowerCase();
    if (title === commandNeedle) return 0;
    if (title.startsWith(commandNeedle)) return 1;
    if (title.includes(commandNeedle)) return 2;
    if (document.folder.toLocaleLowerCase().includes(commandNeedle)) return 3;
    return 4;
  };
  const commandDocuments = activeKeys
    .filter((key) => matches(key, commandNeedle))
    .sort((first, second) => commandMatchRank(first) - commandMatchRank(second))
    .slice(0, 30);
  const actions = filterDocumentCommands(
    [
      ...documentFormattingCommands(selectedIsNote, mode).map((command) => ({
        name: command.name,
        description: command.description,
        icon: command.icon,
        actionId: command.id.slice('action:'.length),
      })),
      {
        name: 'New document',
        description: 'Create a note in this workspace',
        icon: FilePlus2,
        actionId: 'new',
      },
      {
        name: 'Import notes or modules',
        description: 'Choose related MDX and React files together',
        icon: Upload,
        actionId: 'import',
      },
      {
        name: 'Import a folder',
        description: 'Keep relative module paths together',
        icon: FolderInput,
        actionId: 'folder',
      },
      ...(selectedIsNote
        ? [
            {
              name: 'Add image or PDF',
              description:
                'Attach files to this note, including them in backups',
              icon: Paperclip,
              actionId: 'attachment',
            },
          ]
        : []),
      {
        name: 'Edit source',
        description: 'Open the source editor',
        icon: Code2,
        actionId: 'source',
      },
      ...(selectedIsNote
        ? [
            {
              name: 'Preview document',
              description:
                'Edit the rendered note with live Markdown and equations',
              icon: Eye,
              actionId: 'preview',
            },
          ]
        : []),
      {
        name: 'Save workspace',
        description: cloudStorageEnabled
          ? 'Save all changes to cloud storage'
          : 'Save all changes in this browser',
        icon: Save,
        actionId: 'save',
      },
      {
        name: 'Export current source',
        description: 'Download the exact source text',
        icon: Download,
        actionId: 'export',
      },
      {
        name: 'Export workspace backup',
        description: 'Download every note, folder, and setting',
        icon: HardDrive,
        actionId: 'backup',
      },
      {
        name: 'Rename document',
        description: metadata.title,
        icon: Pencil,
        actionId: 'rename',
      },
      {
        name: 'Move document',
        description: 'Choose a workspace folder',
        icon: FolderInput,
        actionId: 'move',
      },
      {
        name: 'Recovery history',
        description: 'Restore a previous workspace snapshot',
        icon: RotateCcw,
        actionId: 'recovery',
      },
      {
        name: 'Open Trash',
        description: 'Restore removed documents',
        icon: Trash2,
        actionId: 'trash',
      },
      {
        name:
          state.theme === 'dark'
            ? 'Switch to light theme'
            : 'Switch to dark theme',
        description: 'Change appearance',
        icon: state.theme === 'dark' ? Sun : Moon,
        actionId: 'theme',
      },
      {
        name: 'Settings',
        description: 'Storage, backups, and keyboard shortcuts',
        icon: Settings2,
        actionId: 'settings',
      },
    ],
    commandNeedle,
  );
  const commandResults = [
    ...commandDocuments.map((key) => ({
      name: state.documents[key]!.title,
      description: state.documents[key]!.folder || 'Workspace',
      icon: isMdxSource(key) ? FileText : Code2,
      id: 'document:' + key,
    })),
    ...actions.map((action) => ({
      ...action,
      id: 'action:' + action.actionId,
    })),
  ];
  const runCommand = (result: { id: string }) =>
    interaction.runCommand(
      result,
      () => setCommandOpen(false),
      (action) => {
        switch (action) {
          case 'new':
            startNew('note', '');
            break;
          case 'import':
            noteInput.current?.click();
            break;
          case 'folder':
            folderInput.current?.click();
            break;
          case 'attachment':
            if (canLeaveDraft()) attachmentInput.current?.click();
            break;
          case 'save':
            if (canLeaveDraft()) void model.saveNow();
            break;
          case 'export':
            exportSource();
            break;
          case 'backup':
            model.exportBackup();
            break;
          case 'rename':
            openDocumentAction('rename');
            break;
          case 'move':
            openDocumentAction('move');
            break;
          case 'recovery':
            showSettings('recovery');
            break;
          case 'trash':
            showSettings('trash');
            break;
          case 'theme':
            model.setTheme(state.theme === 'dark' ? 'light' : 'dark');
            break;
          case 'settings':
            showSettings();
            break;
        }
      },
    );
  useEffect(() => {
    if (offline.error)
      notify({
        id: 'app-offline',
        tone: 'error',
        persistent: true,
        message: 'Offline access needs attention',
        detail: offline.error,
      });
    else dismiss('app-offline');
  }, [offline.error, notify, dismiss]);
  const latestActions = useRef({
    model,
    canLeaveDraft,
    preview,
    switchMode,
    showSource,
  });
  useLayoutEffect(() => {
    latestActions.current = {
      model,
      canLeaveDraft,
      preview,
      switchMode,
      showSource,
    };
  });
  useEffect(() => {
    if (model.error || model.conflict)
      notify({
        id: 'workspace-storage',
        tone: 'error',
        persistent: true,
        dismissible: false,
        message: model.conflict
          ? cloudStorageEnabled
            ? 'This workspace was saved elsewhere.'
            : 'This workspace changed in another tab.'
          : model.error,
        detail: model.conflict ? model.error : undefined,
        actions: [
          ...(cloudStorageEnabled && !model.conflict
            ? [
                {
                  label: 'Sign in',
                  run: () => {
                    window.open(
                      '/api/storage/session',
                      '_blank',
                      'noopener,noreferrer',
                    );
                  },
                },
              ]
            : []),
          {
            label: 'Export current backup',
            run: () => latestActions.current.model.exportBackup(),
          },
          model.conflict
            ? {
                label: 'Load latest saved workspace',
                run: () => {
                  if (latestActions.current.canLeaveDraft())
                    void latestActions.current.model.reloadFromStorage();
                },
              }
            : {
                label: 'Retry save',
                run: () => {
                  void latestActions.current.model.saveNow();
                },
              },
        ],
      });
    else dismiss('workspace-storage');
    // Actions read the current verified model; notifications never authorize a write.
  }, [model.error, model.conflict, notify, dismiss]);
  useEffect(() => {
    if (model.backupNotice)
      notify({
        id: 'workspace-backup',
        tone: 'success',
        message: model.backupNotice,
      });
  }, [model.backupNotice, notify]);
  useEffect(() => {
    if (preview.error)
      notify({
        id: 'document-preview',
        tone: 'error',
        persistent: true,
        message: 'Preview needs attention',
        detail: preview.error,
        actions: [
          {
            label: 'Try preview again',
            run: () => latestActions.current.preview.rebuild(),
          },
          {
            label: 'Show source',
            run: () => {
              const { preview, canLeaveDraft, switchMode, showSource } =
                latestActions.current;
              if (!canLeaveDraft()) return;
              const location = preview.locations[0];
              if (location)
                void showSource(
                  location.file,
                  location.offset,
                  location.source,
                ).catch((reason) =>
                  setToast(
                    reason instanceof Error
                      ? reason.message
                      : 'The source could not be opened.',
                  ),
                );
              else switchMode('source');
            },
          },
        ],
      });
    else dismiss('document-preview');
  }, [preview.error, notify, dismiss]);
  return (
    <div
      className={
        'shell web-shell ' +
        (!leftOpen ? 'side-hidden ' : '') +
        (!rightOpen ? 'inspector-hidden' : '')
      }
      data-save-status={model.saveStatus}
      data-editor-mode={mode}
    >
      <WorkspaceNavigation
        mode={mode}
        selectedIsNote={selectedIsNote}
        switchMode={switchMode}
        leftOpen={leftOpen}
        rightOpen={rightOpen}
        setLeftOpen={setLeftOpen}
        setRightOpen={setRightOpen}
        sidebarView={sidebarView}
        setSidebarView={setSidebarView}
        showSettings={() => showSettings()}
        moveHistory={moveHistory}
        canBack={visitHistory.cursor > 0}
        canForward={visitHistory.cursor < visitHistory.entries.length - 1}
        controlsRef={navigation}
      />
      <aside
        id="notes-navigation"
        className="sidebar workspace-sidebar"
        aria-label="Workspace navigation"
        aria-hidden={!leftOpen}
        inert={!leftOpen}
      >
        <header className="left-panel-heading">
          <h2>{sidebarView === 'documents' ? 'Documents' : 'Connections'}</h2>
        </header>
        <nav className="left-panel-tabs" aria-label="Workspace sections">
          <button
            type="button"
            className={sidebarView === 'documents' ? 'current' : ''}
            aria-label="Documents"
            title="Documents"
            aria-current={sidebarView === 'documents' ? 'page' : undefined}
            onClick={() => {
              setSidebarView('documents');
              setSidebarQuery('');
            }}
          >
            <BookOpen size={17} strokeWidth={1.65} />
          </button>
          <button
            type="button"
            className={sidebarView === 'connections' ? 'current' : ''}
            aria-label="Connections"
            title="Connections"
            aria-current={sidebarView === 'connections' ? 'page' : undefined}
            onClick={() => {
              setSidebarView('connections');
              setSidebarQuery('');
            }}
          >
            <Network size={17} strokeWidth={1.65} />
          </button>
        </nav>
        <label className="left-panel-search">
          <Search size={15} strokeWidth={1.7} aria-hidden="true" />
          <input
            type="search"
            value={sidebarQuery}
            onChange={(event) => setSidebarQuery(event.target.value)}
            placeholder="Search notes and content…"
            aria-label="Search notes and content"
          />
          {sidebarQuery ? (
            <button
              type="button"
              aria-label="Clear sidebar search"
              onClick={() => setSidebarQuery('')}
            >
              <X size={14} />
            </button>
          ) : (
            <kbd>⌘ K</kbd>
          )}
        </label>
        <div className="left-panel-scroll">
          {sidebarView === 'documents' ? (
            <>
              <section className="recent-section" aria-label="Recent documents">
                <div
                  className="pn-section-rule"
                  role="group"
                  aria-label="Recents section"
                >
                  <span className="pn-section-leader" aria-hidden="true" />
                  <button
                    type="button"
                    className="pn-section-title-button"
                    aria-label="Toggle Recents"
                    aria-expanded={!recentCollapsed}
                    onClick={() => setRecentCollapsed((value) => !value)}
                  >
                    <span className="pn-section-icon-slot" aria-hidden="true">
                      {recentCollapsed ? (
                        <ChevronRight size={14} />
                      ) : (
                        <ChevronDown size={14} />
                      )}
                    </span>
                    <span>Recents</span>
                  </button>
                  <span className="pn-section-tail" aria-hidden="true" />
                </div>
                {!recentCollapsed && (
                  <div className="recent-list">
                    {visibleRecent.map((key) => (
                      <div
                        key={key}
                        className={
                          'recent-row ' + (key === selected ? 'is-current' : '')
                        }
                      >
                        <button
                          type="button"
                          className="recent-open"
                          title={state.documents[key]!.title}
                          aria-label={'Open ' + state.documents[key]!.title}
                          aria-current={key === selected ? 'page' : undefined}
                          onClick={() => openDocument(key)}
                        >
                          <FileText size={14} strokeWidth={1.65} />
                          <span>{state.documents[key]!.title}</span>
                        </button>
                        <button
                          type="button"
                          className="recent-remove"
                          title={
                            'Remove ' +
                            state.documents[key]!.title +
                            ' from Recent'
                          }
                          aria-label={
                            'Remove ' +
                            state.documents[key]!.title +
                            ' from recent documents'
                          }
                          onClick={() => model.removeRecent(key)}
                        >
                          <X size={14} strokeWidth={1.75} />
                        </button>
                      </div>
                    ))}
                    {!recentKeys.length && !needle && (
                      <p className="recent-empty">No recent documents</p>
                    )}
                    {recentKeys.length > RECENT_VISIBLE && (
                      <button
                        type="button"
                        className="recent-more"
                        onClick={() => setRecentShowAll((value) => !value)}
                      >
                        {recentShowAll
                          ? 'Show less'
                          : 'Show ' +
                            (recentKeys.length - RECENT_VISIBLE) +
                            ' more'}
                      </button>
                    )}
                  </div>
                )}
              </section>
              <div
                className="pn-section-rule pn-documents-rule"
                role="group"
                aria-label="Documents section"
              >
                <span className="pn-section-leader" aria-hidden="true" />
                <button
                  type="button"
                  className="pn-section-title-button"
                  aria-label="Toggle Documents"
                  aria-expanded={!documentsCollapsed}
                  onClick={() => setDocumentsCollapsed((value) => !value)}
                >
                  <span className="pn-section-icon-slot" aria-hidden="true">
                    {documentsCollapsed ? (
                      <ChevronRight size={14} />
                    ) : (
                      <ChevronDown size={14} />
                    )}
                  </span>
                  <span>Documents</span>
                </button>
                <span
                  className={
                    'pn-section-tail' +
                    (dropHint?.id === 'root' ? ' tree-root-hint' : '')
                  }
                  aria-hidden="true"
                  title="Drop here to move items to the root"
                  onDragOver={(event) => {
                    if (!canDropTree(draggedItem.current, null, 'into')) return;
                    event.preventDefault();
                    event.stopPropagation();
                    event.dataTransfer.dropEffect = 'move';
                    setDropHint((old) =>
                      old?.id === 'root'
                        ? old
                        : { id: 'root', placement: 'into' },
                    );
                  }}
                  onDrop={(event) => finishTreeDrop(event, null, 'into')}
                />
                <div
                  className="pn-section-actions"
                  role="group"
                  aria-label="Document actions"
                >
                  <button
                    type="button"
                    className="pn-section-action"
                    title="Import file"
                    aria-label="Import file"
                    onClick={() => noteInput.current?.click()}
                  >
                    <Upload size={15} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    className="pn-section-action"
                    title="New document"
                    aria-label="New document"
                    onClick={() => startNew('note', '')}
                  >
                    <FilePlus2 size={15} strokeWidth={1.7} />
                  </button>
                  <button
                    type="button"
                    className="pn-section-action"
                    title="New folder"
                    aria-label="New folder"
                    onClick={() => startNew('folder', '')}
                  >
                    <FolderPlus size={15} strokeWidth={1.7} />
                  </button>
                </div>
              </div>
              <div
                className={
                  'left-folder-list' +
                  (dropHint?.id === 'root' ? ' tree-root-drop' : '')
                }
                aria-label="Document folders"
                hidden={documentsCollapsed}
                onDragOver={(event) => {
                  const element = event.target as Element;
                  if (element.closest('.folder-tree-row, .nav-file')) return;
                  if (canDropTree(draggedItem.current, null, 'into')) {
                    event.preventDefault();
                    event.dataTransfer.dropEffect = 'move';
                    setDropHint((old) =>
                      old?.id === 'root'
                        ? old
                        : { id: 'root', placement: 'into' },
                    );
                  }
                }}
                onDrop={(event) => {
                  const element = event.target as Element;
                  if (element.closest('.folder-tree-row, .nav-file')) return;
                  finishTreeDrop(event, null, 'into');
                }}
              >
                {renderTreeNodes('', 0)}
                {draftRow('', 0)}
              </div>
              {!documentsCollapsed &&
                needle &&
                !activeKeys.some((key) => matches(key)) &&
                !state.folders.some(folderMatches) && (
                  <p className="left-panel-empty">No matching notes.</p>
                )}
            </>
          ) : (
            <>
              <p className="left-panel-context">{metadata.title}</p>
              <NoteConnections
                selected={selected}
                index={linkIndex}
                documents={state.documents}
                onOpen={openDocument}
              />
            </>
          )}
        </div>
        <footer className="left-panel-footer">
          <div className="left-panel-footer-item">
            <button
              type="button"
              className="left-panel-footer-row left-panel-settings"
              onClick={() => showSettings()}
            >
              <Settings2 size={17} strokeWidth={1.7} />
              <span>Settings</span>
            </button>
          </div>
          <div className="left-panel-footer-item">
            <button
              type="button"
              className="left-panel-footer-row left-panel-account"
              onClick={() => showSettings()}
            >
              <span className="left-panel-avatar" aria-hidden="true">
                T
              </span>
              <span className="left-panel-account-label">
                <strong>Personal workspace</strong>
                <small>
                  {cloudStorageEnabled
                    ? 'Private cloud storage'
                    : 'Stored in this browser'}
                </small>
              </span>
              <ChevronDown size={14} />
            </button>
          </div>
        </footer>
      </aside>
      <main className="main-panel" aria-label="Document workspace">
        <div className="main-scroll" ref={documentScroll}>
          <div className="document-wrap">
            <div className="document-heading">
              <div className="doc-title-row">
                <DocumentHeader title={metadata.title} />
              </div>
            </div>
            <div
              className="editor-section"
              onPasteCapture={(event) => {
                const files = [...event.clipboardData.files];
                if (!files.length || !selectedIsNote) return;
                event.preventDefault();
                event.stopPropagation();
                void importAttachments(files);
              }}
              onDragOver={(event) => {
                if (
                  selectedIsNote &&
                  event.dataTransfer.types.includes('Files')
                )
                  event.preventDefault();
              }}
              onDropCapture={(event) => {
                const files = [...event.dataTransfer.files];
                if (!files.length || !selectedIsNote) return;
                event.preventDefault();
                event.stopPropagation();
                void importAttachments(files);
              }}
            >
              <DocumentSurface
                documentId={selected}
                mode={mode}
                fullDocument={fullDocument}
                reactEnabled={reactEnabled}
                runtime={preview}
                sourcePanelRef={sourcePanel}
                editor={{
                  source,
                  sourceIsCurrent: (snapshot) =>
                    model.isCurrentSource(selected, snapshot),
                  rendered: selectedIsNote
                    ? {
                        active: mode === 'preview' && !fullDocument,
                        renderer: WebRenderedRuntime,
                        files,
                        entry: workspace.entry,
                        theme: state.theme,
                        images: previewImages,
                        corePlugins: state.corePlugins,
                        showComponentSource:
                          state.previewPreferences?.showComponentSource,
                        stopped: preview.stopped || fullDocument,
                        rebuildVersion: islandRebuildVersion,
                      }
                    : undefined,
                  wikilinks: linkIndex.outgoing[selected] ?? [],
                  onOpenNote: openDocument,
                  busy: operationPending,
                  readOnly: model.conflict,
                  onRetainAttempt: (base, text) =>
                    model.retainAttempt(selected, base, text),
                  onDiscardAttempt: model.discardLiveAttempt,
                  onKeepAttempt: model.keepLiveAttempt,
                  onAnalysisDiagnostic: (path, snapshot, message) => {
                    if (!model.isCurrentSource(path, snapshot)) return;
                    setAnalysisDiagnostic((current) =>
                      current?.path === path &&
                      current.source === snapshot &&
                      current.message === message
                        ? current
                        : { path, source: snapshot, message },
                    );
                  },
                  onPendingChange: (value) => {
                    model.setPendingEditorDraft(value);
                    setPendingEdit(value);
                  },
                  documentKey: selected,
                  histories,
                  commandsRef: commands,
                  acceptChange: (value) =>
                    model.canUpdateSource(selected, value),
                  onChange: (value) => model.updateSource(selected, value),
                  onShowSource: (offset, snapshot) => {
                    void showSource(selected, offset, snapshot).catch(
                      (reason) =>
                        setToast(
                          reason instanceof Error
                            ? reason.message
                            : 'The source could not be opened.',
                        ),
                    );
                  },
                }}
              />
            </div>
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
        <div className="web-detail-panel">
          <header>
            <h2>Note details</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close note details"
              onClick={() => setRightOpen(false)}
            >
              <X size={17} />
            </button>
          </header>
          <section
            className="web-inspector-detail-section"
            aria-label="Document details"
          >
            <h3>Document</h3>
            <p className="web-detail-path">{metadata.folder || 'Workspace'}</p>
            <dl className="web-details">
              <div>
                <dt>Words</dt>
                <dd>{words.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{dateLabel(metadata.updated)}</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{saveLabel}</dd>
              </div>
            </dl>
            <div className="web-action-list">
              <button
                type="button"
                onClick={() => openDocumentAction('rename')}
              >
                <Pencil size={16} /> Rename
              </button>
              <button type="button" onClick={() => openDocumentAction('move')}>
                <FolderInput size={16} /> Move to folder
              </button>
              <button type="button" onClick={exportSource}>
                <Download size={16} /> Export source
              </button>
              <button type="button" onClick={() => openDocumentAction('trash')}>
                <Trash2 size={16} /> Move to Trash
              </button>
              <button
                type="button"
                aria-label="Document actions"
                onClick={() => setModal('document')}
              >
                <Settings2 size={16} /> More document controls
              </button>
            </div>
          </section>
          {selectedIsNote && (
            <AttachmentGallery
              ids={attachmentIds}
              assets={state.assets}
              onAdd={() => attachmentInput.current?.click()}
              onDownload={model.downloadAttachment}
              disabled={operationPending || pendingEdit || model.conflict}
            />
          )}
          {selectedIsNote && (
            <section
              className="web-inspector-detail-section"
              aria-label="Preview controls"
            >
              <h3>Preview</h3>
              <p className="web-inspector-subtitle">
                {mode === 'preview' &&
                !fullDocument &&
                reactEnabled &&
                preview.available &&
                !preview.stopped
                  ? 'Editable preview'
                  : preview.status}
              </p>
              <div className="web-inline-actions">
                <button
                  type="button"
                  className="web-button"
                  disabled={!reactEnabled || !preview.available}
                  onClick={preview.stopped ? preview.rebuild : preview.stop}
                >
                  {preview.stopped ? <Play size={14} /> : <Pause size={14} />}
                  {preview.stopped ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="web-button"
                  disabled={!reactEnabled || !preview.available}
                  onClick={preview.rebuild}
                >
                  <RotateCcw size={14} /> Rebuild
                </button>
                <button
                  type="button"
                  className="web-button"
                  disabled={pendingEdit || !reactEnabled || !preview.available}
                  onClick={() => {
                    execution.setRequested(!execution.requested);
                    model.setMode('preview');
                  }}
                >
                  {execution.requested
                    ? 'Edit rendered document'
                    : 'Run full document'}
                </button>
              </div>
            </section>
          )}
          <section
            className="web-inspector-detail-section"
            aria-label="Connections"
          >
            <h3>Connections</h3>
            <NoteConnections
              selected={selected}
              index={linkIndex}
              documents={state.documents}
              onOpen={openDocument}
            />
          </section>
        </div>
      </aside>
      <input
        ref={attachmentInput}
        hidden
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,application/pdf,.png,.jpg,.jpeg,.webp,.pdf"
        aria-label="Import attachments"
        onChange={(event) => {
          const files = [...(event.target.files ?? [])];
          event.target.value = '';
          void importAttachments(files);
        }}
      />
      <input
        ref={noteInput}
        hidden
        type="file"
        multiple
        accept=".md,.mdx,.js,.jsx,.ts,.tsx"
        aria-label="Import note files"
        onChange={(event) => {
          const chosen = event.target.files;
          if (chosen && canLeaveDraft()) void model.importFiles([...chosen]);
          event.target.value = '';
        }}
      />
      <input
        ref={folderInput}
        hidden
        type="file"
        multiple
        {...{ webkitdirectory: '', directory: '' }}
        aria-label="Import source folder"
        onChange={(event) => {
          const chosen = event.target.files;
          if (chosen && canLeaveDraft()) void model.importFiles([...chosen]);
          event.target.value = '';
        }}
      />
      <input
        ref={backupInput}
        hidden
        type="file"
        accept=".json,application/json"
        aria-label="Choose workspace backup"
        onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file && canLeaveDraft()) {
            setOperationPending(true);
            void model
              .restoreBackup(file)
              .finally(() => setOperationPending(false));
          }
        }}
      />

      {commandOpen && (
        <DocumentCommandPalette
          shouldRestoreFocus={interaction.shouldRestoreDialogFocus}
          query={commandQuery}
          index={commandIndex}
          results={commandResults}
          onQuery={setCommandQuery}
          onIndex={setCommandIndex}
          onRun={runCommand}
          onClose={() => setCommandOpen(false)}
        />
      )}
      {modal === 'settings' && (
        <Dialog
          title="Settings"
          onClose={() => setModal(null)}
          className="web-settings-dialog"
        >
          <nav className="web-settings-tabs" aria-label="Settings sections">
            {(
              [
                ['storage', 'Workspace', HardDrive],
                ['plugins', 'Core plugins', Settings2],
                ['recovery', 'Recovery', RotateCcw],
                ['trash', 'Trash', Trash2],
                ['help', 'Guide', CircleHelp],
              ] as const
            ).map(([tab, label, Icon]) => (
              <button
                key={tab}
                type="button"
                className={settingsTab === tab ? 'selected' : ''}
                aria-pressed={settingsTab === tab}
                onClick={() => {
                  setSettingsTab(tab);
                  if (tab === 'recovery') void loadRecovery();
                }}
              >
                <Icon size={15} />
                {label}
              </button>
            ))}
          </nav>
          <div className="web-settings-content">
            {settingsTab === 'plugins' && (
              <CorePluginSettings
                plugins={state.corePlugins}
                onPlugin={model.setCorePlugin}
                onReactDisabled={() => execution.setRequested(false)}
              />
            )}
            {settingsTab === 'storage' && (
              <>
                <AppearanceSettings
                  preferences={state.previewPreferences}
                  theme={state.theme}
                  onSource={model.setShowComponentSource}
                  onTheme={model.setTheme}
                />
                <section>
                  <h3>Current document</h3>
                  <button
                    type="button"
                    className="web-button"
                    onClick={() => setModal('document')}
                  >
                    <FileText size={15} /> {metadata.title}
                  </button>
                </section>
                <section>
                  <h3>Your workspace</h3>
                  <p>
                    {activeKeys.length} documents · {trashKeys.length} in Trash
                  </p>
                  <p>
                    {cloudStorageEnabled
                      ? 'Notes autosave to your private cloud workspace. A connection and sign-in are required to open and save notes. To move notes from a browser workspace, export a backup there and restore it here.'
                      : 'Notes save automatically in this browser on this device. There is no account or cloud sync. Clearing site data removes the local workspace.'}
                  </p>
                  <p className="web-storage-state">
                    <Check size={15} />
                    {saveLabel}
                  </p>
                  {!cloudStorageEnabled && (
                    <>
                      <button
                        type="button"
                        className="web-button"
                        onClick={() => void requestPersistentStorage()}
                      >
                        <HardDrive size={15} /> Protect browser storage
                      </button>
                      {persistentStatus && (
                        <p role="status">{persistentStatus}</p>
                      )}
                    </>
                  )}
                </section>
                <section>
                  <h3>Web app</h3>
                  <p>
                    {cloudStorageEnabled
                      ? offline.online
                        ? 'Cloud notes need a connection even when the app is installed.'
                        : 'You are offline. Keep this tab open or export a backup to keep unsaved edits.'
                      : offline.ready
                        ? offline.online
                          ? 'Ready to open offline on this device.'
                          : 'Working offline. Your notes still save in this browser.'
                        : offline.error || 'Preparing offline access…'}
                  </p>
                  {offline.updateAvailable && (
                    <button
                      type="button"
                      className="web-button"
                      disabled={operationPending}
                      onClick={() => {
                        if (!canLeaveDraft()) return;
                        setOperationPending(true);
                        void model
                          .saveNow()
                          .then((saved) => {
                            if (saved) return activateUpdate(model.saveNow);
                            else
                              setToast(
                                'Save your workspace before applying the update.',
                              );
                          })
                          .finally(() => setOperationPending(false));
                      }}
                    >
                      <RotateCcw size={15} /> Save and update app
                    </button>
                  )}
                </section>
                <section>
                  <h3>Backups</h3>
                  <p>
                    Export a backup regularly. A workspace backup includes all
                    sources, folders, Recent shortcuts, settings, and Trash.
                    {cloudStorageEnabled
                      ? ' Keep a copy outside cloud storage.'
                      : ' Keep it somewhere outside this browser.'}
                  </p>
                  <div className="web-inline-actions">
                    <button
                      type="button"
                      className="web-button primary"
                      onClick={model.exportBackup}
                    >
                      <Download size={15} /> Export workspace backup
                    </button>
                    <button
                      type="button"
                      className="web-button"
                      onClick={() => backupInput.current?.click()}
                    >
                      <Upload size={15} /> Restore backup
                    </button>
                  </div>
                </section>
                <section>
                  <h3>Import and export</h3>
                  <p>
                    Import related notes and modules together, or choose a
                    folder to preserve their relative import paths. Export
                    source downloads its exact text.
                  </p>
                  <div className="web-inline-actions">
                    <button
                      type="button"
                      className="web-button"
                      onClick={() => noteInput.current?.click()}
                    >
                      <Upload size={15} /> Import files
                    </button>
                    <button
                      type="button"
                      className="web-button"
                      onClick={() => folderInput.current?.click()}
                    >
                      <FolderInput size={15} /> Import folder
                    </button>
                    <button
                      type="button"
                      className="web-button"
                      onClick={exportSource}
                    >
                      <Download size={15} /> Export current source
                    </button>
                  </div>
                </section>
              </>
            )}
            {settingsTab === 'recovery' && (
              <section>
                <RetainedEdits
                  attempts={model.attempts}
                  error={model.attemptError}
                  disabled={operationPending}
                  onRestore={model.restoreAttempt}
                  onDiscard={model.discardAttempt}
                  onRestored={() => setModal(null)}
                />
                <h3>Recovery history</h3>
                <p>
                  Recovery points contain the whole workspace. Restoring a point
                  replaces the current workspace. Export a backup first if you
                  need an independent copy.
                </p>
                {recoveryLoading && (
                  <p role="status">Loading recovery history…</p>
                )}
                {recoveryError && <p role="alert">{recoveryError}</p>}
                {!recoveryLoading &&
                  !recoveryError &&
                  !recoveryPoints.length && (
                    <p>
                      No recovery points yet. They appear after your workspace
                      is saved.
                    </p>
                  )}
                <div className="web-recovery-list">
                  {recoveryPoints.map((point) => (
                    <div className="web-list-row" key={point.revision}>
                      <Clock size={16} />
                      <span>
                        <strong>{dateLabel(point.updated)}</strong>
                        <small>Workspace revision {point.revision}</small>
                      </span>
                      <button
                        type="button"
                        className="web-button"
                        disabled={operationPending}
                        onClick={() => void restoreRecovery(point.revision)}
                      >
                        Restore
                      </button>
                    </div>
                  ))}
                </div>
              </section>
            )}
            {settingsTab === 'trash' && (
              <section>
                <h3>Trash</h3>
                <p>
                  Removed documents stay here until you restore them. Their
                  source text is included in workspace backups.
                </p>
                {!trashKeys.length && <p>Your Trash is empty.</p>}
                {trashKeys.map((key) => (
                  <div className="web-list-row" key={key}>
                    <FileText size={16} />
                    <span>
                      <strong>{state.documents[key]!.title}</strong>
                      <small>
                        {state.documents[key]!.folder || 'Workspace'}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="web-button"
                      onClick={() => model.restore(key)}
                    >
                      Restore
                    </button>
                  </div>
                ))}
              </section>
            )}
            {settingsTab === 'help' && (
              <>
                <section>
                  <h3>Write, preview, experiment</h3>
                  <p>
                    Write Markdown and mathematics directly in Preview, or use
                    Source for the original text and React code. Interactive
                    React components run in isolated frames.
                  </p>
                  <p>
                    Inline mathematics uses <code>$...$</code>. Display
                    mathematics uses <code>$$...$$</code>. Local JavaScript and
                    TypeScript imports work when related files are imported
                    together.
                  </p>
                  {cloudStorageEnabled && (
                    <p>
                      Cloud saves finish when the server confirms them. If
                      saving fails, keep this tab open or export a backup to
                      keep your edits.
                    </p>
                  )}
                  <p>
                    Document React cannot access your workspace storage or the
                    network. Remote images and arbitrary npm imports are
                    unavailable. Ordinary text edits preserve unchanged
                    components; changing executable code or using Rebuild resets
                    their temporary state. Run full document rebuilds the whole
                    runtime after source changes.
                  </p>
                </section>
                <section>
                  <h3>
                    <Keyboard size={17} /> Keyboard shortcuts
                  </h3>
                  <p>
                    These shortcuts apply while the editor or workspace has
                    focus. After using an interactive component in Preview,
                    click an app control or the Source editor first.
                  </p>
                  <dl className="web-shortcuts">
                    <div>
                      <dt>Search notes and commands</dt>
                      <dd>
                        <kbd>Ctrl/Cmd K</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>Switch Source / Preview</dt>
                      <dd>
                        <kbd>Ctrl/Cmd E</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>Save workspace</dt>
                      <dd>
                        <kbd>Ctrl/Cmd S</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>Toggle navigation</dt>
                      <dd>
                        <kbd>Ctrl/Cmd \</kbd>
                      </dd>
                    </div>
                    <div>
                      <dt>Undo / redo in source</dt>
                      <dd>
                        <kbd>Ctrl/Cmd Z</kbd> / <kbd>Shift Z</kbd>
                      </dd>
                    </div>
                  </dl>
                </section>
                <section>
                  <h3>Recent is a stable shelf</h3>
                  <p>
                    Opening a new document adds its shortcut at the end.
                    Reopening a document keeps its position. The × removes only
                    the shortcut.
                  </p>
                </section>
              </>
            )}
          </div>
        </Dialog>
      )}
      {modal === 'document' && (
        <Dialog title="Document actions" onClose={() => setModal(null)}>
          <div className="web-inspector-body">
            <h3>{metadata.title}</h3>
            <p className="web-detail-path">
              {metadata.folder || 'Workspace'}
              <br />
              <code>{selected.slice(selected.indexOf('/') + 1)}</code>
            </p>
            <dl className="web-details">
              <div>
                <dt>Words</dt>
                <dd>{words.toLocaleString()}</dd>
              </div>
              <div>
                <dt>Updated</dt>
                <dd>{dateLabel(metadata.updated)}</dd>
              </div>
              <div>
                <dt>Storage</dt>
                <dd>{saveLabel}</dd>
              </div>
            </dl>
            <div className="web-action-list">
              <button
                type="button"
                onClick={() => openDocumentAction('rename')}
              >
                <Pencil size={16} /> Rename
              </button>
              <button type="button" onClick={() => openDocumentAction('move')}>
                <FolderInput size={16} /> Move to folder
              </button>
              <button type="button" onClick={exportSource}>
                <Download size={16} /> Export source
              </button>
              <button type="button" onClick={() => openDocumentAction('trash')}>
                <Trash2 size={16} /> Move to Trash
              </button>
            </div>
            <section className="web-detail-section">
              <h4>Preview</h4>
              <p>
                {mode === 'preview' &&
                !fullDocument &&
                reactEnabled &&
                preview.available &&
                !preview.stopped
                  ? 'Editable preview'
                  : preview.status}
              </p>
              <div className="web-inline-actions">
                <button
                  type="button"
                  className="web-button"
                  disabled={!reactEnabled || !preview.available}
                  onClick={preview.stopped ? preview.rebuild : preview.stop}
                >
                  {preview.stopped ? <Play size={14} /> : <Pause size={14} />}
                  {preview.stopped ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="web-button"
                  disabled={!reactEnabled || !preview.available}
                  onClick={preview.rebuild}
                >
                  <RotateCcw size={14} /> Rebuild
                </button>
              </div>
              <p className="web-hint">
                Rebuild resets interactive state. Ordinary text edits preserve
                unchanged components in editable Preview; Run full document
                rebuilds after source changes.
              </p>
            </section>
            <section className="web-detail-section">
              <button
                type="button"
                className="web-text-button"
                onClick={() => showSettings('help')}
              >
                <CircleHelp size={16} /> Editor guide and shortcuts
              </button>
            </section>
          </div>
        </Dialog>
      )}
      {(modal === 'rename' || modal === 'move') && (
        <Dialog
          title={modal === 'rename' ? 'Rename document' : 'Move document'}
          onClose={() => setModal(null)}
        >
          <form
            className="web-form"
            onSubmit={(event) => {
              event.preventDefault();
              if (modal === 'rename') model.rename(selected, formValue);
              else model.move(selected, formValue);
              setModal(null);
            }}
          >
            <label>
              {modal === 'rename' ? 'Document title' : 'Destination folder'}
              {modal === 'rename' ? (
                <input
                  data-autofocus
                  value={formValue}
                  maxLength={200}
                  onChange={(event) => setFormValue(event.target.value)}
                />
              ) : (
                <select
                  data-autofocus
                  value={formValue}
                  onChange={(event) => setFormValue(event.target.value)}
                >
                  <option value="">Workspace</option>
                  {state.folders.map((folder) => (
                    <option key={folder} value={folder}>
                      {folder}
                    </option>
                  ))}
                </select>
              )}
            </label>
            <p className="web-hint">
              This changes the document label or workspace folder. Existing
              source import paths stay the same.
            </p>
            <div className="web-form-actions">
              <button
                type="button"
                className="web-button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="web-button primary"
                disabled={modal === 'rename' && !formValue.trim()}
              >
                {modal === 'rename' ? 'Rename' : 'Move'}
              </button>
            </div>
          </form>
        </Dialog>
      )}
      {modal === 'trash' && (
        <Dialog title="Move to Trash" onClose={() => setModal(null)}>
          <div className="web-form">
            <p>
              Move <strong>{metadata.title}</strong> to Trash? You can restore
              it from Settings.
            </p>
            <p className="web-hint">
              Other notes importing this source may need it. Source is retained
              in Trash and workspace backups.
            </p>
            <div className="web-form-actions">
              <button
                type="button"
                className="web-button"
                onClick={() => setModal(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="web-button danger"
                onClick={() => {
                  model.trash(selected);
                  setModal(null);
                }}
              >
                Move to Trash
              </button>
            </div>
          </div>
        </Dialog>
      )}
    </div>
  );
}
