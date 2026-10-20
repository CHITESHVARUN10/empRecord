import { Schema, model } from "mongoose";
import {
  BLOOD_GROUPS,
  DEPARTMENTS,
  GENDERS,
  MARITAL_STATUSES,
  ORGANIZATIONS,
  buildIdentifiers
} from '#shared';
const blobMetaSchema = new Schema(
  {
    pathname: { type: String, required: true },
    originalName: { type: String, required: true },
    mimeType: { type: String, required: true },
    size: { type: Number, required: true },
    uploadedAt: { type: Date, required: true, default: Date.now },
    driveFileId: { type: String },
    driveWebViewLink: { type: String },
    driveSyncedAt: { type: Date }
  },
  { _id: false }
);
const addressSchema = new Schema(
  {
    line: { type: String, required: true, trim: true, maxlength: 200 },
    state: { type: String, required: true, trim: true, maxlength: 80 },
    city: { type: String, required: true, trim: true, maxlength: 80 },
    pincode: { type: String, required: true, trim: true, maxlength: 10 }
  },
  { _id: false }
);
const emergencyContactSchema = new Schema(
  {
    name: { type: String, required: true, trim: true, maxlength: 100 },
    relation: { type: String, required: true, trim: true, maxlength: 50 },
    mobile: { type: String, required: true, trim: true, maxlength: 20 }
  },
  { _id: false }
);
const employeeSchema = new Schema(
  {
    employeeCode: {
      type: String,
      default: "",
      trim: true,
      uppercase: true,
      maxlength: 30
    },
    organization: {
      type: String,
      required: true,
      enum: ORGANIZATIONS
    },
    fullName: { type: String, required: true, trim: true, maxlength: 100 },
    dateOfBirth: {
      type: String,
      required: true,
      match: /^\d{4}-\d{2}-\d{2}$/
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
      maxlength: 10
    },
    passportNumber: {
      type: String,
      trim: true,
      uppercase: true,
      maxlength: 12
    },
    department: { type: String, required: true, enum: DEPARTMENTS },
    joiningDate: {
      type: String,
      default: "",
      trim: true,
      maxlength: 10
    },
    permanentAddress: { type: addressSchema, required: true },
    officeMobile: { type: String, required: true, trim: true, maxlength: 20 },
    officeEmail: {
      type: String,
      trim: true,
      lowercase: true,
      maxlength: 120
    },
    presentSameAsPermanent: { type: Boolean, required: true, default: true },
    presentAddress: { type: addressSchema, required: true },
    personalMobile: { type: String, required: true, trim: true, maxlength: 20 },
    personalEmail: {
      type: String,
      required: true,
      trim: true,
      lowercase: true,
      maxlength: 120
    },
    emergencyContact: { type: emergencyContactSchema, required: true },
    attachments: {
      aadhaar: { type: blobMetaSchema, required: true },
      pan: { type: blobMetaSchema, required: true },
      passport: { type: blobMetaSchema }
    },
    driveFolderId: { type: String },
    driveFolderName: { type: String },
    driveFolderWebViewLink: { type: String },
    driveSyncedAt: { type: Date },
    identifiers: {
      type: [String],
      required: true,
      select: false
    }
  },
  { timestamps: true }
);
employeeSchema.index({ identifiers: 1 }, { unique: true, name: "uniq_identifiers" });
employeeSchema.index({ organization: 1 });
employeeSchema.index({ department: 1 });
employeeSchema.index({ createdAt: -1 });
employeeSchema.pre("validate", function() {
  this.identifiers = buildIdentifiers({
    employeeCode: this.employeeCode,
    organization: this.organization,
    personalEmail: this.personalEmail,
    personalMobile: this.personalMobile,
    officeMobile: this.officeMobile
  });
  if (this.presentSameAsPermanent) {
    this.presentAddress = {
      line: this.permanentAddress.line,
      state: this.permanentAddress.state,
      city: this.permanentAddress.city,
      pincode: this.permanentAddress.pincode
    };
  }
});
employeeSchema.set("toJSON", {
  transform: (_document, returned) => {
    delete returned.identifiers;
    delete returned.__v;
    return returned;
  }
});
const EmployeeModel = model("Employee", employeeSchema);
export {
  EmployeeModel
};
