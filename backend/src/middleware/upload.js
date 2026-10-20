import path from "node:path";
import multer from "multer";
import {
  MAX_FILE_SIZE_BYTES,
  employeeSchema
} from '#shared';
import { HttpError } from "../utils/http-error.js";
const allowedExtensions = /* @__PURE__ */ new Set([".pdf", ".jpg", ".jpeg"]);
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: MAX_FILE_SIZE_BYTES,
    files: 1,
    fields: 10,
    fieldSize: 256 * 1024
  },
  fileFilter: (_request, file, callback) => {
    const extension = path.extname(file.originalname).toLowerCase();
    const mimeAllowed = file.mimetype === "application/pdf" || file.mimetype === "image/jpeg";
    if (!mimeAllowed || !allowedExtensions.has(extension)) {
      callback(
        new HttpError(
          400,
          "INVALID_FILE_TYPE",
          "Documents must be PDF or JPEG files."
        )
      );
      return;
    }
    callback(null, true);
  }
});
const localUpload = upload.single("file");
function parseEmployeeData(raw) {
  const result = employeeSchema.safeParse(raw);
  if (!result.success) {
    const fields = {};
    for (const issue of result.error.issues) {
      const key = issue.path.length ? issue.path.join(".") : "form";
      if (!fields[key]) fields[key] = issue.message;
    }
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Please correct the highlighted fields.",
      { fields }
    );
  }
  return result.data;
}
export {
  localUpload,
  parseEmployeeData
};
