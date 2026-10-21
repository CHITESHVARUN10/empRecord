import { Router } from "express";
import { z } from "zod";
import {
  ADMIN_SORT_FIELDS,
  ATTACHMENT_KINDS,
  DEPARTMENTS,
  ORGANIZATIONS,
  VERIFICATION_STATUSES
} from '#shared';
import { env } from "../config/env.js";
import { EmployeeModel } from "../models/Employee.js";
import { requireAdmin } from "../middleware/requireAdmin.js";
import { parseEmployeeData } from "../middleware/upload.js";
import {
  attachmentMetaFor,
  buildEmployeeSearchFilter,
  deleteEmployee,
  updateEmployee,
  updateEmployeeVerification
} from "../services/employee.service.js";
import { buildEmployeeCsv } from "../services/csv.service.js";
import {
  getDriveSyncJob,
  getLatestDriveSyncJob,
  startDriveSyncJob
} from "../services/google-drive.service.js";
import { openAttachment } from "../services/storage.service.js";
import {
  assertUploadSessionAccess,
  assertUploadSessionOpen,
  createEditUploadSession,
  finalizeUploadSession,
  getUploadSessionById,
  resolveSessionAttachments
} from "../services/upload-session.service.js";
import { HttpError } from "../utils/http-error.js";
import {
  serializeEmployeeDetail,
  serializeEmployeeSummary
} from "../utils/serialize.js";
const listQuerySchema = z.object({
  search: z.string().max(80).trim().optional().default(""),
  department: z.enum(DEPARTMENTS).optional(),
  organization: z.enum(ORGANIZATIONS).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(20),
  sort: z.enum(ADMIN_SORT_FIELDS).default("createdAt"),
  order: z.enum(["asc", "desc"]).default("desc")
});
const exportQuerySchema = z.object({
  search: z.string().max(80).trim().optional().default(""),
  department: z.enum(DEPARTMENTS).optional(),
  organization: z.enum(ORGANIZATIONS).optional(),
  verificationStatus: z.enum(VERIFICATION_STATUSES).optional()
});
const idSchema = z.string().regex(/^[a-fA-F0-9]{24}$/);
const kindSchema = z.enum(ATTACHMENT_KINDS);
const updateAttachmentPathsSchema = z.object({
  aadhaar: z.string().min(1).max(1024).optional(),
  pan: z.string().min(1).max(1024).optional(),
  passport: z.string().min(1).max(1024).optional()
}).strict();
const updateBodySchema = z.object({
  data: z.unknown(),
  uploadSessionId: z.string().uuid().optional(),
  attachments: updateAttachmentPathsSchema.optional(),
  removePassport: z.boolean().optional().default(false)
}).strict().refine(
  (value) => Boolean(value.uploadSessionId) === Boolean(value.attachments),
  {
    message: "Provide both the upload session and its attachments.",
    path: ["attachments"]
  }
);
const deleteBodySchema = z.object({
  confirmation: z.string().max(20)
}).strict();
const verificationBodySchema = z.object({
  nameAsPerAadhaar: z.string().max(100).optional(),
  aadhaarNumberFromFile: z.string().max(20).optional(),
  panNumberFromFile: z.string().max(10).optional(),
  aadhaarNumber: z.string().max(20).optional(),
  panNumber: z.string().max(10).optional(),
  verificationNotes: z.string().max(1000).optional(),
  markVerified: z.boolean().optional().default(false)
}).strict();
function parseOrThrow(schema, value) {
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
function listFilter(
  search,
  department,
  organization,
  verificationStatus
) {
  const filter = buildEmployeeSearchFilter(search);
  if (department) filter.department = department;
  if (organization) filter.organization = organization;
  if (verificationStatus === "pending") {
    filter.verificationStatus = { $in: ["pending", null] };
  } else if (verificationStatus) {
    filter.verificationStatus = verificationStatus;
  }
  return filter;
}
function contentDisposition(originalName, mode) {
  const fallback = originalName.replace(/[^\x20-\x7E]/g, "_").replace(/["\\]/g, "_");
  const encoded = encodeURIComponent(originalName).replace(
    /['()*]/g,
    (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`
  );
  return `${mode}; filename="${fallback}"; filename*=UTF-8''${encoded}`;
}
const adminRoutes = Router();
adminRoutes.use(requireAdmin);
adminRoutes.post("/employees/:id/upload-sessions", async (request, response) => {
  const id = parseOrThrow(idSchema, request.params.id);
  const employee = await EmployeeModel.exists({ _id: id });
  if (!employee) {
    throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
  }
  const adminId = request.user?._id;
  if (!adminId) {
    throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.");
  }
  const session = await createEditUploadSession(id, adminId);
  response.status(201).json(session);
});
adminRoutes.get("/employees", async (request, response) => {
  const query = parseOrThrow(listQuerySchema, request.query);
  const filter = listFilter(
    query.search,
    query.department,
    query.organization,
    query.verificationStatus
  );
  const skip = (query.page - 1) * query.limit;
  const sort = {
    [query.sort]: query.order === "asc" ? 1 : -1,
    _id: 1
  };
  const [employees, total] = await Promise.all([
    EmployeeModel.find(filter).sort(sort).skip(skip).limit(query.limit).lean(),
    EmployeeModel.countDocuments(filter)
  ]);
  const pages = Math.max(1, Math.ceil(total / query.limit));
  response.json({
    items: employees.map(serializeEmployeeSummary),
    total,
    page: query.page,
    pages,
    limit: query.limit
  });
});
adminRoutes.get("/employees/:id", async (request, response) => {
  const id = parseOrThrow(idSchema, request.params.id);
  const employee = await EmployeeModel.findById(id).lean();
  if (!employee) {
    throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
  }
  response.json(serializeEmployeeDetail(employee));
});
adminRoutes.delete("/employees/:id", async (request, response) => {
  const id = parseOrThrow(idSchema, request.params.id);
  const body = parseOrThrow(deleteBodySchema, request.body);
  if (body.confirmation.trim().toLowerCase() !== "confirm") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Type confirm to delete this record.",
      {
        fields: {
          confirmation: "Type confirm to continue."
        }
      }
    );
  }
  const result = await deleteEmployee(id);
  response.json(result);
});
adminRoutes.patch("/employees/:id", async (request, response) => {
  const id = parseOrThrow(idSchema, request.params.id);
  const body = parseOrThrow(updateBodySchema, request.body);
  const data = parseEmployeeData(body.data);
  const adminId = request.user?._id;
  if (!adminId) {
    throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.");
  }
  if (!body.uploadSessionId) {
    const employee2 = await updateEmployee({
      id,
      input: data,
      newAttachments: {},
      removePassport: body.removePassport
    });
    const fresh2 = await EmployeeModel.findById(id).lean();
    response.json(serializeEmployeeDetail(fresh2 ?? employee2));
    return;
  }
  const session = await getUploadSessionById(body.uploadSessionId);
  assertUploadSessionAccess(session, adminId);
  if (session.purpose !== "edit" || String(session.employeeId) !== id) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "This upload session does not belong to this employee record."
    );
  }
  if (session.status === "consumed") {
    const existing = await EmployeeModel.findById(id).lean();
    if (existing) {
      response.json(serializeEmployeeDetail(existing));
      return;
    }
    throw new HttpError(
      410,
      "UPLOAD_SESSION_EXPIRED",
      "This upload session has already been used."
    );
  }
  assertUploadSessionOpen(session);
  const newAttachments = resolveSessionAttachments(
    session,
    body.attachments ?? {}
  );
  const employee = await updateEmployee({
    id,
    input: data,
    newAttachments,
    removePassport: body.removePassport
  });
  await finalizeUploadSession(
    session,
    Object.values(newAttachments).map(
      (attachment) => attachment.pathname
    )
  ).catch((error) => {
    console.warn(
      "Could not finalize upload session:",
      error instanceof Error ? error.message : error
    );
  });
  const fresh = await EmployeeModel.findById(id).lean();
  response.json(serializeEmployeeDetail(fresh ?? employee));
});
adminRoutes.patch("/employees/:id/verification", async (request, response) => {
  const id = parseOrThrow(idSchema, request.params.id);
  const body = parseOrThrow(verificationBodySchema, request.body);
  if (!request.user?._id) {
    throw new HttpError(401, "UNAUTHORIZED", "Sign in to continue.");
  }
  const employee = await updateEmployeeVerification({
    id,
    ...body,
    adminName:
      request.user.displayName ?? request.user.username ?? "Administrator"
  });
  const fresh = await EmployeeModel.findById(id).lean();
  response.json(serializeEmployeeDetail(fresh ?? employee));
});
adminRoutes.get(
  "/employees/:id/attachments/:kind",
  async (request, response, next) => {
    const id = parseOrThrow(idSchema, request.params.id);
    const kind = parseOrThrow(kindSchema, request.params.kind);
    const employee = await EmployeeModel.findById(id).select("attachments").lean();
    if (!employee) {
      throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
    }
    const attachment = attachmentMetaFor(employee, kind);
    if (!attachment?.pathname) {
      throw new HttpError(404, "NOT_FOUND", "Document not found.");
    }
    const result = await openAttachment(attachment.pathname);
    if (!result) {
      throw new HttpError(404, "NOT_FOUND", "Document not found.");
    }
    const download = request.query.download === "1";
    response.setHeader("Content-Type", attachment.mimeType);
    response.setHeader("Content-Length", String(attachment.size));
    response.setHeader(
      "Content-Disposition",
      contentDisposition(
        attachment.originalName,
        download ? "attachment" : "inline"
      )
    );
    response.setHeader("Cache-Control", "private, no-store");
    response.setHeader("X-Content-Type-Options", "nosniff");
    result.stream.on("error", (error) => {
      if (!response.headersSent) {
        next(error);
      } else {
        response.destroy(error);
      }
    });
    result.stream.pipe(response);
  }
);
adminRoutes.post("/drive/sync", async (_request, response) => {
  const job = await startDriveSyncJob();
  response.status(202).json(job);
});
adminRoutes.get("/drive/sync", async (_request, response) => {
  response.json(await getLatestDriveSyncJob());
});
adminRoutes.get("/drive/sync/:jobId", async (request, response) => {
  response.json(await getDriveSyncJob(request.params.jobId));
});
adminRoutes.get("/stats", async (_request, response) => {
  const [total, departmentRows, withPassport, mandatoryComplete, latest] = await Promise.all([
    EmployeeModel.countDocuments({}),
    EmployeeModel.aggregate([
      { $group: { _id: "$department", count: { $sum: 1 } } }
    ]),
    EmployeeModel.countDocuments({
      "attachments.passport.pathname": { $exists: true }
    }),
    EmployeeModel.countDocuments({
      "attachments.aadhaar.pathname": { $exists: true },
      "attachments.pan.pathname": { $exists: true }
    }),
    EmployeeModel.findOne().sort({ createdAt: -1 }).select("createdAt").lean()
  ]);
  const byDepartment = Object.fromEntries(
    DEPARTMENTS.map((department) => [department, 0])
  );
  for (const row of departmentRows) {
    if (row._id in byDepartment) {
      byDepartment[row._id] = row.count;
    }
  }
  const recent = await EmployeeModel.find({}).sort({ createdAt: -1 }).limit(5).select("employeeCode fullName department createdAt").lean();
  response.json({
    total,
    byDepartment,
    withPassport,
    mandatoryComplete,
    lastSubmissionAt: latest?.createdAt ?? null,
    recent: recent.map((employee) => ({
      employeeCode: employee.employeeCode,
      fullName: employee.fullName,
      department: employee.department,
      createdAt: employee.createdAt
    }))
  });
});
adminRoutes.get("/export.csv", async (request, response) => {
  const query = parseOrThrow(exportQuerySchema, request.query);
  const filter = listFilter(
    query.search,
    query.department,
    query.organization,
    query.verificationStatus
  );
  const employees = await EmployeeModel.find(filter).sort({ createdAt: -1 }).lean();
  const csv = buildEmployeeCsv(employees, env.PUBLIC_API_URL);
  const filename = `blaupunkt-employee-records-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.csv`;
  response.setHeader("Content-Type", "text/csv; charset=utf-8");
  response.setHeader(
    "Content-Disposition",
    `attachment; filename="${filename}"`
  );
  response.setHeader("Cache-Control", "private, no-store");
  response.send(csv);
});
export {
  adminRoutes
};
