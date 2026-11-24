import { useLayoutEffect, useRef, type ReactNode } from 'react';

/** Browser-owned focus trap; no document code can open or authorize this dialog. */
export function Modal({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  useLayoutEffect(() => {
    const element = dialog.current!;
    const previous = document.activeElement;
    if (typeof element.showModal === 'function') element.showModal();
    else element.open = true;
    return () => {
      if (typeof element.close === 'function') element.close();
      if (previous instanceof HTMLElement && previous.isConnected)
        previous.focus();
    };
  }, []);
  return (
    <dialog
      ref={dialog}
      className="pn-dialog"
      aria-label={title}
      onKeyDown={(event) => event.stopPropagation()}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="pn-dialog-body">
        <h2>{title}</h2>
        {children}
      </div>
    </dialog>
  );
}
