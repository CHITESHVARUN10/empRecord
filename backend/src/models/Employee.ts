import { Schema, model, type Types } from 'mongoose';
import {
  BLOOD_GROUPS,
  DEPARTMENTS,
  GENDERS,
  MARITAL_STATUSES,
  ORGANIZATIONS,
  buildIdentifiers,
} from '@bpi/shared';

export interface BlobMeta {
  pathname: string;
  originalName: string;
  mimeType: string;
  size: number;
  uploadedAt: Date;
  driveFileId?: string;
  driveWebViewLink?: string;
  driveSyncedAt?: Date;
}

export interface Address {
  line: string;
  state: string;
  city: string;
  pincode: string;
}

export interface EmergencyContact {
  name: string;
  relation: string;
  mobile: string;
}

export interface EmployeeAttachments {
  aadhaar: BlobMeta;
  pan: BlobMeta;
  passport?: BlobMeta;
}

export interface Employee {
  _id: Types.ObjectId;
  employeeCode: string;
  organization: string;
  fullName: string;
  dateOfBirth: string;
  gender: (typeof GENDERS)[number];
  nationality: string;
  maritalStatus: (typeof MARITAL_STATUSES)[number];
  bloodGroup: (typeof BLOOD_GROUPS)[number];
  nominee: string;
  aadhaarNumber: string;
  panNumber: string;
  passportNumber?: string;
  department: (typeof DEPARTMENTS)[number];
  joiningDate: string;
  permanentAddress: Address;
  officeMobile: string;
  officeEmail?: string;
  presentSameAsPermanent: boolean;
  presentAddress: Address;
  personalMobile: string;
  personalEmail: string;
  emergencyContact: EmergencyContact;
  attachments: EmployeeAttachments;
  driveFolderId?: string;
  driveFolderName?: string;
  driveFolderWebViewLink?: string;
  driveSyncedAt?: Date;
  identifiers: string[];
  createdAt: Date;
  updatedAt: Date;
}

const blobMetaSchema = new Schema<BlobMeta>(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true, default: Date.now },
    driveFileId: { type: String },
    driveWebViewLink: { type: String },
    driveSyncedAt: { type: Date },
  },
  { _id: false },
);

const addressSchema = new Schema<Address>(
  {
    line: { type: String, required: true, trim: true, maxlength: 200 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 10 },
  },
  { _id: false },
);

const emergencyContactSchema = new Schema<EmergencyContact>(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    relation: { type: String, required: true, trim: true, maxlength: 50 },
    mobile: { type: String, required: true, trim: true, maxlength: 20 },
  },
  { _id: false },
);

const employeeSchema = new Schema<Employee>(
  {
    employeeCode: {
      type: String,
      default: '',
      trim: true,
      uppercase: true,
      maxlength: 30,
    },
    organization: {
      type: String,
      required: true,
      enum: ORGANIZATIONS,
    },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/,
    },
    gender: { type: String, required: true, enum: GENDERS },
    nationality: { type: String, required: true, trim: true, maxlength: 56 },
    maritalStatus: { type: String, required: true, enum: MARITAL_STATUSES },
    bloodGroup: { type: String, required: true, enum: BLOOD_GROUPS },
    nominee: { type: String, required: true, trim: true, maxlength: 100 },
    aadhaarNumber: { type: String, required: true, trim: true, maxlength: 20 },
    panNumber: {
      type: String,
      required: true,
      trim: true,
      uppercase: true,
      maxlength: 10,
    },
    passportNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 12,
    },
    department: { type: String, required: true, enum: DEPARTMENTS },
    joiningDate: {
      type: String,
      default: '',
      trim: true,
      maxlength: 10,
    },
    permanentAddress: { type: addressSchema, required: true },
    officeMobile: { type: String, required: true, trim: true, maxlength: 20 },
    officeEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    presentSameAsPermanent: { type: Boolean, required: true, default: true },
    presentAddress: { type: addressSchema, required: true },
    personalMobile: { type: String, required: true, trim: true, maxlength: 20 },
    personalEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120,
    },
    emergencyContact: { type: emergencyContactSchema, required: true },
    attachments: {
      aadhaar: { type: blobMetaSchema, required: true },
      pan: { type: blobMetaSchema, required: true },
      passport: { type: blobMetaSchema },
    },
    driveFolderId: { type: String },
    driveFolderName: { type: String },
    driveFolderWebViewLink: { type: String },
    driveSyncedAt: { type: Date },
    identifiers: {
      type: [String],
      required: true,
      select: false,
    },
  },
  { timestamps: true },
);

employeeSchema.index({ identifiers: 1 }, { unique: true, name: 'uniq_identifiers' });
employeeSchema.index({ organization: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ createdAt: -1 });

employeeSchema.pre('validate', function () {
  this.identifiers = buildIdentifiers({
    employeeCode: this.employeeCode,
    personalEmail: this.personalEmail,
    personalMobile: this.personalMobile,
    officeMobile: this.officeMobile,
  });

  if (this.presentSameAsPermanent) {
    this.presentAddress = {
      line: this.permanentAddress.line,
      state: this.permanentAddress.state,
      city: this.permanentAddress.city,
      pincode: this.permanentAddress.pincode,
    };
  }
});

employeeSchema.set('toJSON', {
  transform: (_document, returned) => {
    delete (returned as { identifiers?: string[] }).identifiers;
    delete (returned as { __v?: number }).__v;
    return returned;
  },
});

export const EmployeeModel = model<Employee>('Employee', employeeSchema);
