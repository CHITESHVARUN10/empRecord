import { Router } from "express";
import rateLimit from "express-rate-limit";
import { z } from "zod";
import { duplicateCheckSchema } from '#shared';
import { parseEmployeeData } from "../middleware/upload.js";
import { EmployeeModel } from "../models/Employee.js";
import {
  createEmployee,
  findDuplicateConflicts
} from "../services/employee.service.js";
import {
  assertUploadSessionOpen,
  cleanupUploadSessions,
  createPublicUploadSession,
  finalizeUploadSession,
  getUploadSessionById,
  resolveSessionAttachments
} from "../services/upload-session.service.js";
import { HttpError } from "../utils/http-error.js";
const duplicateLimiter = rateLimit({
  windowMs: 60 * 1e3,
  limit: 120,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Too many duplicate checks. Wait a moment and try again."
      }
    });
  }
});
const submitLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  limit: 100,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Too many submissions from this network. Wait a few minutes and try again."
      }
    });
  }
});
const sessionLimiter = rateLimit({
  windowMs: 60 * 60 * 1e3,
  limit: 200,
  standardHeaders: true,
  legacyHeaders: false,
  handler: (_request, response) => {
    response.status(429).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Too many upload sessions. Wait a moment and try again."
      }
    });
  }
});
const attachmentPathsSchema = z.object({
  aadhaar: z.string().min(1).max(1024),
  pan: z.string().min(1).max(1024),
  passport: z.string().min(1).max(1024).optional()
}).strict();
const submitBodySchema = z.object({
  data: z.unknown(),
  uploadSessionId: z.string().uuid(),
  attachments: attachmentPathsSchema
}).strict();
function parseBody(schema, value) {
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
      "Please check the request.",
      { fields }
    );
  }
  return result.data;
}
const publicRoutes = Router();
publicRoutes.post(
  "/duplicates/check",
  duplicateLimiter,
  async (request, response) => {
    const result = duplicateCheckSchema.safeParse(request.body);
    if (!result.success) {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "Check at least one identifier."
      );
    }
    const conflicts = await findDuplicateConflicts(result.data);
    response.json({ conflicts });
  }
);
publicRoutes.post(
  "/upload-sessions",
  sessionLimiter,
  async (_request, response) => {
    const session = await createPublicUploadSession();
    void cleanupUploadSessions(3).catch(() => void 0);
    response.status(201).json(session);
  }
);
publicRoutes.post(
  "/employees",
  submitLimiter,
  async (request, response) => {
    const body = parseBody(submitBodySchema, request.body);
    const data = parseEmployeeData(body.data);
    const session = await getUploadSessionById(body.uploadSessionId);
    if (session.purpose !== "create") {
      throw new HttpError(
        400,
        "VALIDATION_ERROR",
        "This upload session cannot be used for a new employee record."
      );
    }
    const existing = await EmployeeModel.findById(session.employeeId);
    if (existing) {
      await finalizeUploadSession(
        session,
        Object.values(body.attachments)
      ).catch((error) => {
        console.warn(
          "Could not finalize upload session after idempotent submit:",
          error instanceof Error ? error.message : error
        );
      });
      response.status(201).json({
        employee: {
          id: String(existing._id),
          employeeCode: existing.employeeCode,
          createdAt: existing.createdAt
        }
      });
      return;
    }
    assertUploadSessionOpen(session);
    const attachments = resolveSessionAttachments(session, body.attachments, {
      requireAadhaar: true,
      requirePan: true
    });
    const { employee } = await createEmployee({
      employeeId: session.employeeId,
      input: data,
      attachments
    });
    await finalizeUploadSession(
      session,
      Object.values(attachments).map((attachment) => attachment.pathname)
    ).catch((error) => {
      console.warn(
        "Could not finalize upload session:",
        error instanceof Error ? error.message : error
      );
    });
    response.status(201).json({
      employee: {
        id: String(employee._id),
        employeeCode: employee.employeeCode,
        createdAt: employee.createdAt
      }
    });
  }
);
export {
  publicRoutes
};
