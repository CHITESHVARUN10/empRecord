import { Schema, model } from 'mongoose';

export interface Admin {
  _id: string;
  username: string;
  passwordHash: string;
  displayName: string;
  lastLoginAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

const adminSchema = new Schema<Admin>(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80,
    },
    passwordHash: {
      type: String,
      required: true,
      select: false,
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100,
    },
    lastLoginAt: {
      type: Date,
    },
  },
  { timestamps: true },
);

export const AdminModel = model<Admin>('Admin', adminSchema);
