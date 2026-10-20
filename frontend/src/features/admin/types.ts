import type {
  AttachmentKind,
  Department,
  EmployeeInput,
} from '@bpi/shared';

export type AttachmentInfo = {
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: string;
  viewUrl: string;
};

export type EmployeeSummary = {
  id: string;
  employeeCode: string;
  organization: string;
  fullName: string;
  department: Department;
  joiningDate: string;
  personalMobile: string;
  personalEmail: string;
  officeMobile: string;
  officeEmail: string;
  aadhaarMasked: string;
  panMasked: string;
  documents: {
    aadhaar: boolean;
    pan: boolean;
    passport: boolean;
  };
  createdAt: string;
  updatedAt: string;
};

export type EmployeeDetail = EmployeeInput & {
  id: string;
  attachments: {
    aadhaar: AttachmentInfo | null;
    pan: AttachmentInfo | null;
    passport: AttachmentInfo | null;
  };
  createdAt: string;
  updatedAt: string;
};

export type AdminStats = {
  total: number;
  byDepartment: Record<Department, number>;
  withPassport: number;
  mandatoryComplete: number;
  lastSubmissionAt: string | null;
  recent: {
    employeeCode: string;
    fullName: string;
    department: Department;
    createdAt: string;
  }[];
};

export type EmployeeListResponse = {
  items: EmployeeSummary[];
  total: number;
  page: number;
  pages: number;
  limit: number;
};

export type EmployeeListFilters = {
  search: string;
  department: string;
  page: number;
  sort: string;
  order: 'asc' | 'desc';
};

export type DriveSyncFailure = {
  employeeId: string;
  employeeName: string;
  kind?: AttachmentKind;
  message: string;
};

export type DriveSyncResult = {
  rootFolderId: string;
  rootFolderWebViewLink: string;
  csvFileId: string;
  csvWebViewLink: string;
  employees: number;
  skippedEmployees: number;
  files: number;
  skippedFiles: number;
  failures: DriveSyncFailure[];
  syncedAt: string;
};

export type DriveSyncJob = {
  jobId: string;
  status: 'running' | 'completed' | 'failed';
  total: number;
  processed: number;
  skipped: number;
  filesUploaded: number;
  filesSkipped: number;
  failures: DriveSyncFailure[];
  result?: DriveSyncResult;
  error?: string;
  startedAt: string;
  lastProgressAt?: string;
  finishedAt?: string;
};

export type DeleteEmployeeResult = {
  id: string;
  filesRemoved: number;
  uploadSessionsDeleted: number;
  driveDeleted: boolean;
  csvRefreshed: boolean;
};
