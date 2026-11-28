import type { ComponentType, DragEventHandler } from 'react';

export interface DocumentNavigationRowProps {
  title: string;
  selected: boolean;
  depth?: number;
  icon: ComponentType<{ size: number; strokeWidth: number }>;
  extraClass?: string;
  onOpen: () => void;
  draggable?: boolean;
  onDragStart?: DragEventHandler<HTMLButtonElement>;
  onDragEnd?: DragEventHandler<HTMLButtonElement>;
  onDragOver?: DragEventHandler<HTMLButtonElement>;
  onDrop?: DragEventHandler<HTMLButtonElement>;
  onDragLeave?: DragEventHandler<HTMLButtonElement>;
}

/** Presentation only: the host admits navigation and owns every drag operation. */
export function DocumentNavigationRow({
  title,
  selected,
  depth = 0,
  icon: Icon,
  extraClass = '',
  onOpen,
  draggable = false,
  onDragStart,
  onDragEnd,
  onDragOver,
  onDrop,
  onDragLeave,
}: DocumentNavigationRowProps) {
  return (
    <button
      type="button"
      className={'nav-file ' + (selected ? 'selected' : '') + extraClass}
      draggable={draggable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDragOver={onDragOver}
      onDrop={onDrop}
      onDragLeave={onDragLeave}
      style={{
        /* Exactly one indentation level belongs outside each row.
           The inner icon padding is fixed to match sibling folders. */
        marginLeft: depth * 16,
        paddingLeft: 7,
        width: 'calc(100% - ' + depth * 16 + 'px)',
      }}
      onClick={onOpen}
      title={title}
      aria-label={'Open ' + title}
      aria-current={selected ? 'page' : undefined}
    >
      <Icon size={14} strokeWidth={1.65} />
      <span>{title}</span>
    </button>
  );
}
