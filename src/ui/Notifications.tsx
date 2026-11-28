import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import { AlertCircle, Check, Info, X } from 'lucide-react';
import { Modal } from './Modal';
import './notifications.css';

import { NotificationContext, type Notice } from './useNotifications';
function Item({
  notice,
  dismiss,
  details,
  inspecting,
}: {
  notice: Notice;
  dismiss: (id: string) => void;
  details: (notice: Notice) => void;
  inspecting: boolean;
}) {
  const [closingFor, setClosingFor] = useState<Notice | null>(null);
  const leaving = closingFor === notice;
  const [hovered, setHovered] = useState(false);
  const [focused, setFocused] = useState(false);
  const paused = hovered || focused || inspecting;
  useEffect(() => {
    if (notice.persistent || paused || leaving) return;
    const timer = setTimeout(
      () => setClosingFor(notice),
      notice.duration ?? 4500,
    );
    return () => clearTimeout(timer);
  }, [notice, paused, leaving]);
  useEffect(() => {
    if (!leaving) return;
    const timer = setTimeout(() => dismiss(notice.id), 160);
    return () => clearTimeout(timer);
  }, [leaving, dismiss, notice.id]);
  const Icon =
    notice.tone === 'error'
      ? AlertCircle
      : notice.tone === 'success'
        ? Check
        : Info;
  return (
    <div
      id={notice.id}
      data-notification-id={notice.id}
      className="pn-notice"
      data-tone={notice.tone ?? 'info'}
      data-leaving={leaving ? 'true' : 'false'}
      role={notice.tone === 'error' ? 'alert' : 'status'}
      aria-atomic="true"
      onPointerEnter={() => setHovered(true)}
      onPointerLeave={() => setHovered(false)}
      onFocus={() => setFocused(true)}
      onBlur={(event) => {
        if (!event.currentTarget.contains(event.relatedTarget))
          setFocused(false);
      }}
    >
      <Icon size={16} aria-hidden="true" />
      <div className="pn-notice-content">
        <p>{notice.message}</p>
        {(notice.detail || notice.actions?.length) && (
          <div className="pn-notice-actions">
            {notice.actions?.map((action) => (
              <button
                key={action.label}
                type="button"
                onMouseDown={(event) => event.preventDefault()}
                onClick={action.run}
              >
                {action.label}
              </button>
            ))}
            {notice.detail && (
              <button type="button" onClick={() => details(notice)}>
                Details
              </button>
            )}
          </div>
        )}
      </div>
      {notice.dismissible !== false && (
        <button
          className="pn-notice-dismiss"
          type="button"
          aria-label="Dismiss notification"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => setClosingFor(notice)}
        >
          <X size={14} />
        </button>
      )}
    </div>
  );
}
export function NotificationProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<Notice[]>([]);
  const [detail, setDetail] = useState<Notice | null>(null);
  const notify = useCallback((notice: Notice) => {
    setItems((previous) => {
      const index = previous.findIndex((item) => item.id === notice.id);
      if (index >= 0)
        return previous.map((item, i) => (i === index ? notice : item));
      // Keep important persistent feedback; bound routine transient messages.
      const transient = previous.filter((item) => !item.persistent);
      const oldest = transient.length >= 3 ? transient[0]!.id : null;
      return [...previous.filter((item) => item.id !== oldest), notice];
    });
  }, []);
  const dismiss = useCallback(
    (id: string) =>
      setItems((previous) =>
        previous.some((item) => item.id === id)
          ? previous.filter((item) => item.id !== id)
          : previous,
      ),
    [],
  );
  const api = useMemo(() => ({ notify, dismiss }), [notify, dismiss]);
  return (
    <NotificationContext.Provider value={api}>
      {children}
      {createPortal(
        <>
          <section className="pn-notifications" aria-label="Notifications">
            {items.map((notice) => (
              <Item
                key={notice.id}
                notice={notice}
                dismiss={dismiss}
                details={setDetail}
                inspecting={detail?.id === notice.id}
              />
            ))}
          </section>
          {detail && (
            <Modal title="Notification details" onClose={() => setDetail(null)}>
              <pre>{detail.detail}</pre>
              <button type="button" onClick={() => setDetail(null)}>
                Close details
              </button>
            </Modal>
          )}
        </>,
        document.body,
      )}
    </NotificationContext.Provider>
  );
}
