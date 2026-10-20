import mongoose from "mongoose";
import { AdminModel } from "../models/Admin.js";
import { DriveSyncJobModel } from "../models/DriveSyncJob.js";
import { EmployeeModel } from "../models/Employee.js";
import { UploadSessionModel } from "../models/UploadSession.js";
import { env } from "./env.js";
let connectPromise = null;
function ensureDb() {
  if (!connectPromise) {
    connectPromise = connectDb(env.MONGODB_URI).catch((error) => {
      connectPromise = null;
      throw error;
    });
  }
  return connectPromise;
}
async function connectDb(uri) {
  mongoose.set("strictQuery", true);
  mongoose.connection.on("error", (error) => {
    console.error("MongoDB connection error:", error.message);
  });
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 1e4
  });
  await EmployeeModel.collection.dropIndex("employeeCode_1").catch((error) => {
    if (error.codeName !== "IndexNotFound") {
      console.warn(
        "Could not drop legacy employeeCode index:",
        error.message
      );
    }
  });
  await Promise.all([
    AdminModel.createIndexes(),
    EmployeeModel.createIndexes(),
    UploadSessionModel.createIndexes(),
    DriveSyncJobModel.createIndexes()
  ]);
  console.info(`MongoDB connected: ${mongoose.connection.name}`);
}
async function disconnectDb() {
  connectPromise = null;
  await mongoose.disconnect();
}
export {
  connectDb,
  disconnectDb,
  ensureDb
};
