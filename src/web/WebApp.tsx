import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type DragEvent,
  type ReactNode,
} from 'react';
import {
  AlertCircle,
  ArrowLeft,
  ArrowRight,
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
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
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
import {
  SourceEditor,
  type EditorCommands,
  type EditorHistory,
} from '../editor/SourceEditor';
import { compilerFiles } from '../documents/workspace';
import { isMdxSource } from '../sourceTypes';
import { useWebWorkspace } from './useWebWorkspace';
import { useWebPreview } from './useWebPreview';
import { WebPreview } from './WebPreview';
import { useOffline, activateUpdate } from './offline';
import { createHoverIntentController } from './hoverIntent';
import { indexWorkspaceLinks } from '../links';
import { NoteConnections } from './NoteConnections';
import { AttachmentGallery } from './AttachmentGallery';
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
type SettingsTab = 'storage' | 'recovery' | 'trash' | 'help';
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

function Dialog({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  useEffect(() => {
    close.current = onClose;
  }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    const first =
      panel.current?.querySelector<HTMLElement>('[data-autofocus]') ??
      panel.current?.querySelector<HTMLElement>('input, button');
    first?.focus();
    const keydown = (event: KeyboardEvent) => {
      // A native top-layer dialog owns its focus trap and Escape handling.
      if (
        event.target instanceof Element &&
        event.target.closest('dialog[open]')
      )
        return;
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        close.current();
      }
      if (event.key !== 'Tab') return;
      const elements = [
        ...(panel.current?.querySelectorAll<HTMLElement>(
          'button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), a[href], [tabindex="0"]',
        ) ?? []),
      ].filter((element) => element.getClientRects().length > 0);
      const firstItem = elements[0],
        lastItem = elements[elements.length - 1];
      if (!firstItem || !lastItem) return;
      if (event.shiftKey && document.activeElement === firstItem) {
        event.preventDefault();
        lastItem.focus();
      } else if (!event.shiftKey && document.activeElement === lastItem) {
        event.preventDefault();
        firstItem.focus();
      }
    };
    document.addEventListener('keydown', keydown, true);
    return () => {
      document.removeEventListener('keydown', keydown, true);
      previous?.focus();
    };
  }, []);
  return (
    <div
      className="modal-overlay web-modal-overlay"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        ref={panel}
        className={'web-dialog ' + className}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <header className="web-dialog-heading">
          <h2>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={'Close ' + title}
            onClick={onClose}
          >
            <X size={18} />
          </button>
        </header>
        {children}
      </div>
    </div>
  );
}

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
  return <WorkspaceApp model={model} state={model.state} />;
}

