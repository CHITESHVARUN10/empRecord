import { Schema, model } from "mongoose";
const failureSchema = new Schema(
  {
    employeeId: { type: String, required: true },
    employeeName: { type: String, required: true },
    kind: { type: String },
    message: { type: String, required: true }
  },
  { _id: false }
);
const jobSchema = new Schema(
  {
    jobId: { type: String, required: true },
    status: {
      type: String,
      required: true,
      enum: ["running", "completed", "failed"],
      default: "running"
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
    finishedAt: { type: Date }
  },
  { versionKey: false }
);
jobSchema.index({ jobId: 1 }, { unique: true });
jobSchema.index({ startedAt: -1 });
const DriveSyncJobModel = model(
  "DriveSyncJob",
  jobSchema
);
function serializeDriveSyncJob(job) {
  return {
    jobId: job.jobId,
    status: job.status,
    total: job.total,
    processed: job.processed,
    skipped: job.skipped,
    filesUploaded: job.filesUploaded,
    filesSkipped: job.filesSkipped,
    failures: job.failures,
    ...job.result ? { result: job.result } : {},
    ...job.error ? { error: job.error } : {},
    startedAt: job.startedAt.toISOString(),
    ...job.lastProgressAt ? { lastProgressAt: job.lastProgressAt.toISOString() } : {},
    ...job.finishedAt ? { finishedAt: job.finishedAt.toISOString() } : {}
  };
}
export {
  DriveSyncJobModel,
  serializeDriveSyncJob
};
