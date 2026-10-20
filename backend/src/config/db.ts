import mongoose from 'mongoose';
import { AdminModel } from '../models/Admin';
import { DriveSyncJobModel } from '../models/DriveSyncJob';
import { EmployeeModel } from '../models/Employee';
import { UploadSessionModel } from '../models/UploadSession';
import { env } from './env';

let connectPromise: Promise<void> | null = null;

export function ensureDb(): Promise<void> {
  if (!connectPromise) {
    connectPromise = connectDb(env.MONGODB_URI).catch((error) => {
      connectPromise = null;
      throw error;
    });
  }
  return connectPromise;
}

export async function connectDb(uri: string): Promise<void> {
  mongoose.set('strictQuery', true);

  mongoose.connection.on('error', (error) => {
    console.error('MongoDB connection error:', error.message);
  });

  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10_000,
  });

  await EmployeeModel.collection
    .dropIndex('employeeCode_1')
    .catch((error: { codeName?: string; message?: string }) => {
      if (error.codeName !== 'IndexNotFound') {
        console.warn(
          'Could not drop legacy employeeCode index:',
          error.message,
        );
      }
    });

  await Promise.all([
    AdminModel.createIndexes(),
    EmployeeModel.createIndexes(),
    UploadSessionModel.createIndexes(),
    DriveSyncJobModel.createIndexes(),
  ]);
  console.info(`MongoDB connected: ${mongoose.connection.name}`);
}

export async function disconnectDb(): Promise<void> {
  connectPromise = null;
  await mongoose.disconnect();
}
