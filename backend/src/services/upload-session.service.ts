import { randomUUID } from 'node:crypto';
import {
  Types,
  type HydratedDocument,
  type UpdateQuery,
} from 'mongoose';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_LABELS,
  type AttachmentKind,
} from '@bpi/shared';
import { env } from '../config/env';
import { EmployeeModel, type BlobMeta } from '../models/Employee';
import {
  UploadSessionModel,
  type PendingUpload,
  type UploadDocument,
  type UploadPurpose,
  type UploadSession,
} from '../models/UploadSession';
import { detectFileType } from '../utils/file-signature';
import { HttpError } from '../utils/http-error';
import {
  generateClientUploadToken,
  inspectAttachment,
  removeAttachment,
  storeAttachment,
} from './storage.service';

const UUID_PATTERN =
  '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';

export type UploadSessionView = {
  sessionId: string;
  mode: 'blob' | 'local';
  pathPrefix: string;
  expiresAt: string;
};

export type UploadSessionDocument = HydratedDocument<UploadSession>;

export type SerializedUploadDocument = Omit<UploadDocument, 'uploadedAt'> & {
  kind: AttachmentKind;
  uploadedAt: string;
};

export type SessionDocumentsView = Partial<
  Record<AttachmentKind, Omit<SerializedUploadDocument, 'kind'>>
>;

export type UploadSessionStatusView = UploadSessionView & {
  status: 'open';
  documents: SessionDocumentsView;
};

function maxFileSize(): number {
  return env.MAX_FILE_SIZE_MB * 1024 * 1024;
}

function isAcceptedMime(
  value: string,
): value is 'application/pdf' | 'image/jpeg' {
  return value === 'application/pdf' || value === 'image/jpeg';
}

export function uploadPathPrefix(
  employeeId: Types.ObjectId | string,
): string {
  return [env.BLOB_PREFIX, String(employeeId)].filter(Boolean).join('/');
}

function sessionView(session: UploadSession): UploadSessionView {
  return {
    sessionId: session.sessionId,
    mode: session.mode,
    pathPrefix: uploadPathPrefix(session.employeeId),
    expiresAt: session.expiresAt.toISOString(),
  };
}

export function serializeUploadDocument(
  kind: AttachmentKind,
  document: UploadDocument,
): SerializedUploadDocument {
  return {
    kind,
    pathname: document.pathname,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt.toISOString(),
  };
}

function serializeDocuments(
  documents: Partial<Record<AttachmentKind, UploadDocument>>,
): SessionDocumentsView {
  const result: SessionDocumentsView = {};
  for (const kind of ATTACHMENT_KINDS) {
    const document = documents?.[kind];
    if (!document) continue;
    result[kind] = {
      pathname: document.pathname,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      uploadedAt: document.uploadedAt.toISOString(),
    };
  }
  return result;
}

function toBlobMeta(document: UploadDocument): BlobMeta {
  return {
    pathname: document.pathname,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt,
  };
}

async function createSession(
  purpose: UploadPurpose,
  employeeId: Types.ObjectId,
  adminId?: string,
): Promise<UploadSessionView> {
  const sessionId = randomUUID();
  const expiresAt = new Date(
    Date.now() + env.UPLOAD_SESSION_HOURS * 60 * 60 * 1000,
  );

  const session = await UploadSessionModel.create({
    sessionId,
    purpose,
    status: 'open',
    employeeId,
    adminId,
    mode: env.STORAGE_DRIVER,
    documents: {},
    pending: {},
    cleanupPathnames: [],
    expiresAt,
  });

  return sessionView(session);
}

export async function createPublicUploadSession(): Promise<UploadSessionView> {
  return createSession('create', new Types.ObjectId());
}

export async function createEditUploadSession(
  employeeId: string,
  adminId: string,
): Promise<UploadSessionView> {
  return createSession('edit', new Types.ObjectId(employeeId), adminId);
}

export async function getUploadSessionById(
  sessionId: string,
): Promise<UploadSessionDocument> {
  const session = await UploadSessionModel.findOne({ sessionId });
  if (!session) {
    throw new HttpError(404, 'NOT_FOUND', 'Upload session not found.');
  }
  return session;
}

function assertSessionAccess(
  session: UploadSession,
  adminId?: string,
): void {
  if (session.purpose !== 'edit') return;
  if (!adminId) {
    throw new HttpError(401, 'UNAUTHORIZED', 'Sign in to continue.');
  }
  if (session.adminId !== adminId) {
    throw new HttpError(
      403,
      'FORBIDDEN',
      'This upload session belongs to another administrator.',
    );
  }
}

function isExpired(session: UploadSession): boolean {
  return session.expiresAt.getTime() <= Date.now();
}

