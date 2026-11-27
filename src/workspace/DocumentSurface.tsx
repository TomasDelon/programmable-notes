import type { ComponentProps, Ref } from 'react';
import { SourceEditor } from '../editor/SourceEditor';
import type { DocumentRuntimeSession } from '../preview/DocumentRuntime';
import { LoaderCircle, Pause, Play } from 'lucide-react';

export interface DocumentSurfaceProps {
  /** Mount/history identity, distinct from the editor's logical syntax path. */
  documentId: string;
  mode: 'source' | 'preview';
  fullDocument: boolean;
  reactEnabled: boolean;
  editor: ComponentProps<typeof SourceEditor>;
  runtime: DocumentRuntimeSession;
  sourcePanelRef?: Ref<HTMLDivElement>;
}

/** Existing owning document panels; all editing/history/platform services stay with the caller. */
export function DocumentSurface({
  documentId,
  mode,
  fullDocument,
  reactEnabled,
  editor,
  runtime: preview,
  sourcePanelRef: sourcePanel,
}: DocumentSurfaceProps) {
  return (
    <>
      <div
        ref={sourcePanel}
        className="web-source-panel"
        hidden={mode === 'preview' && fullDocument}
      >
        <SourceEditor key={documentId} {...editor} />
      </div>
      <div className="web-preview-panel" hidden={mode !== 'preview'}>
        {reactEnabled &&
          preview.presentation &&
          fullDocument &&
          preview.presentation}
        {!preview.presentation && !preview.error && fullDocument && (
          <div className="web-preview-placeholder" role="status">
            {preview.stopped ? (
              <>
                <Pause size={20} />
                <p>Preview is paused.</p>
                <button
                  type="button"
                  className="web-button"
                  disabled={!reactEnabled || !preview.available}
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
    </>
  );
}
