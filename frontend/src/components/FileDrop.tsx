import {
  useEffect,
  useId,
  useRef,
  useState,
  type DragEvent,
} from 'react';
import {
  ACCEPT_ATTRIBUTE,
  MAX_FILE_SIZE_BYTES,
  MAX_FILE_SIZE_MB,
} from '@bpi/shared';
import {
  AlertCircle,
  CheckCircle2,
  ExternalLink,
  FileText,
  Image,
  RefreshCw,
  Trash2,
  UploadCloud,
} from 'lucide-react';
import { assetUrl } from '../lib/api';
import { formatFileSize } from '../lib/format';

export type ExistingAttachment = {
  originalName: string;
  mimeType: string;
  size: number;
  viewUrl: string;
};

export type UploadedAttachmentView = {
  originalName: string;
  mimeType: string;
  size: number;
};

type FileDropProps = {
  id: string;
  name?: string;
  label: string;
  file: File | null;
  onFileChange: (file: File | null) => void;
  error?: string;
  hint?: string;
  required?: boolean;
  disabled?: boolean;
  existing?: ExistingAttachment | null;
  canRemoveExisting?: boolean;
  existingRemoved?: boolean;
  onRemoveExisting?: () => void;
  uploaded?: UploadedAttachmentView | null;
  uploadStatus?: 'uploading' | 'uploaded' | 'error';
  uploadProgress?: number;
  uploadError?: string;
  onRetryUpload?: () => void;
  dataField?: string;
};

function isAcceptedFile(file: File): boolean {
  const typeOk = file.type === 'application/pdf' || file.type === 'image/jpeg';
  const nameOk = /\.(pdf|jpe?g)$/i.test(file.name);
  return typeOk && nameOk;
}

function FileIcon({ mimeType }: { mimeType: string }) {
  return mimeType === 'application/pdf' ? (
    <FileText size={20} aria-hidden="true" />
  ) : (
    <Image size={20} aria-hidden="true" />
  );
}

function UploadStatus({
  status,
  progress = 0,
  error,
  onRetry,
}: {
  status: 'uploading' | 'uploaded' | 'error';
  progress?: number;
  error?: string;
  onRetry?: () => void;
}) {
  if (status === 'uploaded') {
    return (
      <div className="file-drop__upload file-drop__upload--success">
        <CheckCircle2 size={14} aria-hidden="true" />
        <span>Uploaded successfully</span>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="file-drop__upload file-drop__upload--error">
        <AlertCircle size={14} aria-hidden="true" />
        <span>{error ?? 'The document could not be uploaded.'}</span>
        <button
          type="button"
          className="btn btn--ghost btn--sm"
          onClick={onRetry}
        >
          <RefreshCw size={13} aria-hidden="true" />
          Retry
        </button>
      </div>
    );
  }

  return (
    <div className="file-drop__upload">
      <span>Uploading… {progress}%</span>
      <span
        className="file-drop__progress"
        role="progressbar"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={progress}
      >
        <span style={{ width: `${progress}%` }} />
      </span>
    </div>
  );
}

