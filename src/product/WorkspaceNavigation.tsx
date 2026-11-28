import {
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from 'react';
import {
  BookOpen,
  Network,
  Search,
  Settings2,
  PanelRightOpen,
  ArrowLeft,
  ArrowRight,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
} from 'lucide-react';
import { createHoverIntentController } from '../web/hoverIntent';
export interface WorkspaceNavigationHandle {
  closePeek(): void;
  openLeft(view?: 'documents' | 'connections'): void;
  openRight(): void;
}
export interface WorkspaceNavigationProps {
  mode: 'source' | 'preview';
  selectedIsNote: boolean;
  switchMode(mode: 'source' | 'preview'): void;
  leftOpen: boolean;
  rightOpen: boolean;
  setLeftOpen: React.Dispatch<React.SetStateAction<boolean>>;
  setRightOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarView: 'documents' | 'connections';
  setSidebarView(view: 'documents' | 'connections'): void;
  showSettings(): void;
  moveHistory(offset: number): void;
  canBack: boolean;
  canForward: boolean;
  controlsRef: RefObject<WorkspaceNavigationHandle | null>;
  connectionsEnabled?: boolean;
}
export function WorkspaceNavigation({
  mode,
  selectedIsNote,
  switchMode,
  leftOpen,
  rightOpen,
  setLeftOpen,
  setRightOpen,
  sidebarView,
  setSidebarView,
  showSettings,
  moveHistory,
  canBack,
  canForward,
  controlsRef,
  connectionsEnabled = true,
}: WorkspaceNavigationProps) {
  const [islandOpen, setIslandOpen] = useState(false);
  const [peekSide, setPeekSide] = useState<'left' | 'right' | null>(null);
  const controller = useRef<ReturnType<
    typeof createHoverIntentController
  > | null>(null);
  const panels = useRef({ leftExpanded: leftOpen, rightExpanded: rightOpen });
  useLayoutEffect(() => {
    panels.current = { leftExpanded: leftOpen, rightExpanded: rightOpen };
  });
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

  const closePeek = () => {
    controller.current?.clear();
    setPeekSide(null);
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
  useLayoutEffect(() => {
    controlsRef.current = { closePeek, openLeft, openRight };
    return () => {
      controlsRef.current = null;
    };
  });
  return (
    <>
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
          {connectionsEnabled && (
            <button
              type="button"
              className={sidebarView === 'connections' ? 'active' : ''}
              aria-label="Open connections"
              title="Connections"
              onClick={() => openLeft('connections')}
            >
              <Network size={18} strokeWidth={1.7} />
            </button>
          )}
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
            disabled={!canBack}
            onClick={() => moveHistory(-1)}
          >
            <ArrowLeft size={18} strokeWidth={1.7} />
          </button>
          <button
            type="button"
            aria-label="Next document"
            title="Next document"
            disabled={!canForward}
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
    </>
  );
}
