import { Schema, model } from "mongoose";
const adminSchema = new Schema(
  {
    username: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      maxlength: 80
    },
    passwordHash: {
      type: String,
      required: true,
      select: false
    },
    displayName: {
      type: String,
      required: true,
      trim: true,
      maxlength: 100
    },
    lastLoginAt: {
      type: Date
    }
  },
  { timestamps: true }
);
const AdminModel = model("Admin", adminSchema);
export {
  AdminModel
};
