import { Types } from 'mongoose';
import {
  ATTACHMENT_KINDS,
  DEPARTMENTS,
  DUPLICATE_FIELD_LABELS,
  normalizeAadhaar,
  normalizeCode,
  normalizeEmail,
  normalizeMobile,
  normalizePan,
  normalizeWhitespace,
  type AttachmentKind,
  type DuplicateField,
  type EmployeeInput,
} from '@bpi/shared';
import {
  EmployeeModel,
  type Address,
  type BlobMeta,
  type Employee,
  type EmployeeAttachments,
} from '../models/Employee';
import { HttpError, type Conflict } from '../utils/http-error';
import {
  deleteDriveFolder,
  refreshDriveMasterCsv,
} from './google-drive.service';
import { removeAttachment } from './storage.service';
import { deleteUploadSessionsForEmployee } from './upload-session.service';

type DuplicateSource = Partial<
  Pick<
    EmployeeInput,
    'employeeCode' | 'personalEmail' | 'personalMobile' | 'officeMobile'
  >
>;

export type EmployeeFilter = {
  _id?: { $ne: Types.ObjectId };
  employeeCode?: string | RegExp;
  fullName?: string | RegExp;
  personalEmail?: string | RegExp;
  personalMobile?: string | RegExp | { $in: string[] };
  officeMobile?: string | RegExp | { $in: string[] };
  officeEmail?: string | RegExp;
  department?: (typeof DEPARTMENTS)[number];
  $or?: EmployeeFilter[];
};

function normalizeAddress(address: Address): Address {
  return {
    line: address.line.trim(),
    state: address.state.trim(),
    city: normalizeWhitespace(address.city),
    pincode: address.pincode.replace(/\s/g, ''),
  };
}

export function normalizeEmployeeInput(input: EmployeeInput): EmployeeInput {
  const presentSameAsPermanent = input.presentSameAsPermanent;
  return {
    ...input,
    employeeCode: normalizeCode(input.employeeCode),
    fullName: normalizeWhitespace(input.fullName),
    nationality: normalizeWhitespace(input.nationality),
    nominee: normalizeWhitespace(input.nominee),
    aadhaarNumber: normalizeAadhaar(input.aadhaarNumber),
    panNumber: normalizePan(input.panNumber),
    passportNumber: input.passportNumber?.trim()
      ? input.passportNumber.trim().toUpperCase()
      : '',
    officeMobile: normalizeMobile(input.officeMobile),
    officeEmail: input.officeEmail?.trim()
      ? normalizeEmail(input.officeEmail)
      : '',
    personalMobile: normalizeMobile(input.personalMobile),
    personalEmail: normalizeEmail(input.personalEmail),
    permanentAddress: normalizeAddress(input.permanentAddress),
    presentSameAsPermanent,
    presentAddress: presentSameAsPermanent
      ? normalizeAddress(input.permanentAddress)
      : normalizeAddress(input.presentAddress),
    emergencyContact: {
      name: normalizeWhitespace(input.emergencyContact.name),
      relation: normalizeWhitespace(input.emergencyContact.relation),
      mobile: normalizeMobile(input.emergencyContact.mobile),
    },
  };
}

export function conflictMessage(field: DuplicateField): string {
  return `${DUPLICATE_FIELD_LABELS[field]} is already used by an existing record.`;
}

export async function findDuplicateConflicts(
  input: DuplicateSource,
  excludeId?: string,
): Promise<Conflict[]> {
  const code = input.employeeCode ? normalizeCode(input.employeeCode) : '';
  const email = input.personalEmail
    ? normalizeEmail(input.personalEmail)
    : '';
  const personalMobile = input.personalMobile
    ? normalizeMobile(input.personalMobile)
    : '';
  const officeMobile = input.officeMobile
    ? normalizeMobile(input.officeMobile)
    : '';

  const mobileValues = [...new Set([personalMobile, officeMobile].filter(Boolean))];
  const conditions: EmployeeFilter[] = [];

  if (code) conditions.push({ employeeCode: code });
  if (email) conditions.push({ personalEmail: email });
  if (mobileValues.length) {
    conditions.push({ personalMobile: { $in: mobileValues } });
    conditions.push({ officeMobile: { $in: mobileValues } });
  }

  if (!conditions.length) return [];

  const filter: EmployeeFilter = { $or: conditions };
  if (excludeId) {
    filter._id = { $ne: new Types.ObjectId(excludeId) };
  }

  const matches = await EmployeeModel.find(filter)
    .select('employeeCode personalEmail personalMobile officeMobile')
    .lean();

  const conflicts = new Set<DuplicateField>();

  for (const match of matches) {
    if (code && match.employeeCode === code) {
      conflicts.add('employeeCode');
    }
    if (email && match.personalEmail === email) {
      conflicts.add('personalEmail');
    }
    if (
      personalMobile &&
      (match.personalMobile === personalMobile ||
        match.officeMobile === personalMobile)
    ) {
      conflicts.add('personalMobile');
    }
    if (
      officeMobile &&
      (match.officeMobile === officeMobile ||
        match.personalMobile === officeMobile)
    ) {
      conflicts.add('officeMobile');
    }
  }

  return [...conflicts].map((field) => ({
    field,
    message: conflictMessage(field),
  }));
}

export async function assertNoDuplicates(
  input: DuplicateSource,
  excludeId?: string,
): Promise<void> {
  const conflicts = await findDuplicateConflicts(input, excludeId);
  if (conflicts.length) {
    throw new HttpError(
      409,
      'DUPLICATE_ENTRY',
      'This entry matches an existing employee record.',
      { conflicts },
    );
  }
}