export function assertUploadSessionOpen(session: UploadSession): void {
  assertSessionOpen(session);
}

export function assertUploadSessionAccess(
  session: UploadSession,
  adminId?: string,
): void {
  assertSessionAccess(session, adminId);
}

function assertSessionOpen(session: UploadSession): void {
  if (session.status === 'consumed') {
    throw new HttpError(
      410,
      'UPLOAD_SESSION_EXPIRED',
      'This upload session has already been submitted.',
    );
  }
  if (session.status === 'expired' || isExpired(session)) {
    throw new HttpError(
      410,
      'UPLOAD_SESSION_EXPIRED',
      'The document upload session has expired. Please re-upload the documents.',
    );
  }
}

function assertUploadPathname(
  session: UploadSession,
  kind: AttachmentKind,
  pathname: string,
  mimeType: string,
  size: number,
): void {
  if (!isAcceptedMime(mimeType)) {
    throw new HttpError(
      400,
      'INVALID_FILE_TYPE',
      'Documents must be PDF or JPEG files.',
    );
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'The selected file is empty or invalid.',
    );
  }
  if (size > maxFileSize()) {
    throw new HttpError(
      413,
      'FILE_TOO_LARGE',
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`,
    );
  }

  const prefix = `${uploadPathPrefix(session.employeeId)}/`;
  if (!pathname.startsWith(prefix)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'The document upload path is invalid.',
    );
  }

  const relative = pathname.slice(prefix.length);
  const extension = mimeType === 'application/pdf' ? 'pdf' : 'jpg';
  const pattern = new RegExp(
    `^${kind}-${UUID_PATTERN}\\.${extension}$`,
  );
  if (!pattern.test(relative)) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'The document upload path is invalid.',
    );
  }
}

function cleanOriginalName(
  originalName: string,
  kind: AttachmentKind,
  mimeType: string,
): string {
  const fallback = `${ATTACHMENT_LABELS[kind]}.${
    mimeType === 'application/pdf' ? 'pdf' : 'jpg'
  }`;
  const cleaned = originalName
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .trim()
    .slice(0, 255);
  return cleaned || fallback;
}

export type RegisterPendingInput = {
  sessionId: string;
  kind: AttachmentKind;
  pathname: string;
  size: number;
  mimeType: string;
  originalName: string;
  adminId?: string;
};

export async function registerPendingUpload(
  input: RegisterPendingInput,
): Promise<PendingUpload> {
  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);
  assertUploadPathname(
    session,
    input.kind,
    input.pathname,
    input.mimeType,
    input.size,
  );

  const pending: PendingUpload = {
    pathname: input.pathname,
    originalName: cleanOriginalName(
      input.originalName,
      input.kind,
      input.mimeType,
    ),
    declaredMimeType: input.mimeType,
    declaredSize: input.size,
    createdAt: new Date(),
  };

  const previousPending = session.pending?.[input.kind]?.pathname;
  const update: UpdateQuery<UploadSession> = {
    $set: { [`pending.${input.kind}`]: pending },
  };
  if (previousPending && previousPending !== input.pathname) {
    update.$addToSet = { cleanupPathnames: previousPending };
  }

  const updated = await UploadSessionModel.findOneAndUpdate(
    {
      sessionId: session.sessionId,
      status: 'open',
      expiresAt: { $gt: new Date() },
    },
    update,
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw new HttpError(
      410,
      'UPLOAD_SESSION_EXPIRED',
      'The document upload session has expired. Please re-upload the documents.',
    );
  }

  return pending;
}

async function clearPending(
  sessionId: string,
  kind: AttachmentKind,
  pathname: string,
): Promise<void> {
  try {
    await UploadSessionModel.updateOne(
      { sessionId, [`pending.${kind}.pathname`]: pathname },
      { $unset: { [`pending.${kind}`]: 1 } },
    );
  } catch {
    // The pending entry will be cleaned up with the session.
  }
}

export async function issueUploadToken(
  input: RegisterPendingInput,
): Promise<string> {
  await registerPendingUpload(input);
  try {
    return await generateClientUploadToken(input.pathname);
  } catch (error) {
    await clearPending(input.sessionId, input.kind, input.pathname);
    throw error;
  }
}

async function rejectPendingUpload(
  session: UploadSessionDocument,
  kind: AttachmentKind,
  pathname: string,
  message: string,
): Promise<never> {
  await UploadSessionModel.updateOne(
    { sessionId: session.sessionId, [`pending.${kind}.pathname`]: pathname },
    {
      $unset: { [`pending.${kind}`]: 1 },
      $addToSet: { cleanupPathnames: pathname },
    },
  ).catch(() => undefined);
  await removeAttachment(pathname);
  throw new HttpError(400, 'UPLOAD_FAILED', message);
}

export async function confirmPendingUpload(input: {
  sessionId: string;
  kind: AttachmentKind;
  pathname: string;
  adminId?: string;
}): Promise<SerializedUploadDocument> {
  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);

  const pending = session.pending?.[input.kind];
  if (!pending || pending.pathname !== input.pathname) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'This document upload was not authorized. Please try again.',
    );
  }

  const inspection = await inspectAttachment(input.pathname);
  if (!inspection) {
    throw new HttpError(
      400,
      'UPLOAD_FAILED',
      'The file upload has not completed. Please try again.',
    );
  }

  const detected = detectFileType(inspection.head);
  if (!detected) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      'Documents must be PDF or JPEG files.',
    );
  }
  if (detected.mimeType !== pending.declaredMimeType) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      'The uploaded file type does not match the selected document.',
    );
  }
  if (inspection.size <= 0 || inspection.size > maxFileSize()) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`,
    );
  }

  const document: UploadDocument = {
    pathname: input.pathname,
    originalName: pending.originalName,
    mimeType: detected.mimeType,
    size: inspection.size,
    uploadedAt: new Date(),
  };
  const previous = session.documents?.[input.kind]?.pathname;
  const update: UpdateQuery<UploadSession> = {
    $set: { [`documents.${input.kind}`]: document },
    $unset: { [`pending.${input.kind}`]: 1 },
  };
  if (previous && previous !== input.pathname) {
    update.$addToSet = { cleanupPathnames: previous };
  }

  const updated = await UploadSessionModel.findOneAndUpdate(
    {
      sessionId: input.sessionId,
      status: 'open',
      expiresAt: { $gt: new Date() },
      [`pending.${input.kind}.pathname`]: input.pathname,
    },
    update,
    { returnDocument: 'after' },
  );
  if (!updated) {
    throw new HttpError(
      400,
      'UPLOAD_FAILED',
      'This document upload is no longer pending. Please upload it again.',
    );
  }

  return serializeUploadDocument(input.kind, document);
}

