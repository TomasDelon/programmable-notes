import { useEffect, useRef } from 'react';
import { Download, FileText, Paperclip } from 'lucide-react';
import {
  assetBlob,
  type AssetCatalog,
  type StoredAsset,
} from '../assets/catalog';

function AttachmentImage({ asset }: { asset: StoredAsset }) {
  const element = useRef<HTMLImageElement>(null);
  useEffect(() => {
    const image = element.current;
    if (!image) return;
    const url = URL.createObjectURL(assetBlob(asset));
    image.src = url;
    return () => {
      image.removeAttribute('src');
      URL.revokeObjectURL(url);
    };
  }, [asset]);
  return (
    <img
      ref={element}
      alt={asset.name}
      width={asset.width}
      height={asset.height}
      loading="lazy"
    />
  );
}

/** Original attachment bytes never grant executable MDX access to host storage. */
export function AttachmentGallery({
  ids,
  assets,
  onAdd,
  onDownload,
  disabled,
}: {
  ids: readonly string[];
  assets: AssetCatalog | undefined;
  onAdd: () => void;
  onDownload: (id: string) => void;
  disabled: boolean;
}) {
  return (
    <section className="web-attachment-section" aria-label="Note attachments">
      <div className="web-attachment-heading">
        <h2>Attachments{ids.length ? ` (${ids.length})` : ''}</h2>
        <button
          type="button"
          className="web-text-button"
          disabled={disabled}
          onClick={onAdd}
        >
          <Paperclip size={14} /> Add image or PDF
        </button>
      </div>
      {!!ids.length && (
        <div className="web-attachment-grid">
          {ids.map((id) => {
            const asset = assets?.[id];
            return (
              <figure key={id} className="web-attachment-card">
                {!asset ? (
                  <p role="status">
                    Attachment missing. Restore a complete backup to recover
                    this file.
                  </p>
                ) : (
                  <>
                    {asset.mime === 'application/pdf' ? (
                      <p>
                        <FileText size={24} /> PDF attachment
                      </p>
                    ) : (
                      <AttachmentImage asset={asset} />
                    )}
                    <figcaption>
                      <span>
                        {asset.name}
                        <small>
                          {' '}
                          · {Math.max(
                            1,
                            Math.round(asset.byteLength / 1024),
                          )}{' '}
                          KB
                        </small>
                      </span>
                      <button
                        type="button"
                        className="icon-button"
                        aria-label={`Download ${asset.name}`}
                        onClick={() => onDownload(id)}
                      >
                        <Download size={16} />
                      </button>
                    </figcaption>
                  </>
                )}
              </figure>
            );
          })}
        </div>
      )}
    </section>
  );
}
