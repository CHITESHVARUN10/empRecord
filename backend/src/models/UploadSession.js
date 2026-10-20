import { Schema, model } from "mongoose";
const uploadDocumentSchema = new Schema(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true }
  },
  { _id: false }
);
const pendingUploadSchema = new Schema(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    declaredMimeType: { type: String, required: true },
    declaredSize: { type: Number, required: true },
    createdAt: { type: Date, required: true }
  },
  { _id: false }
);
const uploadSessionSchema = new Schema(
  {
    sessionId: { type: String, required: true, unique: true },
    purpose: {
      type: String,
      enum: ["create", "edit"],
      required: true
    },
    status: {
      type: String,
      enum: ["open", "consumed", "expired"],
      default: "open",
      required: true
    },
    employeeId: {
      type: Schema.Types.ObjectId,
      required: true
    },
    adminId: { type: String },
    mode: {
      type: String,
      enum: ["blob", "local"],
      required: true
    },
    documents: {
      aadhaar: { type: uploadDocumentSchema },
      pan: { type: uploadDocumentSchema },
      passport: { type: uploadDocumentSchema }
    },
    pending: {
      aadhaar: { type: pendingUploadSchema },
      pan: { type: pendingUploadSchema },
      passport: { type: pendingUploadSchema }
    },
    cleanupPathnames: { type: [String], default: [] },
    expiresAt: { type: Date, required: true },
    consumedAt: { type: Date }
  },
  { timestamps: true }
);
uploadSessionSchema.index({ status: 1, expiresAt: 1 });
uploadSessionSchema.index({ employeeId: 1, status: 1 });
const UploadSessionModel = model(
  "UploadSession",
  uploadSessionSchema
);
export {
  UploadSessionModel
};
