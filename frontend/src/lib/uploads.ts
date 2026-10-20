import type { AttachmentKind } from '@bpi/shared';
import { apiFetch, ApiError } from './api';

export type UploadMode = 'blob' | 'local';

export type UploadSession = {
  sessionId: string;
  mode: UploadMode;
  pathPrefix: string;
  expiresAt: string;
};

export type UploadedDocument = {
  kind: AttachmentKind;
  pathname: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
};

export type SessionDocument = Omit<UploadedDocument, 'kind'>;

export type UploadSessionStatus = UploadSession & {
  status: 'open';
  documents: Partial<Record<AttachmentKind, SessionDocument>>;
};

export type AttachmentUploadState = {
  status: 'idle' | 'uploading' | 'uploaded' | 'error';
  progress?: number;
  error?: string;
};

export type AttachmentUploadStates = Partial<
  Record<AttachmentKind, AttachmentUploadState>
>;

type UploadOptions = {
  signal?: AbortSignal;
  onProgress?: (percentage: number) => void;
};

export async function createPublicUploadSession(): Promise<UploadSession> {
  return apiFetch<UploadSession>('/api/public/upload-sessions', {
    method: 'POST',
  });
}

export async function createAdminUploadSession(
  employeeId: string,
): Promise<UploadSession> {
  return apiFetch<UploadSession>(
    `/api/admin/employees/${employeeId}/upload-sessions`,
    { method: 'POST' },
  );
}

export async function fetchUploadSession(
  sessionId: string,
): Promise<UploadSessionStatus> {
  return apiFetch<UploadSessionStatus>(
    `/api/uploads/sessions/${sessionId}`,
  );
}

async function requestUploadToken(input: {
  sessionId: string;
  kind: AttachmentKind;
  pathname: string;
  size: number;
  mimeType: string;
  originalName: string;
}): Promise<string> {
  const response = await apiFetch<{ token: string }>(
    '/api/uploads/token',
    {
      method: 'POST',
      body: JSON.stringify(input),
    },
  );
  return response.token;
}

async function uploadToLocalStorage(
  session: UploadSession,
  kind: AttachmentKind,
  file: File,
  options?: UploadOptions,
): Promise<UploadedDocument> {
  const body = new FormData();
  body.append('sessionId', session.sessionId);
  body.append('kind', kind);
  body.append('file', file, file.name);

  const response = await apiFetch<{ document: UploadedDocument }>(
    '/api/uploads/local',
    {
      method: 'POST',
      body,
      signal: options?.signal,
    },
  );
  options?.onProgress?.(100);
  return response.document;
}

async function uploadToBlob(
  session: UploadSession,
  kind: AttachmentKind,
  file: File,
  options?: UploadOptions,
): Promise<UploadedDocument> {
  const extension = file.type === 'application/pdf' ? 'pdf' : 'jpg';
  const pathname = `${session.pathPrefix}/${kind}-${crypto.randomUUID()}.${extension}`;
  const token = await requestUploadToken({
    sessionId: session.sessionId,
    kind,
    pathname,
    size: file.size,
    mimeType: file.type,
    originalName: file.name,
  });

  const { put } = await import('@vercel/blob/client');
  const result = await put(pathname, file, {
    access: 'private',
    token,
    contentType: file.type,
    multipart: file.size > 4 * 1024 * 1024,
    abortSignal: options?.signal,
    onUploadProgress: ({ percentage }) => {
      options?.onProgress?.(Math.round(percentage));
    },
  });

  const response = await apiFetch<{ document: UploadedDocument }>(
    '/api/uploads/confirm',
    {
      method: 'POST',
      body: JSON.stringify({
        sessionId: session.sessionId,
        kind,
        pathname: result.pathname,
      }),
    },
  );
  return response.document;
}

export async function uploadDocument(
  session: UploadSession,
  kind: AttachmentKind,
  file: File,
  options?: UploadOptions,
): Promise<UploadedDocument> {
  if (session.mode === 'local') {
    return uploadToLocalStorage(session, kind, file, options);
  }
  return uploadToBlob(session, kind, file, options);
}

export function uploadErrorMessage(error: unknown): string {
  if (error instanceof ApiError) return error.message;
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Upload cancelled.';
  }
  if (error instanceof Error && error.message) {
    return error.message;
  }
  return 'The document could not be uploaded. Check your connection and try again.';
}
