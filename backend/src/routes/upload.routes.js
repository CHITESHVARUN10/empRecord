import { timingSafeEqual } from "node:crypto";
import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { ATTACHMENT_KINDS, ATTACHMENT_LABELS } from '#shared';
import { env } from "../config/env.js";
import { localUpload } from "../middleware/upload.js";
import {
  cleanupUploadSessions,
  confirmPendingUpload,
  getUploadSessionStatus,
  issueUploadToken,
  storeLocalSessionAttachment
} from "../services/upload-session.service.js";
import { validateFileSignature } from "../utils/file-signature.js";
import { HttpError } from "../utils/http-error.js";
const kindSchema = z.enum(ATTACHMENT_KINDS);
const sessionIdSchema = z.string().uuid();
const pathnameSchema = z.string().min(1).max(1024);
const maxSizeBytes = env.MAX_FILE_SIZE_MB * 1024 * 1024;
const tokenBodySchema = z.object({
  sessionId: sessionIdSchema,
  kind: kindSchema,
  pathname: pathnameSchema,
  size: z.number().int().positive().max(maxSizeBytes),
  mimeType: z.enum(["application/pdf", "image/jpeg"]),
  originalName: z.string().min(1).max(255)
}).strict();
const confirmBodySchema = z.object({
  sessionId: sessionIdSchema,
  kind: kindSchema,
  pathname: pathnameSchema
}).strict();
const sessionParamsSchema = z.object({
  sessionId: sessionIdSchema
}).strict();
const localFieldsSchema = z.object({
  sessionId: sessionIdSchema,
  kind: kindSchema
}).strict();
function parse(schema, value) {
  const result = schema.safeParse(value);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "form";
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Please check the upload request.",
      { fields }
    );
  }
  return result.data;
}
function currentAdminId(request) {
  if (!request.isAuthenticated()) return void 0;
  return request.user?._id;
}
const uploadLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  limit: 1e3,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Too many upload requests. Wait a moment and try again."
      }
    });
  }
});
const localLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Too many upload requests. Wait a moment and try again."
      }
    });
  }
});
const uploadRoutes = Router();
uploadRoutes.post("/token", uploadLimiter, async (request, response) => {
  const body = parse(tokenBodySchema, request.body);
  const token = await issueUploadToken({
    ...body,
    adminId: currentAdminId(request)
  });
  response.json({ token });
});
uploadRoutes.post("/confirm", uploadLimiter, async (request, response) => {
  const body = parse(confirmBodySchema, request.body);
  const document = await confirmPendingUpload({
    ...body,
    adminId: currentAdminId(request)
  });
  response.json({ document });
});
uploadRoutes.get(
  "/sessions/:sessionId",
  uploadLimiter,
  async (request, response) => {
    const params = parse(sessionParamsSchema, request.params);
    const status = await getUploadSessionStatus(
      params.sessionId,
      currentAdminId(request)
    );
    response.json(status);
  }
);
function requireLocalMode(_request, _response, next) {
  if (env.STORAGE_DRIVER !== "local") {
    next(new HttpError(404, "NOT_FOUND", "Not found."));
    return;
  }
  next();
}
uploadRoutes.post(
  "/local",
  requireLocalMode,
  localLimiter,
  localUpload,
  async (request, response) => {
    const body = parse(localFieldsSchema, request.body);
    const file = request.file;
    if (!file) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Choose a PDF or JPEG document."
      );
    }
    const detected = validateFileSignature(
      file.buffer,
      file.mimetype,
      `${ATTACHMENT_LABELS[body.kind]} document`
    );
    const document = await storeLocalSessionAttachment({
      sessionId: body.sessionId,
      kind: body.kind,
      adminId: currentAdminId(request),
      buffer: file.buffer,
      originalName: file.originalname,
      detected,
      size: file.size
    });
    response.json({ document });
  }
);
const internalRoutes = Router();
async function cleanupUploadsHandler(request, response) {
  if (!env.CLEANUP_SECRET) {
    throw new HttpError(404, "NOT_FOUND", "Not found.");
  }
  const authorization = request.headers.authorization ?? "";
  const expected = `Bearer ${env.CLEANUP_SECRET}`;
  const providedBuffer = Buffer.from(authorization);
  const expectedBuffer = Buffer.from(expected);
  if (providedBuffer.length !== expectedBuffer.length || !timingSafeEqual(providedBuffer, expectedBuffer)) {
    throw new HttpError(401, "UNAUTHORIZED", "Unauthorized.");
  }
  const result = await cleanupUploadSessions(50);
  response.json(result);
}
internalRoutes.post("/cleanup-uploads", cleanupUploadsHandler);
internalRoutes.get("/cleanup-uploads", cleanupUploadsHandler);
export {
  internalRoutes,
  uploadRoutes
};
