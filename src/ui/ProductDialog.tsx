import { useEffect, useRef, type ReactNode } from 'react';
import { X } from 'lucide-react';

export function ProductDialog({
  title,
  children,
  onClose,
  className = '',
  shouldRestoreFocus,
}: {
  title: string;
  children: ReactNode;
  onClose: () => void;
  className?: string;
  shouldRestoreFocus?: () => boolean;
}) {
  const panel = useRef<HTMLDivElement>(null);
  const close = useRef(onClose);
  const restore = useRef(shouldRestoreFocus);
  useEffect(() => {
    close.current = onClose;
    restore.current = shouldRestoreFocus;
  }, [onClose, shouldRestoreFocus]);
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
      if (restore.current?.() !== false) previous?.focus();
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
