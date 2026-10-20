import { Schema, model } from 'mongoose';
import type { AttachmentKind } from '@bpi/shared';

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

export type DriveSyncJobStatus = 'running' | 'completed' | 'failed';

export interface DriveSyncJob {
  jobId: string;
  status: DriveSyncJobStatus;
  total: number;
  processed: number;
  skipped: number;
  filesUploaded: number;
  filesSkipped: number;
  failures: DriveSyncFailure[];
  result?: DriveSyncResult;
  error?: string;
  startedAt: Date;
  lastProgressAt?: Date;
  finishedAt?: Date;
}

const failureSchema = new Schema<DriveSyncFailure>(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    kind: { type: String },
    message: { type: String, required: true },
  },
  { _id: false },
);

const jobSchema = new Schema<DriveSyncJob>(
  {
    jobId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ['running', 'completed', 'failed'],
      default: 'running',
    },
    total: { type: Number, required: true, default: 0 },
    processed: { type: Number, required: true, default: 0 },
    skipped: { type: Number, required: true, default: 0 },
    filesUploaded: { type: Number, required: true, default: 0 },
    filesSkipped: { type: Number, required: true, default: 0 },
    failures: { type: [failureSchema], default: [] },
    result: { type: Schema.Types.Mixed },
    error: { type: String },
    startedAt: { type: Date, required: true, default: Date.now },
    lastProgressAt: { type: Date, default: Date.now },
    finishedAt: { type: Date },
  },
  { versionKey: false },
);

jobSchema.index({ jobId: 1 }, { unique: true });
jobSchema.index({ startedAt: -1 });

export const DriveSyncJobModel = model<DriveSyncJob>(
  'DriveSyncJob',
  jobSchema,
);

export function serializeDriveSyncJob(job: DriveSyncJob) {
  return {
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    processed: job.processed,
    skipped: job.skipped,
    filesUploaded: job.filesUploaded,
    filesSkipped: job.filesSkipped,
    failures: job.failures,
    ...(job.result ? { result: job.result } : {}),
    ...(job.error ? { error: job.error } : {}),
    startedAt: job.startedAt.toISOString(),
    ...(job.lastProgressAt
      ? { lastProgressAt: job.lastProgressAt.toISOString() }
      : {}),
    ...(job.finishedAt
      ? { finishedAt: job.finishedAt.toISOString() }
      : {}),
  };
}
