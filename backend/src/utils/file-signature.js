import { MAX_FILE_SIZE_BYTES } from '#shared';
import { HttpError } from "./http-error.js";
function detectFileType(buffer) {
  if (buffer.length >= 5 && buffer.subarray(0, 5).toString("latin1") === "%PDF-") {
    return { mimeType: "application/pdf", extension: "pdf" };
  }
  if (buffer.length >= 3 && buffer[0] === 255 && buffer[1] === 216 && buffer[2] === 255) {
    return { mimeType: "image/jpeg", extension: "jpg" };
  }
  return null;
}
function validateFileSignature(buffer, declaredMimeType, label) {
  if (buffer.length > MAX_FILE_SIZE_BYTES) {
    throw new HttpError(
      413,
      "FILE_TOO_LARGE",
      `${label} is larger than the 5 MB limit.`
    );
  }
  const detected = detectFileType(buffer);
  if (!detected) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      `${label} must be a PDF or JPEG file.`
    );
  }
  if (declaredMimeType !== detected.mimeType) {
    throw new HttpError(
      400,
      "INVALID_FILE_TYPE",
      `${label} does not match its declared file type.`
    );
  }
  return detected;
}
export {
  detectFileType,
  validateFileSignature
};
