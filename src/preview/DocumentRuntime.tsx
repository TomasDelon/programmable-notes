import type { ComponentType, ReactNode } from 'react';
import type { StoredAsset } from '../assets/catalog';
import type { CorePluginSettings } from '../plugins/coreRegistry';

export interface DocumentRuntimeInput {
  files: Record<string, string>;
  entry: string;
  theme: 'light' | 'dark';
  images: readonly StoredAsset[];
  corePlugins?: CorePluginSettings;
  showComponentSource?: boolean;
  enabled: boolean;
}
export interface DocumentSourceLocation {
  file: string;
  line: number;
  offset: number;
  source: string;
}
export interface DocumentRuntimeSession {
  available: boolean;
  presentation: ReactNode | null;
  status: string;
  error: string;
  locations: readonly DocumentSourceLocation[];
  stopped: boolean;
  stop: () => void;
  rebuild: () => void;
}
export interface DocumentRuntimeProps {
  input: DocumentRuntimeInput;
  children: (session: DocumentRuntimeSession) => ReactNode;
}
const unavailable: DocumentRuntimeSession = Object.freeze({
  available: false,
  presentation: <p role="status">React preview is unavailable.</p>,
  status: 'React preview unavailable',
  error: '',
  locations: Object.freeze([]),
  stopped: true,
  stop: () => {},
  rebuild: () => {},
});

/** Trusted bootstrap dependency, never selected by authored document code. */
export function DocumentRuntime({
  renderer: Renderer,
  input,
  children,
}: DocumentRuntimeProps & {
  renderer?: ComponentType<DocumentRuntimeProps>;
}) {
  return Renderer ? (
    <Renderer input={input}>{children}</Renderer>
  ) : (
    children(unavailable)
  );
}
