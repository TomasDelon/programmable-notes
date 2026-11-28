import { createContext, useContext } from 'react';
export interface Notice {
  id: string;
  message: string;
  tone?: 'info' | 'success' | 'error';
  detail?: string;
  persistent?: boolean;
  dismissible?: boolean;
  duration?: number;
  actions?: { label: string; run: () => void }[];
}
export const NotificationContext = createContext<{
  notify: (notice: Notice) => void;
  dismiss: (id: string) => void;
} | null>(null);
export function useNotifications() {
  const value = useContext(NotificationContext);
  if (!value) throw Error('Notifications require their editor-owned provider');
  return value;
}
