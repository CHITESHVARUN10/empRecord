import { randomUUID } from "node:crypto";
import {
  Types
} from "mongoose";
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_LABELS
} from '#shared';
import { env } from "../config/env.js";
import { EmployeeModel } from "../models/Employee.js";
import {
  UploadSessionModel
} from "../models/UploadSession.js";
import { detectFileType } from "../utils/file-signature.js";
import { HttpError } from "../utils/http-error.js";
import {
  generateClientUploadToken,
  inspectAttachment,
  removeAttachment,
  storeAttachment
} from "./storage.service.js";
const UUID_PATTERN = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
function maxFileSize() {
  return env.MAX_FILE_SIZE_MB * 1024 * 1024;
}
function isAcceptedMime(value) {
  return value === "application/pdf" || value === "image/jpeg";
}
function uploadPathPrefix(employeeId) {
  return [env.BLOB_PREFIX, String(employeeId)].filter(Boolean).join("/");
}
function sessionView(session) {
  return {
    sessionId: session.sessionId,
    mode: session.mode,
    pathPrefix: uploadPathPrefix(session.employeeId),
    expiresAt: session.expiresAt.toISOString()
  };
}
function serializeUploadDocument(kind, document) {
  return {
    kind,
    pathname: document.pathname,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt.toISOString()
  };
}
function serializeDocuments(documents) {
  const result = {};
  for (const kind of ATTACHMENT_KINDS) {
    const document = documents?.[kind];
    if (!document) continue;
    result[kind] = {
      pathname: document.pathname,
      originalName: document.originalName,
      mimeType: document.mimeType,
      size: document.size,
      uploadedAt: document.uploadedAt.toISOString()
    };
  }
  return result;
}
function toBlobMeta(document) {
  return {
    pathname: document.pathname,
    originalName: document.originalName,
    mimeType: document.mimeType,
    size: document.size,
    uploadedAt: document.uploadedAt
  };
}
async function createSession(purpose, employeeId, adminId) {
  const sessionId = randomUUID();
  const expiresAt = new Date(
    Date.now() + env.UPLOAD_SESSION_HOURS * 60 * 60 * 1e3
  );
  const session = await UploadSessionModel.create({
    sessionId,
    purpose,
    status: "open",
    employeeId,
    adminId,
    mode: env.STORAGE_DRIVER,
    documents: {},
    pending: {},
    cleanupPathnames: [],
    expiresAt
  });
  return sessionView(session);
}
async function createPublicUploadSession() {
  return createSession("create", new Types.ObjectId());
}
async function createEditUploadSession(employeeId, adminId) {
  return createSession("edit", new Types.ObjectId(employeeId), adminId);
}
async function getUploadSessionById(sessionId) {
  const session = await UploadSessionModel.findOne({ sessionId });
  if (!session) {
    throw new HttpError(404, "NOT_FOUND", "Upload session not found.");
  }
  return session;
}
function assertSessionAccess(session, adminId) {
  if (session.purpose !== "edit") return;
  if (!adminId) {
    throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.");
  }
  if (session.adminId !== adminId) {
    throw new HttpError(
      403,
      "FORBIDDEN",
      "This upload session belongs to another administrator."
    );
  }
}
function isExpired(session) {
  return session.expiresAt.getTime() <= Date.now();
}
function assertUploadSessionOpen(session) {
  assertSessionOpen(session);
}
function assertUploadSessionAccess(session, adminId) {
  assertSessionAccess(session, adminId);
}
function assertSessionOpen(session) {
  if (session.status === "consumed") {
    throw new HttpError(
      410,
      "UPLOAD_SESSION_EXPIRED",
      "This upload session has already been submitted."
    );
  }
  if (session.status === "expired" || isExpired(session)) {
    throw new HttpError(
      410,
      "UPLOAD_SESSION_EXPIRED",
      "The document upload session has expired. Please re-upload the documents."
    );
  }
}
function assertUploadPathname(session, kind, pathname, mimeType, size) {
  if (!isAcceptedMime(mimeType)) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      "Documents must be PDF or JPEG files."
    );
  }
  if (!Number.isInteger(size) || size <= 0) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The selected file is empty or invalid."
    );
  }
  if (size > maxFileSize()) {
    throw new HttpError(
      413,
      "FILE_TOO_LARGE",
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`
    );
  }
  const prefix = `${uploadPathPrefix(session.employeeId)}/`;
  if (!pathname.startsWith(prefix)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The document upload path is invalid."
    );
  }
  const relative = pathname.slice(prefix.length);
  const extension = mimeType === "application/pdf" ? "pdf" : "jpg";
  const pattern = new RegExp(
    `^${kind}-${UUID_PATTERN}\\.${extension}$`
  );
  if (!pattern.test(relative)) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "The document upload path is invalid."
    );
  }
}
function cleanOriginalName(originalName, kind, mimeType) {
  const fallback = `${ATTACHMENT_LABELS[kind]}.${mimeType === "application/pdf" ? "pdf" : "jpg"}`;
  const cleaned = originalName.replace(/[\u0000-\u001F\u007F]/g, "").trim().slice(0, 255);
  return cleaned || fallback;
}
async function registerPendingUpload(input) {
  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);
  assertUploadPathname(
    session,
    input.kind,
    input.pathname,
    input.mimeType,
    input.size
  );
  const pending = {
    pathname: input.pathname,
    originalName: cleanOriginalName(
      input.originalName,
      input.kind,
      input.mimeType
    ),
    declaredMimeType: input.mimeType,
    declaredSize: input.size,
    createdAt: /* @__PURE__ */ new Date()
  };
  const previousPending = session.pending?.[input.kind]?.pathname;
  const update = {
    $set: { [`pending.${input.kind}`]: pending }
  };
  if (previousPending && previousPending !== input.pathname) {
    update.$addToSet = { cleanupPathnames: previousPending };
  }
  const updated = await UploadSessionModel.findOneAndUpdate(
    {
      sessionId: session.sessionId,
      status: "open",
      expiresAt: { $gt: /* @__PURE__ */ new Date() }
    },
    update,
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new HttpError(
      410,
      "UPLOAD_SESSION_EXPIRED",
      "The document upload session has expired. Please re-upload the documents."
    );
  }
  return pending;
}
async function clearPending(sessionId, kind, pathname) {
  try {
    await UploadSessionModel.updateOne(
      { sessionId, [`pending.${kind}.pathname`]: pathname },
      { $unset: { [`pending.${kind}`]: 1 } }
    );
  } catch {
  }
}
async function issueUploadToken(input) {
  await registerPendingUpload(input);
  try {
    return await generateClientUploadToken(input.pathname);
  } catch (error) {
    await clearPending(input.sessionId, input.kind, input.pathname);
    throw error;
  }
}
async function rejectPendingUpload(session, kind, pathname, message) {
  await UploadSessionModel.updateOne(
    { sessionId: session.sessionId, [`pending.${kind}.pathname`]: pathname },
    {
      $unset: { [`pending.${kind}`]: 1 },
      $addToSet: { cleanupPathnames: pathname }
    }
  ).catch(() => void 0);
  await removeAttachment(pathname);
  throw new HttpError(400, "UPLOAD_FAILED", message);
}
async function confirmPendingUpload(input) {
  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);
  const pending = session.pending?.[input.kind];
  if (!pending || pending.pathname !== input.pathname) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "This document upload was not authorized. Please try again."
    );
  }
  const inspection = await inspectAttachment(input.pathname);
  if (!inspection) {
    throw new HttpError(
      400,
      "UPLOAD_FAILED",
      "The file upload has not completed. Please try again."
    );
  }
  const detected = detectFileType(inspection.head);
  if (!detected) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      "Documents must be PDF or JPEG files."
    );
  }
  if (detected.mimeType !== pending.declaredMimeType) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      "The uploaded file type does not match the selected document."
    );
  }
  if (inspection.size <= 0 || inspection.size > maxFileSize()) {
    return rejectPendingUpload(
      session,
      input.kind,
      input.pathname,
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`
    );
  }
  const document = {
    pathname: input.pathname,
    originalName: pending.originalName,
    mimeType: detected.mimeType,
    size: inspection.size,
    uploadedAt: /* @__PURE__ */ new Date()
  };
  const previous = session.documents?.[input.kind]?.pathname;
  const update = {
    $set: { [`documents.${input.kind}`]: document },
    $unset: { [`pending.${input.kind}`]: 1 }
  };
  if (previous && previous !== input.pathname) {
    update.$addToSet = { cleanupPathnames: previous };
  }
  const updated = await UploadSessionModel.findOneAndUpdate(
    {
      sessionId: input.sessionId,
      status: "open",
      expiresAt: { $gt: /* @__PURE__ */ new Date() },
      [`pending.${input.kind}.pathname`]: input.pathname
    },
    update,
    { returnDocument: "after" }
  );
  if (!updated) {
    throw new HttpError(
      400,
      "UPLOAD_FAILED",
      "This document upload is no longer pending. Please upload it again."
    );
  }
  return serializeUploadDocument(input.kind, document);
}
async function getUploadSessionStatus(sessionId, adminId) {
  const session = await getUploadSessionById(sessionId);
  assertSessionAccess(session, adminId);
  assertSessionOpen(session);
  return {
    ...sessionView(session),
    status: "open",
    documents: serializeDocuments(session.documents)
  };
}
function resolveSessionAttachments(session, requested, options = {}) {
  const resolved = {};
  for (const kind of ATTACHMENT_KINDS) {
    const pathname = requested[kind];
    if (!pathname) continue;
    const document = session.documents?.[kind];
    if (!document || document.pathname !== pathname) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        `The ${ATTACHMENT_LABELS[kind]} upload is not confirmed. Re-upload the document and try again.`,
        {
          fields: {
            [`attachments.${kind}`]: `${ATTACHMENT_LABELS[kind]} upload is not confirmed`
          }
        }
      );
    }
    resolved[kind] = toBlobMeta(document);
  }
  if (options.requireAadhaar && !resolved.aadhaar) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Attach the Aadhaar document (PDF or JPEG).",
      {
        fields: {
          "attachments.aadhaar": "Aadhaar attachment is required"
        }
      }
    );
  }
  if (options.requirePan && !resolved.pan) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Attach the PAN document (PDF or JPEG).",
      {
        fields: { "attachments.pan": "PAN attachment is required" }
      }
    );
  }
  return resolved;
}
async function storeLocalSessionAttachment(input) {
  if (env.STORAGE_DRIVER !== "local") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Local uploads are disabled."
    );
  }
  const session = await getUploadSessionById(input.sessionId);
  assertSessionAccess(session, input.adminId);
  assertSessionOpen(session);
  if (session.mode !== "local") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "This upload session does not use local storage."
    );
  }
  if (!isAcceptedMime(input.detected.mimeType)) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      "Documents must be PDF or JPEG files."
    );
  }
  if (!Number.isInteger(input.size) || input.size <= 0 || input.size > maxFileSize()) {
    throw new HttpError(
      413,
      "FILE_TOO_LARGE",
      `The file must be ${env.MAX_FILE_SIZE_MB} MB or smaller.`
    );
  }
  const meta = await storeAttachment({
    buffer: input.buffer,
    originalName: cleanOriginalName(
      input.originalName,
      input.kind,
      input.detected.mimeType
    ),
    employeeId: String(session.employeeId),
    kind: input.kind,
    detected: input.detected
  });
  const previous = session.documents?.[input.kind]?.pathname;
  const update = {
    $set: { [`documents.${input.kind}`]: meta },
    $unset: { [`pending.${input.kind}`]: 1 }
  };
  if (previous && previous !== meta.pathname) {
    update.$addToSet = { cleanupPathnames: previous };
  }
  try {
    const updated = await UploadSessionModel.findOneAndUpdate(
      {
        sessionId: input.sessionId,
        status: "open",
        expiresAt: { $gt: /* @__PURE__ */ new Date() }
      },
      update,
      { returnDocument: "after" }
    );
    if (!updated) {
      throw new HttpError(
        410,
        "UPLOAD_SESSION_EXPIRED",
        "The document upload session has expired. Please re-upload the documents."
      );
    }
  } catch (error) {
    await removeAttachment(meta.pathname);
    throw error;
  }
  return serializeUploadDocument(input.kind, meta);
}
function collectSessionPathnames(session) {
  const pathnames = /* @__PURE__ */ new Set();
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
async function isPathLinkedToEmployee(pathname) {
  const employee = await EmployeeModel.exists({
    $or: ATTACHMENT_KINDS.map((kind) => ({
      [`attachments.${kind}.pathname`]: pathname
    }))
  });
  return Boolean(employee);
}
async function finalizeUploadSession(session, linkedPathnames) {
  const linked = new Set(linkedPathnames);
  const failures = /* @__PURE__ */ new Set();
  await Promise.all(
    collectSessionPathnames(session).map(async (pathname) => {
      if (linked.has(pathname)) return;
      if (await isPathLinkedToEmployee(pathname)) return;
      if (!await removeAttachment(pathname)) failures.add(pathname);
    })
  );
  session.status = "consumed";
  session.set("documents", {});
  session.set("pending", {});
  session.cleanupPathnames = [...failures];
  session.consumedAt = /* @__PURE__ */ new Date();
  session.markModified("documents");
  session.markModified("pending");
  await session.save();
}
async function deleteUploadSessionsForEmployee(employeeId) {
  const sessions = await UploadSessionModel.find({
    employeeId: new Types.ObjectId(employeeId)
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
async function cleanupUploadSessions(limit = 20) {
  const now = /* @__PURE__ */ new Date();
  const sessions = await UploadSessionModel.find({
    $or: [
      { status: "open", expiresAt: { $lt: now } },
      {
        status: { $in: ["expired", "consumed"] },
        "cleanupPathnames.0": { $exists: true }
      },
      {
        status: "consumed",
        consumedAt: { $lt: new Date(now.getTime() - 24 * 60 * 60 * 1e3) }
      }
    ]
  }).limit(limit);
  let deleted = 0;
  for (const session of sessions) {
    const failures = /* @__PURE__ */ new Set();
    for (const pathname of collectSessionPathnames(session)) {
      if (await isPathLinkedToEmployee(pathname)) continue;
      if (!await removeAttachment(pathname)) failures.add(pathname);
    }
    if (failures.size > 0) {
      if (session.status === "open") session.status = "expired";
      session.set("documents", {});
      session.set("pending", {});
      session.cleanupPathnames = [...failures];
      session.markModified("documents");
      session.markModified("pending");
      await session.save();
    } else {
      await session.deleteOne();
      deleted += 1;
    }
  }
  return { processed: sessions.length, deleted };
}
export {
  assertUploadSessionAccess,
  assertUploadSessionOpen,
  cleanupUploadSessions,
  confirmPendingUpload,
  createEditUploadSession,
  createPublicUploadSession,
  deleteUploadSessionsForEmployee,
  finalizeUploadSession,
  getUploadSessionById,
  getUploadSessionStatus,
  issueUploadToken,
  registerPendingUpload,
  resolveSessionAttachments,
  serializeUploadDocument,
  storeLocalSessionAttachment,
  uploadPathPrefix
};