export async function getUploadSessionStatus(
  sessionId: string,
  adminId?: string,
): Promise<UploadSessionStatusView> {
  const session = await getUploadSessionById(sessionId);
  assertSessionAccess(session, adminId);
  assertSessionOpen(session);

  return {
    ...sessionView(session),
    status: 'open',
    documents: serializeDocuments(session.documents),
  };
}

export function resolveSessionAttachments(
  session: UploadSession,
  requested: Partial<Record<AttachmentKind, string>>,
  options: {
    requireAadhaar?: boolean;
    requirePan?: boolean;
  } = {},
): Partial<Record<AttachmentKind, BlobMeta>> {
  const resolved: Partial<Record<AttachmentKind, BlobMeta>> = {};

  for (const kind of ATTACHMENT_KINDS) {
    const pathname = requested[kind];
    if (!pathname) continue;
    const document = session.documents?.[kind];
    if (!document || document.pathname !== pathname) {
      throw new HttpError(
        400,
        'VALIDATION_ERROR',
        `The ${ATTACHMENT_LABELS[kind]} upload is not confirmed. Re-upload the document and try again.`,
        {
          fields: {
            [`attachments.${kind}`]: `${ATTACHMENT_LABELS[kind]} upload is not confirmed`,
          },
        },
      );
    }
    resolved[kind] = toBlobMeta(document);
  }

  if (options.requireAadhaar && !resolved.aadhaar) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Attach the Aadhaar document (PDF or JPEG).',
      {
        fields: {
          'attachments.aadhaar': 'Aadhaar attachment is required',
        },
      },
    );
  }
  if (options.requirePan && !resolved.pan) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Attach the PAN document (PDF or JPEG).',
      {
        fields: { 'attachments.pan': 'PAN attachment is required' },
      },
    );
  }

  return resolved;
}

