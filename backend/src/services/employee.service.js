import { Types } from "mongoose";
import {
  ATTACHMENT_KINDS,
  DUPLICATE_FIELD_LABELS,
  normalizeAadhaar,
  normalizeCode,
  normalizeEmail,
  normalizeMobile,
  normalizePan,
  normalizeWhitespace
} from '#shared';
import {
  EmployeeModel
} from "../models/Employee.js";
import { HttpError } from "../utils/http-error.js";
import {
  deleteDriveFolder,
  refreshDriveMasterCsv
} from "./google-drive.service.js";
import { removeAttachment } from "./storage.service.js";
import { deleteUploadSessionsForEmployee } from "./upload-session.service.js";
function normalizeAddress(address) {
  return {
    line: address.line.trim(),
    state: address.state.trim(),
    city: normalizeWhitespace(address.city),
    pincode: address.pincode.replace(/\s/g, "")
  };
}
function normalizeEmployeeInput(input) {
  const presentSameAsPermanent = input.presentSameAsPermanent;
  return {
    ...input,
    employeeCode: normalizeCode(input.employeeCode),
    fullName: normalizeWhitespace(input.fullName),
    nationality: normalizeWhitespace(input.nationality),
    nominee: normalizeWhitespace(input.nominee),
    aadhaarNumber: normalizeAadhaar(input.aadhaarNumber),
    panNumber: normalizePan(input.panNumber),
    passportNumber: input.passportNumber?.trim() ? input.passportNumber.trim().toUpperCase() : "",
    officeMobile: normalizeMobile(input.officeMobile),
    officeEmail: input.officeEmail?.trim() ? normalizeEmail(input.officeEmail) : "",
    personalMobile: normalizeMobile(input.personalMobile),
    personalEmail: normalizeEmail(input.personalEmail),
    permanentAddress: normalizeAddress(input.permanentAddress),
    presentSameAsPermanent,
    presentAddress: presentSameAsPermanent ? normalizeAddress(input.permanentAddress) : normalizeAddress(input.presentAddress),
    emergencyContact: {
      name: normalizeWhitespace(input.emergencyContact.name),
      relation: normalizeWhitespace(input.emergencyContact.relation),
      mobile: normalizeMobile(input.emergencyContact.mobile)
    }
  };
}
function conflictMessage(field) {
  if (field === "employeeCode") {
    return "Employee code is already used by an existing record in this organization.";
  }
  return `${DUPLICATE_FIELD_LABELS[field]} is already used by an existing record.`;
}
async function findDuplicateConflicts(input, excludeId) {
  const code = input.employeeCode ? normalizeCode(input.employeeCode) : "";
  const email = input.personalEmail ? normalizeEmail(input.personalEmail) : "";
  const personalMobile = input.personalMobile ? normalizeMobile(input.personalMobile) : "";
  const officeMobile = input.officeMobile ? normalizeMobile(input.officeMobile) : "";
  const mobileValues = [...new Set([personalMobile, officeMobile].filter(Boolean))];
  const conditions = [];
  if (code && input.organization) {
    conditions.push({
      organization: input.organization,
      employeeCode: code
    });
  }
  if (email) conditions.push({ personalEmail: email });
  if (mobileValues.length) {
    conditions.push({ personalMobile: { $in: mobileValues } });
    conditions.push({ officeMobile: { $in: mobileValues } });
  }
  if (!conditions.length) return [];
  const filter = { $or: conditions };
  if (excludeId) {
    filter._id = { $ne: new Types.ObjectId(excludeId) };
  }
  const matches = await EmployeeModel.find(filter).select("employeeCode organization personalEmail personalMobile officeMobile").lean();
  const conflicts = /* @__PURE__ */ new Set();
  for (const match of matches) {
    if (
      code &&
      input.organization &&
      match.organization === input.organization &&
      match.employeeCode === code
    ) {
      conflicts.add("employeeCode");
    }
    if (email && match.personalEmail === email) {
      conflicts.add("personalEmail");
    }
    if (personalMobile && (match.personalMobile === personalMobile || match.officeMobile === personalMobile)) {
      conflicts.add("personalMobile");
    }
    if (officeMobile && (match.officeMobile === officeMobile || match.personalMobile === officeMobile)) {
      conflicts.add("officeMobile");
    }
  }
  return [...conflicts].map((field) => ({
    field,
    message: conflictMessage(field)
  }));
}
async function assertNoDuplicates(input, excludeId) {
  const conflicts = await findDuplicateConflicts(input, excludeId);
  if (conflicts.length) {
    throw new HttpError(
      409,
      "DUPLICATE_ENTRY",
      "This entry matches an existing employee record.",
      { conflicts }
    );
  }
}
function isDuplicateKeyError(error) {
  return typeof error === "object" && error !== null && "code" in error && error.code === 11e3;
}
async function createEmployee(input) {
  const existing = await EmployeeModel.findById(input.employeeId);
  if (existing) {
    return { employee: existing, created: false };
  }
  if (!input.attachments.aadhaar || !input.attachments.pan) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Aadhaar and PAN documents are required.",
      {
        fields: {
          "attachments.aadhaar": "Aadhaar attachment is required",
          "attachments.pan": "PAN attachment is required"
        }
      }
    );
  }
  const normalized = normalizeEmployeeInput(input.input);
  await assertNoDuplicates(normalized);
  try {
    const attachments = {
      aadhaar: input.attachments.aadhaar,
      pan: input.attachments.pan,
      ...input.attachments.passport ? { passport: input.attachments.passport } : {}
    };
    const employee = new EmployeeModel({
      _id: input.employeeId,
      ...normalized,
      attachments
    });
    await employee.save();
    return { employee, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const conflicts = await findDuplicateConflicts(normalized);
      throw new HttpError(
        409,
        "DUPLICATE_ENTRY",
        "This entry matches an existing employee record.",
        { conflicts }
      );
    }
    throw error;
  }
}
async function updateEmployee(input) {
  const employee = await EmployeeModel.findById(input.id);
  if (!employee) {
    throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
  }
  const normalized = normalizeEmployeeInput(input.input);
  await assertNoDuplicates(normalized, input.id);
  const oldPathnames = [];
  for (const kind of ATTACHMENT_KINDS) {
    const meta = input.newAttachments[kind];
    if (!meta) continue;
    const previous = employee.attachments?.[kind]?.pathname;
    if (previous && previous !== meta.pathname) oldPathnames.push(previous);
    if (kind === "aadhaar") employee.attachments.aadhaar = meta;
    else if (kind === "pan") employee.attachments.pan = meta;
    else employee.attachments.passport = meta;
  }
  if (input.removePassport && !input.newAttachments.passport) {
    const previous = employee.attachments?.passport?.pathname;
    if (previous) {
      oldPathnames.push(previous);
      employee.attachments.passport = void 0;
    }
  }
  if (!employee.attachments?.aadhaar || !employee.attachments?.pan) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Aadhaar and PAN documents are required.",
      {
        fields: {
          "attachments.aadhaar": "Aadhaar attachment is required",
          "attachments.pan": "PAN attachment is required"
        }
      }
    );
  }
  employee.set(normalized);
  await employee.save();
  await Promise.all(
    oldPathnames.map((pathname) => removeAttachment(pathname))
  );
  return employee;
}
function attachmentMetaFor(employee, kind) {
  if (kind === "aadhaar") return employee.attachments?.aadhaar;
  if (kind === "pan") return employee.attachments?.pan;
  return employee.attachments?.passport;
}
async function deleteEmployee(id) {
  const employee = await EmployeeModel.findById(id).lean();
  if (!employee) {
    throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
  }
  await EmployeeModel.deleteOne({ _id: employee._id });
  const uploadSessionsDeleted = await deleteUploadSessionsForEmployee(id);
  const pathnames = [
    ...new Set(
      ATTACHMENT_KINDS.map(
        (kind) => attachmentMetaFor(employee, kind)?.pathname
      ).filter((pathname) => Boolean(pathname))
    )
  ];
  const removed = await Promise.all(
    pathnames.map((pathname) => removeAttachment(pathname))
  );
  const driveDeleted = employee.driveFolderId ? await deleteDriveFolder(employee.driveFolderId) : true;
  let csvRefreshed = false;
  try {
    await refreshDriveMasterCsv();
    csvRefreshed = true;
  } catch (error) {
    console.warn(
      "Could not refresh Google Drive CSV after deleting employee:",
      error instanceof Error ? error.message : error
    );
  }
  return {
    id,
    filesRemoved: removed.filter(Boolean).length,
    uploadSessionsDeleted,
    driveDeleted,
    csvRefreshed
  };
}
function escapeRegex(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function buildEmployeeSearchFilter(search) {
  if (!search) return {};
  const expression = new RegExp(escapeRegex(search), "i");
  return {
    $or: [
      { employeeCode: expression },
      { fullName: expression },
      { personalEmail: expression },
      { personalMobile: expression },
      { officeMobile: expression },
      { officeEmail: expression }
    ]
  };
}
export {
  assertNoDuplicates,
  attachmentMetaFor,
  buildEmployeeSearchFilter,
  conflictMessage,
  createEmployee,
  deleteEmployee,
  escapeRegex,
  findDuplicateConflicts,
  normalizeEmployeeInput,
  updateEmployee
};
