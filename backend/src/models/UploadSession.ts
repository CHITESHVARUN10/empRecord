import { Schema, model, type Types } from 'mongoose';
import type { AttachmentKind } from '@bpi/shared';

export type UploadPurpose = 'create' | 'edit';
export type UploadMode = 'blob' | 'local';
export type UploadSessionStatus = 'open' | 'consumed' | 'expired';

export interface UploadDocument {
  pathname: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
}

export interface PendingUpload {
  pathname: string;
  originalName: string;
  declaredMimeType: string;
  declaredSize: number;
  createdAt: Date;
}

export interface UploadSession {
  _id: Types.ObjectId;
  sessionId: string;
  purpose: UploadPurpose;
  status: UploadSessionStatus;
  employeeId: Types.ObjectId;
  adminId?: string;
  mode: UploadMode;
  documents: Partial<Record<AttachmentKind, UploadDocument>>;
  pending: Partial<Record<AttachmentKind, PendingUpload>>;
  cleanupPathnames: string[];
  expiresAt: Date;
  consumedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const uploadDocumentSchema = new Schema<UploadDocument>(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true },
  },
  { _id: false },
);

const pendingUploadSchema = new Schema<PendingUpload>(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    declaredMimeType: { type: String, required: true },
    declaredSize: { type: Number, required: true },
    createdAt: { type: Date, required: true },
  },
  { _id: false },
);

const uploadSessionSchema = new Schema<UploadSession>(
  {
    sessionId: { type: String, required: true, unique: true },
    purpose: {
      type: String,
      enum: ['create', 'edit'],
      required: true,
    },
    status: {
      type: String,
      enum: ['open', 'consumed', 'expired'],
      default: 'open',
      required: true,
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true,
    },
    adminId: { type: String },
    mode: {
      type: String,
      enum: ['blob', 'local'],
      required: true,
    },
    documents: {
      aadhaar: { type: uploadDocumentSchema },
      pan: { type: uploadDocumentSchema },
      passport: { type: uploadDocumentSchema },
    },
    pending: {
      aadhaar: { type: pendingUploadSchema },
      pan: { type: pendingUploadSchema },
      passport: { type: pendingUploadSchema },
    },
    cleanupPathnames: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date },
  },
  { timestamps: true },
);

uploadSessionSchema.index({ status: 1, expiresAt: 1 });
uploadSessionSchema.index({ employeeId: 1, status: 1 });

export const UploadSessionModel = model<UploadSession>(
  'UploadSession',
  uploadSessionSchema,
);
