import { randomUUID } from "node:crypto";
import { connectDb, disconnectDb } from "../config/db.js";
import { env } from "../config/env.js";
import { DriveSyncJobModel } from "../models/DriveSyncJob.js";
import { EmployeeModel } from "../models/Employee.js";
import { runDriveSyncJob } from "../services/google-drive.service.js";

async function main() {
  await connectDb(env.MONGODB_URI);
  const staleBefore = new Date(Date.now() - 15 * 60 * 1e3);
  const running = await DriveSyncJobModel.findOne({
    status: "running",
    lastProgressAt: { $gte: staleBefore }
  });
  if (running) {
    throw new Error(
      `A Drive sync is already running: ${running.jobId}`
    );
  }
  const total = await EmployeeModel.countDocuments({});
  if (total === 0) {
    throw new Error("There are no employee records to upload.");
  }
  const job = await DriveSyncJobModel.create({
    jobId: randomUUID(),
    status: "running",
    total,
    processed: 0,
    skipped: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    failures: [],
    startedAt: new Date(),
    lastProgressAt: new Date()
  });
  console.log(
    JSON.stringify({ jobId: job.jobId, total, status: "started" })
  );
  await runDriveSyncJob(job.jobId);
  const finished = await DriveSyncJobModel.findOne({
    jobId: job.jobId
  }).lean();
  console.log(
    JSON.stringify(
      {
        jobId: job.jobId,
        status: finished?.status,
        total: finished?.total,
        processed: finished?.processed,
        skipped: finished?.skipped,
        filesUploaded: finished?.filesUploaded,
        filesSkipped: finished?.filesSkipped,
        failures: finished?.failures ?? [],
        result: finished?.result ?? null,
        error: finished?.error ?? null
      },
      null,
      2
    )
  );
  if (finished?.status !== "completed" || (finished?.failures?.length ?? 0) > 0) {
    process.exitCode = 1;
  }
  await disconnectDb();
}
main().catch(async (error) => {
  console.error(error);
  await disconnectDb().catch(() => void 0);
  process.exitCode = 1;
});