function StorageFailure({ model }: { model: WorkspaceModel }) {
  const input = useRef<HTMLInputElement>(null);
  const [points, setPoints] = useState<RecoveryPoint[]>([]);
  const [checked, setChecked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [historyError, setHistoryError] = useState('');
  return (
    <div className="web-loading web-storage-failure">
      <AlertCircle size={26} />
      <h1>Your workspace could not open</h1>
      <p role="alert">{model.error || 'Browser storage is unavailable.'}</p>
      <p>
        Retry, restore a workspace backup, or check recovery history. Use a
        regular browser window with site storage enabled.
      </p>
      <div className="web-inline-actions">
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

function DocumentTitle({
  title,
  onRename,
  disabled,
}: {
  title: string;
  onRename: (title: string) => void;
  disabled?: boolean;
}) {
  const [draft, setDraft] = useState(title);
  const [previousTitle, setPreviousTitle] = useState(title);
  // Preserve spaces while typing; external renames and restores update the input.
  if (previousTitle !== title) {
    setPreviousTitle(title);
    if (draft.trim() !== title) setDraft(title);
  }
  return (
    <input
      aria-label="Document title"
      disabled={disabled}
      className="doc-title-input"
      value={draft}
      maxLength={200}
      spellCheck={false}
      onChange={(event) => {
        const value = event.target.value;
        setDraft(value);
        if (value.trim() && value.trim() !== title) onRename(value.trim());
      }}
      onBlur={() => {
        if (!draft.trim()) setDraft(title);
      }}
      onKeyDown={(event) => {
        if (event.key === 'Enter') event.currentTarget.blur();
        if (event.key === 'Escape') {
          setDraft(title);
          event.currentTarget.blur();
        }
      }}
    />
  );
}

function WorkspaceApp({
  model,
  state,
}: {
  model: WorkspaceModel;
  state: WebState;
}) {
  const { notify, dismiss } = useNotifications();
  const { workspace } = state;
  const offline = useOffline();
  const selected = workspace.selected;
  const metadata = state.documents[selected]!;
  const source = workspace.files[selected] ?? '';
  const attachmentRefs = useMemo(
    () => attachmentReferences(source, selected),
    [source, selected],
  );
  const attachmentIds = useMemo(
    () => [...new Set(attachmentRefs.map((reference) => reference.id))],
    [attachmentRefs],
  );
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
  const preview = useWebPreview({
    files,
    entry: workspace.entry,
    theme: state.theme,
    images: previewImages,
  });
  const histories = useRef<EditorHistory>(new Map());
  const commands = useRef<EditorCommands>(null);
  const documentScroll = useRef<HTMLDivElement>(null);
  const sourcePanel = useRef<HTMLDivElement>(null);
  const noteInput = useRef<HTMLInputElement>(null);
  const folderInput = useRef<HTMLInputElement>(null);
  const backupInput = useRef<HTMLInputElement>(null);
  const attachmentInput = useRef<HTMLInputElement>(null);
  const newItemInput = useRef<HTMLInputElement>(null);
  const pendingLocation = useRef<{
    key: string;
    offset: number;
    source: string;
  } | null>(null);
  const [leftOpen, setLeftOpen] = useState(false);
  const [rightOpen, setRightOpen] = useState(false);
  const [runtimeDocument, setRuntimeDocument] = useState<string | null>(null);
  const [islandOpen, setIslandOpen] = useState(false);
  const [peekSide, setPeekSide] = useState<'left' | 'right' | null>(null);
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
  const [visitHistory, setVisitHistory] = useState({
    entries: [selected],
    cursor: 0,
  });
  const controller = useRef<ReturnType<
    typeof createHoverIntentController
  > | null>(null);
  const panels = useRef({ leftExpanded: false, rightExpanded: false });
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
  const selectedIsNote = isMdxSource(selected);
  const mode = selectedIsNote && state.mode !== 'source' ? 'preview' : 'source';
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
          saved: 'Saved in this browser',
          error: 'Not saved',
          conflict: 'Another tab changed this workspace',
        } as const
      )[model.saveStatus];

  useEffect(() => {
    document.documentElement.dataset.theme = state.theme;
    document.title = metadata.title + ' · Programmable Notes';
  }, [state.theme, metadata.title]);
  useEffect(() => {
    panels.current = { leftExpanded: leftOpen, rightExpanded: rightOpen };
  }, [leftOpen, rightOpen]);
  useEffect(() => {
    const hover = createHoverIntentController({
      onShow: (zone) =>
        zone === 'top' ? setIslandOpen(true) : setPeekSide(zone),
      onHide: (zone) =>
        zone === 'top'
          ? setIslandOpen(false)
          : setPeekSide((old) => (old === zone ? null : old)),
    });
    controller.current = hover;
    const canHover = window.matchMedia('(hover: hover) and (pointer: fine)');
    const move = (event: PointerEvent) => {
      if (!canHover.matches) return;
      hover.move(
        {
          x: event.clientX,
          y: event.clientY,
          width: window.innerWidth,
          time: performance.now(),
          pointerType: event.pointerType,
        },
        panels.current,
      );
    };
    const leave = (event: PointerEvent) => {
      if (!event.relatedTarget) hover.clear();
    };
    window.addEventListener('pointermove', move, { passive: true });
    document.documentElement.addEventListener('pointerleave', leave);
    return () => {
      window.removeEventListener('pointermove', move);
      document.documentElement.removeEventListener('pointerleave', leave);
      hover.destroy();
      controller.current = null;
    };
  }, []);
  useEffect(() => {
    if (newItem) newItemInput.current?.focus();
  }, [newItem?.kind, newItem?.parent]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    if (!toast) return;
    notify({ id: 'workspace-feedback', message: toast });
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast, notify]);
  useEffect(() => {
    const location = pendingLocation.current;
    if (location && selected === location.key && mode === 'source') {
      commands.current?.revealSource(location.offset, location.source);
      pendingLocation.current = null;
    }
  }, [selected, mode]);

  const closePeek = () => {
    controller.current?.clear();
    setPeekSide(null);
  };
  const canLeaveDraft = () => {
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
  const importAttachments = async (files: File[]) => {
    if (!files.length || !selectedIsNote || !canLeaveDraft()) return;
    const target = selected;
    setOperationPending(true);
    try {
      await model.importAttachments(files, target);
    } finally {
      setOperationPending(false);
    }
  };
  const openLeft = (view: 'documents' | 'connections' = 'documents') => {
    closePeek();
    setSidebarView(view);
    setLeftOpen(true);
    if (window.innerWidth <= 720) setRightOpen(false);
  };
  const openRight = () => {
    closePeek();
    setRightOpen(true);
    if (window.innerWidth <= 720) setLeftOpen(false);
  };
  const switchMode = (next: 'source' | 'preview') => {
    if (next !== 'source' && !selectedIsNote) return;
    if (!canLeaveDraft()) return;
    const initiator = document.activeElement;
    model.setMode(next);
    if (next === 'source') {
      requestAnimationFrame(() => {
        // A newer user focus choice owns the next keystroke. In particular,
        // do not interrupt title input or IME composition after mode switching.
        const active = document.activeElement;
        if (active && active !== document.body && active !== initiator) return;
        sourcePanel.current?.querySelector<HTMLElement>('.cm-content')?.focus();
      });
    }
  };
  const openDocument = (key: string) => {
    if (!canLeaveDraft()) return;
    if (!state.documents[key] || state.documents[key]!.trashedAt) return;
    model.select(key);
    if (!isMdxSource(key)) model.setMode('source');
    setVisitHistory((history) => {
      if (history.entries[history.cursor] === key) return history;
      const entries = [
        ...history.entries.slice(0, history.cursor + 1),
        key,
      ].slice(-40);
      return { entries, cursor: entries.length - 1 };
    });
    if (window.innerWidth <= 720) setLeftOpen(false);
    documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
  };
  const moveHistory = (offset: number) => {
    if (!canLeaveDraft()) return;
    let cursor = visitHistory.cursor + offset;
    while (cursor >= 0 && cursor < visitHistory.entries.length) {
      const key = visitHistory.entries[cursor]!;
      if (state.documents[key] && !state.documents[key]!.trashedAt) {
        model.select(key);
        if (!isMdxSource(key)) model.setMode('source');
        setVisitHistory((old) => ({ ...old, cursor }));
        documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
        return;
      }
      cursor += offset;
    }
  };
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
      setNewItem(null);
      model.setMode('source');
      documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
      setVisitHistory((history) => {
        const entries = [...history.entries.slice(0, history.cursor + 1), key];
        return { entries, cursor: entries.length - 1 };
      });
      if (window.innerWidth <= 720) setLeftOpen(false);
      requestAnimationFrame(() => {
        const titleInput =
          document.querySelector<HTMLInputElement>('.doc-title-input');
        titleInput?.focus();
        titleInput?.select();
      });
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
      model.setMode('source');
      documentScroll.current?.scrollTo({ top: 0, behavior: 'instant' });
      requestAnimationFrame(() =>
        sourcePanel.current?.querySelector<HTMLElement>('.cm-content')?.focus(),
      );
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
      setRecoveryPoints(await model.listRecovery());
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
      <button
        type="button"
        key={key}
        className={
          'nav-file ' +
          (key === selected ? 'selected' : '') +
          treeDropClass({ kind: 'document', id: key })
        }
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
        style={{
          /* Exactly one indentation level belongs outside each row.
             The inner icon padding is fixed to match sibling folders. */
          marginLeft: depth * 16,
          paddingLeft: 7,
          width: 'calc(100% - ' + depth * 16 + 'px)',
        }}
        onClick={() => openDocument(key)}
        title={note.title}
        aria-label={'Open ' + note.title}
        aria-current={key === selected ? 'page' : undefined}
      >
        <Icon size={14} strokeWidth={1.65} />
        <span>{note.title}</span>
      </button>
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
  const actions = [
    ...(selectedIsNote && mode === 'preview'
      ? [
          ['Insert link', 'link'],
          ['Insert table', 'table'],
          ['Add table row', 'row'],
          ['Insert equation', 'math'],
          ['Bullet list', 'bullet'],
          ['Ordered list', 'ordered'],
          ['Task list', 'task'],
          ['Blockquote', 'quote'],
        ].map(([name, action]) => ({
          name: name!,
          description: 'Format the selected Markdown',
          icon: Pencil,
          actionId: 'format:' + action,
        }))
      : []),
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
            description: 'Attach files to this note, including them in backups',
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
      description: 'Save all changes in this browser',
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
  ].filter(
    (action) =>
      !commandNeedle ||
      (action.name + ' ' + action.description)
        .toLocaleLowerCase()
        .includes(commandNeedle),
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
  const runCommand = (result: { id: string }) => {
    setCommandOpen(false);
    if (result.id.startsWith('action:format:')) {
      const action = result.id.slice('action:format:'.length);
      requestAnimationFrame(() => commands.current?.formatRendered?.(action));
      return;
    }
    if (result.id.startsWith('document:')) {
      openDocument(result.id.slice('document:'.length));
      return;
    }
    switch (result.id.slice('action:'.length)) {
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
      case 'source':
        switchMode('source');
        break;
      case 'preview':
        switchMode('preview');
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
  };
  useEffect(() => {
    if (commandOpen)
      document
        .querySelector('.web-command-dialog .keyboard-selected')
        ?.scrollIntoView({ block: 'nearest' });
  }, [commandIndex, commandOpen]);

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
  const latestActions = useRef({ model, canLeaveDraft, preview, switchMode });
  useLayoutEffect(() => {
    latestActions.current = { model, canLeaveDraft, preview, switchMode };
  });
  useEffect(() => {
    if (model.error || model.conflict)
      notify({
        id: 'workspace-storage',
        tone: 'error',
        persistent: true,
        dismissible: false,
        message: model.conflict
          ? 'This workspace changed in another tab.'
          : model.error,
        detail: model.conflict ? model.error : undefined,
        actions: [
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
              const { model, preview, canLeaveDraft, switchMode } =
                latestActions.current;
              if (!canLeaveDraft()) return;
              const location = preview.locations[0];
              if (location) {
                pendingLocation.current = {
                  key: location.file,
                  offset: location.offset,
                  source: location.source,
                };
                model.select(location.file);
                model.setMode('source');
                requestAnimationFrame(() =>
                  commands.current?.revealSource(
                    location.offset,
                    location.source,
                  ),
                );
              } else switchMode('source');
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
      <div className={'mode-island ' + (islandOpen ? 'is-open' : '')}>
        <div className="mode-island-surface">
          <div
            id="mode-island-actions"
            className={'mode-island-actions mode-is-' + mode}
            role="group"
            aria-label="Document mode"
          >
            <span className="mode-island-selection" aria-hidden="true" />
            {(['source', 'preview'] as const).map((value) => (
              <button
                type="button"
                key={value}
                className={mode === value ? 'selected' : ''}
                aria-pressed={mode === value}
                disabled={value !== 'source' && !selectedIsNote}
                title={
                  value === 'preview' && !selectedIsNote
                    ? 'Select a Markdown or MDX note to preview'
                    : undefined
                }
                onClick={(event) => {
                  switchMode(value);
                  event.currentTarget.blur();
                }}
              >
                {value === 'source' ? 'Source' : 'Preview'}
              </button>
            ))}
          </div>
        </div>
        <button
          type="button"
          className="mode-island-handle"
          aria-label="Show document modes"
          title="Document modes"
          aria-controls="mode-island-actions"
          aria-expanded={islandOpen}
          onClick={() => {
            const next = !islandOpen;
            if (next) controller.current?.markShown('top');
            else controller.current?.clear('top');
            setIslandOpen(next);
          }}
        />
      </div>
      <nav
        className={
          'peek-rail peek-rail-left ' +
          (peekSide === 'left' && !leftOpen ? 'visible' : '')
        }
        aria-label="Left quick-access panel"
        aria-hidden={peekSide !== 'left' || leftOpen}
        inert={peekSide !== 'left' || leftOpen}
      >
        <div className="peek-rail-top">
          <button
            type="button"
            className={sidebarView === 'documents' ? 'active' : ''}
            aria-label="Open documents"
            title="Documents"
            onClick={() => openLeft()}
          >
            <BookOpen size={18} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            className={sidebarView === 'connections' ? 'active' : ''}
            aria-label="Open connections"
            title="Connections"
            onClick={() => openLeft('connections')}
          >
            <Network size={18} strokeWidth={1.7} />
          </button>
          <span className="peek-rail-divider" aria-hidden="true" />
          <button
            type="button"
            aria-label="Search documents"
            title="Search documents"
            onClick={() => {
              openLeft();
              requestAnimationFrame(() =>
                document
                  .querySelector<HTMLInputElement>('.left-panel-search input')
                  ?.focus(),
              );
            }}
          >
            <Search size={18} strokeWidth={1.7} />
          </button>
        </div>
        <div className="peek-rail-bottom">
          <button
            type="button"
            aria-label="Open settings"
            title="Settings"
            onClick={() => showSettings()}
          >
            <Settings2 size={18} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="Workspace storage"
            title="Personal workspace"
            onClick={() => showSettings()}
          >
            <span className="peek-rail-avatar" aria-hidden="true">
              T
            </span>
          </button>
        </div>
      </nav>
      <nav
        className={
          'peek-rail peek-rail-right ' +
          (peekSide === 'right' && !rightOpen ? 'visible' : '')
        }
        aria-label="Right quick-access panel"
        aria-hidden={peekSide !== 'right' || rightOpen}
        inert={peekSide !== 'right' || rightOpen}
      >
        <div className="peek-rail-top">
          <button
            type="button"
            aria-label="Open right panel"
            title="Open right panel"
            onClick={openRight}
          >
            <PanelRightOpen size={18} strokeWidth={1.7} />
          </button>
          <span className="peek-rail-divider" />
          <button
            type="button"
            aria-label="Previous document"
            title="Previous document"
            disabled={visitHistory.cursor <= 0}
            onClick={() => moveHistory(-1)}
          >
            <ArrowLeft size={18} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="Next document"
            title="Next document"
            disabled={visitHistory.cursor >= visitHistory.entries.length - 1}
            onClick={() => moveHistory(1)}
          >
            <ArrowRight size={18} strokeWidth={1.7} />
          </button>
        </div>
      </nav>
      <button
        type="button"
        className="floating-toggle floating-left"
        aria-label={leftOpen ? 'Close navigation' : 'Open navigation'}
        title="Navigation (Ctrl/Cmd + \)"
        aria-expanded={leftOpen}
        aria-controls="notes-navigation"
        onClick={() => {
          closePeek();
          setLeftOpen((open) => !open);
          if (window.innerWidth <= 720) setRightOpen(false);
        }}
      >
        {leftOpen ? (
          <PanelLeftClose size={19} strokeWidth={1.65} />
        ) : (
          <PanelLeftOpen size={19} strokeWidth={1.65} />
        )}
      </button>
      <button
        type="button"
        className="floating-toggle floating-right"
        aria-label={rightOpen ? 'Close right panel' : 'Open right panel'}
        title="Right panel"
        aria-expanded={rightOpen}
        aria-controls="notes-details"
        onClick={() => {
          closePeek();
          setRightOpen((open) => !open);
          if (window.innerWidth <= 720) setLeftOpen(false);
        }}
      >
        {rightOpen ? (
          <PanelRightClose size={19} strokeWidth={1.65} />
        ) : (
          <PanelRightOpen size={19} strokeWidth={1.65} />
        )}
      </button>
      {(leftOpen || rightOpen) && (
        <button
          type="button"
          className="mobile-scrim"
          onClick={() => {
            setLeftOpen(false);
            setRightOpen(false);
          }}
          aria-label="Close open panel"
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
                <small>Stored in this browser</small>
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
                <DocumentTitle
                  key={selected}
                  title={metadata.title}
                  disabled={pendingEdit}
                  onRename={(title) => model.rename(selected, title)}
                />
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
              <div
                ref={sourcePanel}
                className="web-source-panel"
                hidden={mode === 'preview' && runtimeDocument === selected}
              >
                <SourceEditor
                  key={selected}
                  source={source}
                  sourceIsCurrent={(snapshot) =>
                    model.isCurrentSource(selected, snapshot)
                  }
                  rendered={
                    selectedIsNote
                      ? {
                          active:
                            mode === 'preview' && runtimeDocument !== selected,
                          files,
                          entry: workspace.entry,
                          theme: state.theme,
                          images: previewImages,
                          stopped:
                            preview.stopped || runtimeDocument === selected,
                        }
                      : undefined
                  }
                  wikilinks={linkIndex.outgoing[selected] ?? []}
                  onOpenNote={openDocument}
                  busy={operationPending}
                  onPendingChange={(value) => {
                    model.setPendingEditorDraft(value);
                    setPendingEdit(value);
                  }}
                  documentKey={selected}
                  histories={histories}
                  commandsRef={commands}
                  acceptChange={(value) =>
                    model.canUpdateSource(selected, value)
                  }
                  onChange={(value) => model.updateSource(selected, value)}
                  onShowSource={(offset, snapshot) => {
                    if (!canLeaveDraft()) return;
                    model.setMode('source');
                    requestAnimationFrame(() =>
                      commands.current?.revealSource(offset, snapshot),
                    );
                  }}
                />
              </div>
              <div className="web-preview-panel" hidden={mode !== 'preview'}>
                {preview.html && runtimeDocument === selected && (
                  <WebPreview
                    html={preview.html}
                    theme={state.theme}
                    onError={preview.reportRuntimeError}
                  />
                )}
                {!preview.html &&
                  !preview.error &&
                  runtimeDocument === selected && (
                    <div className="web-preview-placeholder" role="status">
                      {preview.stopped ? (
                        <>
                          <Pause size={20} />
                          <p>Preview is paused.</p>
                          <button
                            type="button"
                            className="web-button"
                            onClick={preview.rebuild}
                          >
                            <Play size={14} /> Resume preview
                          </button>
                        </>
                      ) : (
                        <>
                          <LoaderCircle className="web-spin" size={20} />
                          <span>Preparing preview…</span>
                        </>
                      )}
                    </div>
                  )}
              </div>
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
              disabled={operationPending || pendingEdit}
            />
          )}
          {selectedIsNote && (
            <section
              className="web-inspector-detail-section"
              aria-label="Preview controls"
            >
              <h3>Preview</h3>
              <p className="web-inspector-subtitle">{preview.status}</p>
              <div className="web-inline-actions">
                <button
                  type="button"
                  className="web-button"
                  onClick={preview.stopped ? preview.rebuild : preview.stop}
                >
                  {preview.stopped ? <Play size={14} /> : <Pause size={14} />}
                  {preview.stopped ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="web-button"
                  onClick={preview.rebuild}
                >
                  <RotateCcw size={14} /> Rebuild
                </button>
                <button
                  type="button"
                  className="web-button"
                  disabled={pendingEdit}
                  onClick={() => {
                    setRuntimeDocument(
                      runtimeDocument === selected ? null : selected,
                    );
                    model.setMode('preview');
                  }}
                >
                  {runtimeDocument === selected
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
        <Dialog
          title="Command palette"
          onClose={() => setCommandOpen(false)}
          className="web-command-dialog"
        >
          <div className="modal-search">
            <Search size={20} />
            <input
              data-autofocus
              placeholder="Search notes or run a command…"
              aria-label="Search commands and notes"
              value={commandQuery}
              onChange={(event) => {
                setCommandQuery(event.target.value);
                setCommandIndex(0);
              }}
              onKeyDown={(event) => {
                if (event.key === 'ArrowDown') {
                  event.preventDefault();
                  setCommandIndex((old) =>
                    Math.min(old + 1, commandResults.length - 1),
                  );
                }
                if (event.key === 'ArrowUp') {
                  event.preventDefault();
                  setCommandIndex((old) => Math.max(0, old - 1));
                }
                if (event.key === 'Enter') {
                  event.preventDefault();
                  const result = commandResults[commandIndex];
                  if (result) runCommand(result);
                }
              }}
            />
            <kbd>ESC</kbd>
          </div>
          <div className="modal-content">
            {commandResults.map((result, index) => (
              <button
                type="button"
                key={result.id}
                className={
                  'cmd-result ' +
                  (index === commandIndex ? 'keyboard-selected' : '')
                }
                onClick={() => runCommand(result)}
              >
                <result.icon size={16} />
                <span>
                  {result.name}
                  <small>{result.description}</small>
                </span>
                <ArrowRight size={14} />
              </button>
            ))}
            {!commandResults.length && (
              <p className="no-results">No matching notes or commands.</p>
            )}
          </div>
          <div className="modal-footer">
            <span>
              <kbd>↑ ↓</kbd> Navigate
            </span>
            <span>
              <kbd>↵</kbd> Select
            </span>
            <span>
              <kbd>ESC</kbd> Close
            </span>
          </div>
        </Dialog>
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
            {settingsTab === 'storage' && (
              <>
                <section>
                  <h3>Appearance</h3>
                  <div className="left-panel-theme-buttons">
                    <button
                      type="button"
                      className={state.theme === 'dark' ? 'selected' : ''}
                      onClick={() => model.setTheme('dark')}
                      aria-pressed={state.theme === 'dark'}
                    >
                      <Moon size={15} /> Dark
                    </button>
                    <button
                      type="button"
                      className={state.theme === 'light' ? 'selected' : ''}
                      onClick={() => model.setTheme('light')}
                      aria-pressed={state.theme === 'light'}
                    >
                      <Sun size={15} /> Light
                    </button>
                  </div>
                </section>
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
                    Notes save automatically in this browser on this device.
                    There is no account or cloud sync. Clearing site data
                    removes the local workspace.
                  </p>
                  <p className="web-storage-state">
                    <Check size={15} />
                    {saveLabel}
                  </p>
                  <button
                    type="button"
                    className="web-button"
                    onClick={() => void requestPersistentStorage()}
                  >
                    <HardDrive size={15} /> Protect browser storage
                  </button>
                  {persistentStatus && <p role="status">{persistentStatus}</p>}
                </section>
                <section>
                  <h3>Web app</h3>
                  <p>
                    {offline.ready
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
                    Keep it somewhere outside this browser.
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
                    Use Source for Markdown, LaTeX mathematics, and MDX with
                    React components. Preview runs the current note in an
                    isolated frame.
                  </p>
                  <p>
                    Inline mathematics uses <code>$...$</code>. Display
                    mathematics uses <code>$$...$$</code>. Local JavaScript and
                    TypeScript imports work when related files are imported
                    together.
                  </p>
                  <p>
                    Preview cannot access your workspace storage or the network.
                    Remote images and arbitrary npm imports are unavailable.
                    Changing source rebuilds the preview and resets its
                    component state.
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
              <p>{preview.status}</p>
              <div className="web-inline-actions">
                <button
                  type="button"
                  className="web-button"
                  onClick={preview.stopped ? preview.rebuild : preview.stop}
                >
                  {preview.stopped ? <Play size={14} /> : <Pause size={14} />}
                  {preview.stopped ? 'Resume' : 'Pause'}
                </button>
                <button
                  type="button"
                  className="web-button"
                  onClick={preview.rebuild}
                >
                  <RotateCcw size={14} /> Rebuild
                </button>
              </div>
              <p className="web-hint">
                Source changes rebuild the preview and reset interactive
                component state.
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
