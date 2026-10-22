import { useState } from 'react';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_LABELS,
  type AttachmentKind,
} from '@bpi/shared';
import {
  Download,
  ExternalLink,
  Eye,
  FileText,
} from 'lucide-react';
import { Dialog } from '../../components/Dialog';
import { assetUrl } from '../../lib/api';
import { formatDateOnly, formatFileSize } from '../../lib/format';
import type { AttachmentInfo } from './types';

type AttachmentPanelProps = {
  attachments: Record<AttachmentKind, AttachmentInfo | null>;
};

export function AttachmentPanel({ attachments }: AttachmentPanelProps) {
  const [previewKind, setPreviewKind] = useState<AttachmentKind | null>(null);
  const preview = previewKind ? attachments[previewKind] : null;
  const previewLabel = previewKind ? ATTACHMENT_LABELS[previewKind] : '';

  return (
    <section
      className="detail-panel documents-panel"
      aria-labelledby="documents-heading"
    >
      <div className="detail-panel__head">
        <div>
          <h2 id="documents-heading">Documents</h2>
          <p>Private to HR administrators.</p>
        </div>
      </div>

      <div className="attachment-list">
        {ATTACHMENT_KINDS.map((kind) => {
          const attachment = attachments[kind];
          const label = ATTACHMENT_LABELS[kind];
          return (
            <div className="attachment-item" key={kind}>
              {attachment && attachment.mimeType === 'image/jpeg' ? (
                <img
                  className="attachment-item__thumb"
                  src={assetUrl(attachment.viewUrl)}
                  alt=""
                  loading="lazy"
                />
              ) : (
                <span className="attachment-item__thumb attachment-item__thumb--file">
                  <FileText size={20} aria-hidden="true" />
                </span>
              )}

              <div className="attachment-item__copy">
                <strong>{label}</strong>
                {attachment ? (
                  <>
                    <span>{attachment.originalName}</span>
                    <span>
                      {formatFileSize(attachment.size)} ·{' '}
                      {formatDateOnly(attachment.uploadedAt.slice(0, 10))}
                    </span>
                  </>
                ) : (
                  <span>Not uploaded</span>
                )}
              </div>

              {attachment ? (
                <div className="attachment-item__actions">
                  <button
                    type="button"
                    className="btn btn--ghost btn--icon"
                    onClick={() => setPreviewKind(kind)}
                    aria-label={`View ${label} document`}
                  >
                    <Eye size={16} aria-hidden="true" />
                  </button>
                  <a
                    className="btn btn--ghost btn--icon"
                    href={`${assetUrl(attachment.viewUrl)}?download=1`}
                    aria-label={`Download ${label} document`}
                  >
                    <Download size={16} aria-hidden="true" />
                  </a>
                </div>
              ) : (
                <span className="badge badge--neutral">Missing</span>
              )}
            </div>
          );
        })}
      </div>

      <Dialog
        open={Boolean(previewKind && preview)}
        onClose={() => setPreviewKind(null)}
        title={`${previewLabel} document`}
        footer={
          preview ? (
            <>
              <a
                className="btn btn--secondary"
                href={assetUrl(preview.viewUrl)}
                target="_blank"
                rel="noreferrer"
              >
                <ExternalLink size={15} aria-hidden="true" />
                Open in new tab
              </a>
              <a
                className="btn btn--primary"
                href={`${assetUrl(preview.viewUrl)}?download=1`}
              >
                <Download size={15} aria-hidden="true" />
                Download
              </a>
            </>
          ) : null
        }
      >
        {preview ? (
          preview.mimeType === 'application/pdf' ? (
            <iframe
              className="attachment-frame"
              title={`${previewLabel} PDF`}
              src={assetUrl(preview.viewUrl)}
            />
          ) : (
            <img
              className="attachment-image"
              src={assetUrl(preview.viewUrl)}
              alt={`${previewLabel} document`}
            />
          )
        ) : null}
      </Dialog>
    </section>
  );
}