export function FileDrop({
  id,
  name,
  label,
  file,
  onFileChange,
  error,
  hint,
  required,
  disabled,
  existing,
  canRemoveExisting,
  existingRemoved,
  onRemoveExisting,
  uploaded,
  uploadStatus,
  uploadProgress,
  uploadError,
  onRetryUpload,
  dataField,
}: FileDropProps) {
  const generatedId = useId();
  const inputId = `${id}-${generatedId}`;
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string | undefined>();
  const [previewUrl, setPreviewUrl] = useState<string | undefined>();

  const displayedError = localError ?? error;
  const showExisting =
    Boolean(existing) && !file && !uploaded && !existingRemoved;

  useEffect(() => {
    if (!file && inputRef.current) {
      inputRef.current.value = '';
    }
  }, [file]);

  useEffect(() => {
    if (file?.type !== 'image/jpeg') {
      setPreviewUrl(undefined);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreviewUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  function acceptFile(nextFile: File | null) {
    if (!nextFile) {
      setLocalError(undefined);
      onFileChange(null);
      return;
    }
    if (!isAcceptedFile(nextFile)) {
      setLocalError('Choose a PDF or JPEG file.');
      onFileChange(null);
      return;
    }
    if (nextFile.size > MAX_FILE_SIZE_BYTES) {
      setLocalError(`The file must be ${MAX_FILE_SIZE_MB} MB or smaller.`);
      onFileChange(null);
      return;
    }
    setLocalError(undefined);
    onFileChange(nextFile);
  }

  function openFilePicker() {
    if (inputRef.current) inputRef.current.value = '';
    inputRef.current?.click();
  }

  function handleDrop(event: DragEvent<HTMLDivElement>) {
    event.preventDefault();
    setDragging(false);
    if (disabled) return;
    const dropped = event.dataTransfer.files?.[0];
    if (dropped) acceptFile(dropped);
  }

  return (
    <div className="field" data-field={dataField}>
      <div className="field__label">
        <span>{label}</span>
        {required ? (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        ) : null}
      </div>

      <div
        className="file-drop"
        onDragOver={(event) => {
          event.preventDefault();
          if (!disabled) setDragging(true);
        }}
        onDragLeave={() => setDragging(false)}
        onDrop={handleDrop}
      >
        <input
          ref={inputRef}
          id={inputId}
          name={name}
          type="file"
          accept={ACCEPT_ATTRIBUTE}
          disabled={disabled}
          style={{ display: 'none' }}
          onChange={(event) => {
            acceptFile(event.target.files?.[0] ?? null);
          }}
        />

        {file ? (
          <>
            <div className="file-drop__selected">
              {previewUrl ? (
                <img className="file-drop__preview" src={previewUrl} alt="" />
              ) : (
                <div className="file-drop__preview file-drop__icon">
                  <FileIcon mimeType={file.type} />
                </div>
              )}
              <div className="file-drop__file">
                <span className="file-drop__name">{file.name}</span>
                <span className="file-drop__size">
                  {formatFileSize(file.size)} ·{' '}
                  {uploadStatus === 'uploading'
                    ? 'uploading'
                    : uploadStatus === 'uploaded'
                      ? 'uploaded'
                      : uploadStatus === 'error'
                        ? 'upload interrupted'
                        : 'ready to upload'}
                </span>
              </div>
              <div className="file-drop__actions">
                <button
                  type="button"
                  className="btn btn--ghost btn--icon"
                  onClick={openFilePicker}
                  aria-label={`Replace ${label}`}
                  disabled={disabled}
                >
                  <UploadCloud size={16} aria-hidden="true" />
                </button>
                <button
                  type="button"
                  className="btn btn--danger-ghost btn--icon"
                  onClick={() => acceptFile(null)}
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              </div>
            </div>
            {uploadStatus ? (
              <UploadStatus
                status={uploadStatus}
                progress={uploadProgress}
                error={uploadError}
                onRetry={onRetryUpload}
              />
            ) : null}
          </>
        ) : uploaded ? (
          <div className="file-drop__selected">
            <div className="file-drop__preview file-drop__icon">
              <FileIcon mimeType={uploaded.mimeType} />
            </div>
            <div className="file-drop__file">
              <span className="file-drop__name">
                {uploaded.originalName}
              </span>
              <span className="file-drop__size">
                {formatFileSize(uploaded.size)} · uploaded
              </span>
            </div>
            <div className="file-drop__actions">
              <CheckCircle2
                className="file-drop__uploaded-mark"
                size={18}
                aria-hidden="true"
              />
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={openFilePicker}
                disabled={disabled}
                aria-label={`Replace ${label}`}
              >
                Replace
              </button>
              <button
                type="button"
                className="btn btn--danger-ghost btn--icon"
                onClick={() => acceptFile(null)}
                aria-label={`Remove ${label}`}
                disabled={disabled}
              >
                <Trash2 size={16} aria-hidden="true" />
              </button>
            </div>
          </div>
        ) : showExisting && existing ? (
          <div className="file-drop__selected">
            <div className="file-drop__preview file-drop__icon">
              <FileIcon mimeType={existing.mimeType} />
            </div>
            <div className="file-drop__file">
              <span className="file-drop__name">{existing.originalName}</span>
              <span className="file-drop__size">
                {formatFileSize(existing.size)} · already on record
              </span>
            </div>
            <div className="file-drop__actions">
              <a
                className="btn btn--ghost btn--icon"
                href={assetUrl(existing.viewUrl)}
                target="_blank"
                rel="noreferrer"
                aria-label={`View ${label}`}
              >
                <ExternalLink size={16} aria-hidden="true" />
              </a>
              <button
                type="button"
                className="btn btn--ghost btn--sm"
                onClick={openFilePicker}
                disabled={disabled}
                aria-label={`Replace ${label}`}
              >
                Replace
              </button>
              {canRemoveExisting ? (
                <button
                  type="button"
                  className="btn btn--danger-ghost btn--icon"
                  onClick={() => {
                    setLocalError(undefined);
                    onRemoveExisting?.();
                  }}
                  aria-label={`Remove ${label}`}
                  disabled={disabled}
                >
                  <Trash2 size={16} aria-hidden="true" />
                </button>
              ) : null}
            </div>
          </div>
        ) : (
          <button
            type="button"
            className="file-drop__zone"
            data-dragging={dragging}
            data-invalid={displayedError ? 'true' : undefined}
            onClick={() => inputRef.current?.click()}
            disabled={disabled}
            aria-describedby={
              displayedError
                ? `${inputId}-error`
                : hint
                  ? `${inputId}-hint`
                  : undefined
            }
          >
            <span className="file-drop__icon">
              <UploadCloud size={19} aria-hidden="true" />
            </span>
            <span className="file-drop__copy">
              <span className="file-drop__title">
                {dragging ? 'Drop the document here' : 'Choose a file'}
              </span>
              <span className="file-drop__meta">
                PDF or JPEG · up to {MAX_FILE_SIZE_MB} MB
              </span>
            </span>
          </button>
        )}
      </div>

      {displayedError ? (
        <div className="field__error" id={`${inputId}-error`}>
          <AlertCircle size={13} aria-hidden="true" />
          <span>{displayedError}</span>
        </div>
      ) : hint ? (
        <div className="field__hint" id={`${inputId}-hint`}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}
