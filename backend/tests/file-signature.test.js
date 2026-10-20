import { describe, expect, it } from "vitest";
import { MAX_FILE_SIZE_BYTES } from '#shared';
import {
  detectFileType,
  validateFileSignature
} from "../src/utils/file-signature.js";
import { HttpError } from "../src/utils/http-error.js";
const pdf = Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n%%EOF");
const jpeg = Buffer.from([255, 216, 255, 224, 0, 16, 74]);
describe("file signatures", () => {
  it("detects PDF and JPEG content", () => {
    expect(detectFileType(pdf)).toEqual({
      mimeType: "application/pdf",
      extension: "pdf"
    });
    expect(detectFileType(jpeg)).toEqual({
      mimeType: "image/jpeg",
      extension: "jpg"
    });
  });
  it("rejects unknown content", () => {
    expect(detectFileType(Buffer.from("not a document"))).toBeNull();
  });
  it("rejects a declared type that does not match the bytes", () => {
    expect(
      () => validateFileSignature(pdf, "image/jpeg", "Aadhaar document")
    ).toThrow(HttpError);
  });
  it("rejects a file above the size limit", () => {
    const oversized = Buffer.alloc(MAX_FILE_SIZE_BYTES + 1, 0);
    try {
      validateFileSignature(oversized, "application/pdf", "Aadhaar document");
      throw new Error("expected validation to fail");
    } catch (error) {
      expect(error).toBeInstanceOf(HttpError);
      expect(error.code).toBe("FILE_TOO_LARGE");
    }
  });
});