function isDuplicateKeyError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code: unknown }).code === 11000
  );
}

export async function createEmployee(input: {
  employeeId: Types.ObjectId;
  input: EmployeeInput;
  attachments: Partial<Record<AttachmentKind, BlobMeta>>;
}): Promise<{ employee: Employee; created: boolean }> {
  const existing = await EmployeeModel.findById(input.employeeId);
  if (existing) {
    return { employee: existing, created: false };
  }

  if (!input.attachments.aadhaar || !input.attachments.pan) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Aadhaar and PAN documents are required.',
      {
        fields: {
          'attachments.aadhaar': 'Aadhaar attachment is required',
          'attachments.pan': 'PAN attachment is required',
        },
      },
    );
  }

  const normalized = normalizeEmployeeInput(input.input);
  await assertNoDuplicates(normalized);

  try {
    const attachments: EmployeeAttachments = {
      aadhaar: input.attachments.aadhaar,
      pan: input.attachments.pan,
      ...(input.attachments.passport
        ? { passport: input.attachments.passport }
        : {}),
    };

    const employee = new EmployeeModel({
      _id: input.employeeId,
      ...normalized,
      attachments,
    });

    await employee.save();
    return { employee, created: true };
  } catch (error) {
    if (isDuplicateKeyError(error)) {
      const conflicts = await findDuplicateConflicts(normalized);
      throw new HttpError(
        409,
        'DUPLICATE_ENTRY',
        'This entry matches an existing employee record.',
        { conflicts },
      );
    }

    throw error;
  }
}

export async function updateEmployee(input: {
  id: string;
  input: EmployeeInput;
  newAttachments: Partial<Record<AttachmentKind, BlobMeta>>;
  removePassport: boolean;
}): Promise<Employee> {
  const employee = await EmployeeModel.findById(input.id);
  if (!employee) {
    throw new HttpError(404, 'NOT_FOUND', 'Employee record not found.');
  }

  const normalized = normalizeEmployeeInput(input.input);
  await assertNoDuplicates(normalized, input.id);

  const oldPathnames: string[] = [];

  for (const kind of ATTACHMENT_KINDS) {
    const meta = input.newAttachments[kind];
    if (!meta) continue;

    const previous = employee.attachments?.[kind]?.pathname;
    if (previous && previous !== meta.pathname) oldPathnames.push(previous);

    if (kind === 'aadhaar') employee.attachments.aadhaar = meta;
    else if (kind === 'pan') employee.attachments.pan = meta;
    else employee.attachments.passport = meta;
  }

  if (input.removePassport && !input.newAttachments.passport) {
    const previous = employee.attachments?.passport?.pathname;
    if (previous) {
      oldPathnames.push(previous);
      employee.attachments.passport = undefined;
    }
  }

  if (!employee.attachments?.aadhaar || !employee.attachments?.pan) {
    throw new HttpError(
      400,
      'VALIDATION_ERROR',
      'Aadhaar and PAN documents are required.',
      {
        fields: {
          'attachments.aadhaar': 'Aadhaar attachment is required',
          'attachments.pan': 'PAN attachment is required',
        },
      },
    );
  }

  employee.set(normalized);
  await employee.save();

  await Promise.all(
    oldPathnames.map((pathname) => removeAttachment(pathname)),
  );
  return employee;
}

export function attachmentMetaFor(
  employee: Pick<Employee, 'attachments'>,
  kind: AttachmentKind,
): BlobMeta | undefined {
  if (kind === 'aadhaar') return employee.attachments?.aadhaar;
  if (kind === 'pan') return employee.attachments?.pan;
  return employee.attachments?.passport;
}

export async function deleteEmployee(id: string): Promise<{
  id: string;
  filesRemoved: number;
  uploadSessionsDeleted: number;
  driveDeleted: boolean;
  csvRefreshed: boolean;
}> {
  const employee = await EmployeeModel.findById(id).lean<Employee>();
  if (!employee) {
    throw new HttpError(404, 'NOT_FOUND', 'Employee record not found.');
  }

  await EmployeeModel.deleteOne({ _id: employee._id });

  const uploadSessionsDeleted =
    await deleteUploadSessionsForEmployee(id);
  const pathnames = [
    ...new Set(
      ATTACHMENT_KINDS.map(
        (kind) => attachmentMetaFor(employee, kind)?.pathname,
      ).filter((pathname): pathname is string => Boolean(pathname)),
    ),
  ];
  const removed = await Promise.all(
    pathnames.map((pathname) => removeAttachment(pathname)),
  );

  const driveDeleted = employee.driveFolderId
    ? await deleteDriveFolder(employee.driveFolderId)
    : true;

  let csvRefreshed = false;
  try {
    await refreshDriveMasterCsv();
    csvRefreshed = true;
  } catch (error) {
    console.warn(
      'Could not refresh Google Drive CSV after deleting employee:',
      error instanceof Error ? error.message : error,
    );
  }

  return {
    id,
    filesRemoved: removed.filter(Boolean).length,
    uploadSessionsDeleted,
    driveDeleted,
    csvRefreshed,
  };
}

export function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function buildEmployeeSearchFilter(search: string): EmployeeFilter {
  if (!search) return {};
  const expression = new RegExp(escapeRegex(search), 'i');
  return {
    $or: [
      { employeeCode: expression },
      { fullName: expression },
      { personalEmail: expression },
      { personalMobile: expression },
      { officeMobile: expression },
      { officeEmail: expression },
    ],
  };
}