export async function storeLocalSessionAttachment(input: {
  sessionId: string;
  kind: AttachmentKind;
  adminId?: string;
  buffer: Buffer;
  originalName: string;
  detected: { mimeType: string; extension: string };
  size: number;
}): Promise<SerializedUploadDocument> {
  if (env.STORAGE_DRIVER !== 'local') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Local uploads are disabled.',
    );
  }

  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);
  if (session.mode !== 'local') {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'This upload session does not use local storage.',
    );
  }
  if (!isAcceptedMime(input.detected.mimeType)) {
    throw new HttpError(
      400,
      'INVALID_FILE_TYPE',
      'Documents must be PDF or JPEG files.',
    );
  }
  if (
    !Number.isInteger(input.size) ||
    input.size <= 0 ||
    input.size > maxFileSize()
  ) {
    throw new HttpError(
      413,
      'FILE_TOO_LARGE',
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`,
    );
  }

  const meta = await storeAttachment({
    buffer: input.buffer,
    originalName: cleanOriginalName(
      input.originalName,
      input.kind,
      input.detected.mimeType,
    ),
    employeeId: String(session.employeeId),
    kind: input.kind,
    detected: input.detected as {
      mimeType: 'application/pdf' | 'image/jpeg';
      extension: 'pdf' | 'jpg';
    },
  });

  const previous = session.documents?.[input.kind]?.pathname;
  const update: UpdateQuery<UploadSession> = {
    $set: { [`documents.${input.kind}`]: meta },
    $unset: { [`pending.${input.kind}`]: 1 },
  };
  if (previous && previous !== meta.pathname) {
    update.$addToSet = { cleanupPathnames: previous };
  }

  try {
    const updated = await UploadSessionModel.findOneAndUpdate(
      {
        sessionId: input.sessionId,
        status: 'open',
        expiresAt: { $gt: new Date() },
      },
      update,
      { returnDocument: 'after' },
    );
    if (!updated) {
      throw new HttpError(
        410,
        'UPLOAD_SESSION_EXPIRED',
        'The document upload session has expired. Please re-upload the documents.',
      );
    }
  } catch (error) {
    await removeAttachment(meta.pathname);
    throw error;
  }

  return serializeUploadDocument(input.kind, meta);
}

function collectSessionPathnames(session: UploadSession): string[] {
  const pathnames = new Set<string>();
  for (const kind of ATTACHMENT_KINDS) {
    const document = session.documents?.[kind];
    if (document?.pathname) pathnames.add(document.pathname);
    const pending = session.pending?.[kind];
    if (pending?.pathname) pathnames.add(pending.pathname);
  }
  for (const pathname of session.cleanupPathnames) {
    if (pathname) pathnames.add(pathname);
  }
  return [...pathnames];
}

async function isPathLinkedToEmployee(pathname: string): Promise<boolean> {
  const employee = await EmployeeModel.exists({
    $or: [
      { 'attachments.aadhaar.pathname': pathname },
      { 'attachments.pan.pathname': pathname },
      { 'attachments.passport.pathname': pathname },
    ],
  });
  return Boolean(employee);
}

export async function finalizeUploadSession(
  session: UploadSessionDocument,
  linkedPathnames: string[],
): Promise<void> {
  const linked = new Set(linkedPathnames);
  const failures = new Set<string>();

  await Promise.all(
    collectSessionPathnames(session).map(async (pathname) => {
      if (linked.has(pathname)) return;
      if (await isPathLinkedToEmployee(pathname)) return;
      if (!(await removeAttachment(pathname))) failures.add(pathname);
    }),
  );

  session.status = 'consumed';
  session.set('documents', {});
  session.set('pending', {});
  session.cleanupPathnames = [...failures];
  session.consumedAt = new Date();
  session.markModified('documents');
  session.markModified('pending');
  await session.save();
}

export async function deleteUploadSessionsForEmployee(
  employeeId: string,
): Promise<number> {
  const sessions = await UploadSessionModel.find({
    employeeId: new Types.ObjectId(employeeId),
  });
  let deleted = 0;

  for (const session of sessions) {
    for (const pathname of collectSessionPathnames(session)) {
      await removeAttachment(pathname);
    }
    await session.deleteOne();
    deleted += 1;
  }

  return deleted;
}

export async function cleanupUploadSessions(
  limit = 20,
): Promise<{ processed: number; deleted: number }> {
  const now = new Date();
  const sessions = await UploadSessionModel.find({
    $or: [
      { status: 'open', expiresAt: { $lt: now } },
      {
        status: { $in: ['expired', 'consumed'] },
        'cleanupPathnames.0': { $exists: true },
      },
      {
        status: 'consumed',
        consumedAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1000) },
      },
    ],
  }).limit(limit);

  let deleted = 0;

  for (const session of sessions) {
    const failures = new Set<string>();
    for (const pathname of collectSessionPathnames(session)) {
      if (await isPathLinkedToEmployee(pathname)) continue;
      if (!(await removeAttachment(pathname))) failures.add(pathname);
    }

    if (failures.size > 0) {
      if (session.status === 'open') session.status = 'expired';
      session.set('documents', {});
      session.set('pending', {});
      session.cleanupPathnames = [...failures];
      session.markModified('documents');
      session.markModified('pending');
      await session.save();
    } else {
      await session.deleteOne();
      deleted += 1;
    }
  }

  return { processed: sessions.length, deleted };
}
