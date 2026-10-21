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
const PAN_FORMAT = /^[A-Z]{5}[0-9]{4}[A-Z]$/;
function digitsOnly(value) {
  return String(value ?? "").replace(/\D/g, "");
}
function deriveDocumentVerificationStatus(kind, sourceValue, fileValue) {
  const file = String(fileValue ?? "").trim();
  if (!file) return "pending";
  if (kind === "aadhaar") {
    const source = digitsOnly(sourceValue);
    const fromFile = digitsOnly(file);
    return source.length === 12 && fromFile.length === 12 && source === fromFile
      ? "verified"
      : "review";
  }
  const source = String(sourceValue ?? "").trim().toUpperCase();
  const fromFile = file.toUpperCase();
  return PAN_FORMAT.test(fromFile) && source === fromFile
    ? "verified"
    : "review";
}
function deriveVerificationStatus(aadhaarStatus, panStatus) {
  if (aadhaarStatus === "review" || panStatus === "review") return "review";
  if (aadhaarStatus === "verified" && panStatus === "verified") return "done";
  return "pending";
}
function reconcileVerification(employee) {
  employee.aadhaarVerificationStatus = deriveDocumentVerificationStatus(
    "aadhaar",
    employee.aadhaarNumber,
    employee.aadhaarNumberFromFile
  );
  employee.panVerificationStatus = deriveDocumentVerificationStatus(
    "pan",
    employee.panNumber,
    employee.panNumberFromFile
  );
  employee.verificationStatus = deriveVerificationStatus(
    employee.aadhaarVerificationStatus,
    employee.panVerificationStatus
  );
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
  const previousAadhaar = employee.aadhaarNumber;
  const previousPan = employee.panNumber;
  let verificationChanged = false;
  const oldPathnames = [];
  for (const kind of ATTACHMENT_KINDS) {
    const meta = input.newAttachments[kind];
    if (!meta) continue;
    const previous = employee.attachments?.[kind]?.pathname;
    if (previous && previous !== meta.pathname) oldPathnames.push(previous);
    if (kind === "aadhaar") {
      employee.attachments.aadhaar = meta;
      employee.nameAsPerAadhaar = "";
      employee.aadhaarNumberFromFile = "";
      employee.aadhaarVerificationStatus = "pending";
      verificationChanged = true;
    } else if (kind === "pan") {
      employee.attachments.pan = meta;
      employee.panNumberFromFile = "";
      employee.panVerificationStatus = "pending";
      verificationChanged = true;
    } else {
      employee.attachments.passport = meta;
    }
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
  if (employee.aadhaarNumber !== previousAadhaar) {
    employee.aadhaarVerificationStatus = deriveDocumentVerificationStatus(
      "aadhaar",
      employee.aadhaarNumber,
      employee.aadhaarNumberFromFile
    );
    verificationChanged = true;
  }
  if (employee.panNumber !== previousPan) {
    employee.panVerificationStatus = deriveDocumentVerificationStatus(
      "pan",
      employee.panNumber,
      employee.panNumberFromFile
    );
    verificationChanged = true;
  }
  if (verificationChanged) {
    employee.verificationStatus = deriveVerificationStatus(
      employee.aadhaarVerificationStatus,
      employee.panVerificationStatus
    );
    employee.verificationReviewedAt = void 0;
    employee.verificationReviewedBy = void 0;
  }
  await employee.save();
  await Promise.all(
    oldPathnames.map((pathname) => removeAttachment(pathname))
  );
  return employee;
}
function verificationValidationError(fields) {
  return new HttpError(
    400,
    "VALIDATION_ERROR",
    "Please correct the verification details.",
    { fields }
  );
}
async function updateEmployeeVerification(input) {
  const employee = await EmployeeModel.findById(input.id);
  if (!employee) {
    throw new HttpError(404, "NOT_FOUND", "Employee record not found.");
  }
  const fields = {};
  if (input.aadhaarNumber !== void 0) {
    const normalized = normalizeAadhaar(input.aadhaarNumber);
    if (!/^\d{12}$/.test(normalized)) {
      fields.aadhaarNumber = "Enter a valid 12-digit Aadhaar number.";
    } else {
      employee.aadhaarNumber = normalized;
    }
  }
  if (input.panNumber !== void 0) {
    const normalized = normalizePan(input.panNumber);
    if (!PAN_FORMAT.test(normalized)) {
      fields.panNumber = "Enter a valid PAN (for example ABCDE1234F).";
    } else {
      employee.panNumber = normalized;
    }
  }
  if (Object.keys(fields).length) throw verificationValidationError(fields);

  if (input.nameAsPerAadhaar !== void 0) {
    employee.nameAsPerAadhaar = String(input.nameAsPerAadhaar).trim();
  }
  if (input.aadhaarNumberFromFile !== void 0) {
    employee.aadhaarNumberFromFile = String(
      input.aadhaarNumberFromFile
    ).trim();
  }
  if (input.panNumberFromFile !== void 0) {
    employee.panNumberFromFile = String(
      input.panNumberFromFile
    ).trim().toUpperCase();
  }
  if (input.verificationNotes !== void 0) {
    employee.verificationNotes = String(input.verificationNotes).trim();
  }

  if (input.markVerified) {
    const missing = {};
    if (!employee.aadhaarNumberFromFile) {
      missing.aadhaarNumberFromFile =
        "Enter the Aadhaar number read from the file.";
    }
    if (!employee.panNumberFromFile) {
      missing.panNumberFromFile = "Enter the PAN number read from the file.";
    }
    if (Object.keys(missing).length) throw verificationValidationError(missing);
    employee.aadhaarVerificationStatus = "verified";
    employee.panVerificationStatus = "verified";
    employee.verificationStatus = "done";
    employee.verificationReviewedAt = /* @__PURE__ */ new Date();
    employee.verificationReviewedBy = input.adminName;
  } else {
    reconcileVerification(employee);
    employee.verificationReviewedAt = void 0;
    employee.verificationReviewedBy = void 0;
  }
  await employee.save();
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
  reconcileVerification,
  updateEmployee,
  updateEmployeeVerification
};
