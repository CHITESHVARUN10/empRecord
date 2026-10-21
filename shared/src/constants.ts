export const ORGANIZATIONS = [
  'BPIN PRIVATE LIMITED',
  'AUTO SONICS INDIA PRIVATE LIMITED',
] as const;
export type Organization = (typeof ORGANIZATIONS)[number];

export const DEPARTMENTS = ['Sales', 'HO', 'Service'] as const;
export type Department = (typeof DEPARTMENTS)[number];

export const GENDERS = ['Male', 'Female', 'Other'] as const;
export type Gender = (typeof GENDERS)[number];

export const MARITAL_STATUSES = ['Married', 'Unmarried'] as const;
export type MaritalStatus = (typeof MARITAL_STATUSES)[number];

export const BLOOD_GROUPS = [
  'A+',
  'A-',
  'B+',
  'B-',
  'AB+',
  'AB-',
  'O+',
  'O-',
  'Not known',
] as const;
export type BloodGroup = (typeof BLOOD_GROUPS)[number];

export const ATTACHMENT_KINDS = ['aadhaar', 'pan', 'passport'] as const;
export type AttachmentKind = (typeof ATTACHMENT_KINDS)[number];

export const MANDATORY_ATTACHMENTS = ['aadhaar', 'pan'] as const;

export const DOCUMENT_VERIFICATION_STATUSES = [
  'pending',
  'verified',
  'review',
] as const;
export type DocumentVerificationStatus =
  (typeof DOCUMENT_VERIFICATION_STATUSES)[number];

export const VERIFICATION_STATUSES = ['pending', 'review', 'done'] as const;
export type VerificationStatus = (typeof VERIFICATION_STATUSES)[number];

export const DOCUMENT_VERIFICATION_STATUS_LABELS: Record<
  DocumentVerificationStatus,
  string
> = {
  pending: 'Pending',
  verified: 'Verified',
  review: 'Review',
};

export const VERIFICATION_STATUS_LABELS: Record<VerificationStatus, string> = {
  pending: 'Pending',
  review: 'Review required',
  done: 'Done',
};

export const DEFAULT_NATIONALITY = 'Indian';

export const MAX_FILE_SIZE_MB = 5;
export const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
export const MAX_FILES_PER_SUBMISSION = 3;

export const ACCEPTED_FILE_TYPES = [
  { mime: 'application/pdf', extension: 'pdf', label: 'PDF' },
  { mime: 'image/jpeg', extension: 'jpg', label: 'JPEG' },
] as const;

export const ACCEPTED_MIME_TYPES = ACCEPTED_FILE_TYPES.map((type) => type.mime);
export const ACCEPT_ATTRIBUTE = '.pdf,.jpg,.jpeg';

export const ATTACHMENT_LABELS: Record<AttachmentKind, string> = {
  aadhaar: 'Aadhaar',
  pan: 'PAN',
  passport: 'Passport',
};

export const DUPLICATE_FIELD_LABELS = {
  employeeCode: 'Employee code',
  personalEmail: 'Personal email',
  personalMobile: 'Personal mobile',
  officeMobile: 'Office mobile',
} as const;

export type DuplicateField = keyof typeof DUPLICATE_FIELD_LABELS;

export const ADMIN_SORT_FIELDS = [
  'createdAt',
  'updatedAt',
  'fullName',
  'employeeCode',
  'joiningDate',
  'department',
] as const;
export type AdminSortField = (typeof ADMIN_SORT_FIELDS)[number];
