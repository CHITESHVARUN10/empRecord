export type ErrorCode =
  | 'VALIDATION_ERROR'
  | 'DUPLICATE_ENTRY'
  | 'UNAUTHORIZED'
  | 'FORBIDDEN'
  | 'NOT_FOUND'
  | 'UPLOAD_SESSION_EXPIRED'
  | 'FILE_TOO_LARGE'
  | 'INVALID_FILE_TYPE'
  | 'UPLOAD_FAILED'
  | 'STORAGE_NOT_CONFIGURED'
  | 'DRIVE_NOT_CONFIGURED'
  | 'DRIVE_AUTH_FAILED'
  | 'DRIVE_SYNC_FAILED'
  | 'INTERNAL';

export type FieldErrors = Record<string, string>;

export type Conflict = {
  field: string;
  message: string;
};

export class HttpError extends Error {
  readonly status: number;
  readonly code: ErrorCode;
  readonly fields?: FieldErrors;
  readonly conflicts?: Conflict[];

  constructor(
    status: number,
    code: ErrorCode,
    message: string,
    options?: {
      fields?: FieldErrors;
      conflicts?: Conflict[];
      cause?: unknown;
    },
  ) {
    super(message, options?.cause ? { cause: options.cause } : undefined);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.fields = options?.fields;
    this.conflicts = options?.conflicts;
  }
}
