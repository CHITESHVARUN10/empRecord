import type { Types } from 'mongoose';
import type { Admin } from '../models/Admin';
import type {
  BlobMeta,
  Employee,
  EmployeeAttachments,
} from '../models/Employee';

export function serializeAdmin(admin: {
  _id: string | Types.ObjectId;
  username: string;
  displayName: string;
  lastLoginAt?: Date;
}) {
  return {
    id: String(admin._id),
    username: admin.username,
    displayName: admin.displayName,
    lastLoginAt: admin.lastLoginAt ?? null,
  };
}

export function maskAadhaar(value: string): string {
  const digits = value.replace(/\D/g, '');
  if (digits.length !== 12) return '—';
  return `XXXX XXXX ${digits.slice(-4)}`;
}

export function maskPan(value: string): string {
  const normalized = value.trim().toUpperCase();
  if (normalized.length !== 10) return '—';
  return `${normalized.slice(0, 2)}••••••${normalized.slice(-2)}`;
}

function serializeAttachment(
  attachment: BlobMeta | undefined,
  employeeId: string,
  kind: keyof EmployeeAttachments,
) {
  if (!attachment?.pathname) return null;
  return {
    originalName: attachment.originalName,
    mimeType: attachment.mimeType,
    size: attachment.size,
    uploadedAt: attachment.uploadedAt,
    viewUrl: `/api/admin/employees/${employeeId}/attachments/${kind}`,
  };
}

export function serializeEmployeeSummary(employee: Employee) {
  const id = String(employee._id);
  return {
    id,
    employeeCode: employee.employeeCode,
    organization: employee.organization ?? '',
    fullName: employee.fullName,
    department: employee.department,
    joiningDate: employee.joiningDate,
    personalMobile: employee.personalMobile,
    personalEmail: employee.personalEmail,
    officeMobile: employee.officeMobile,
    officeEmail: employee.officeEmail ?? '',
    aadhaarMasked: maskAadhaar(employee.aadhaarNumber),
    panMasked: maskPan(employee.panNumber),
    documents: {
      aadhaar: Boolean(employee.attachments?.aadhaar?.pathname),
      pan: Boolean(employee.attachments?.pan?.pathname),
      passport: Boolean(employee.attachments?.passport?.pathname),
    },
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export function serializeEmployeeDetail(employee: Employee) {
  const id = String(employee._id);
  return {
    id,
    employeeCode: employee.employeeCode,
    organization: employee.organization ?? '',
    fullName: employee.fullName,
    dateOfBirth: employee.dateOfBirth,
    gender: employee.gender,
    nationality: employee.nationality,
    maritalStatus: employee.maritalStatus,
    bloodGroup: employee.bloodGroup,
    nominee: employee.nominee,
    aadhaarNumber: employee.aadhaarNumber,
    panNumber: employee.panNumber,
    passportNumber: employee.passportNumber ?? '',
    department: employee.department,
    joiningDate: employee.joiningDate,
    permanentAddress: employee.permanentAddress,
    officeMobile: employee.officeMobile,
    officeEmail: employee.officeEmail ?? '',
    presentSameAsPermanent: employee.presentSameAsPermanent,
    presentAddress: employee.presentAddress,
    personalMobile: employee.personalMobile,
    personalEmail: employee.personalEmail,
    emergencyContact: employee.emergencyContact,
    attachments: {
      aadhaar: serializeAttachment(employee.attachments?.aadhaar, id, 'aadhaar'),
      pan: serializeAttachment(employee.attachments?.pan, id, 'pan'),
      passport: serializeAttachment(
        employee.attachments?.passport,
        id,
        'passport',
      ),
    },
    createdAt: employee.createdAt,
    updatedAt: employee.updatedAt,
  };
}

export type AdminSource = Admin;
