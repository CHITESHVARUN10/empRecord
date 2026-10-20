import { Readable } from "node:stream";
import { createReadStream, promises as fs } from "node:fs";
import path from "node:path";
import { randomUUID } from "node:crypto";
import { BlobNotFoundError, del, get, put } from "@vercel/blob";
import { generateClientTokenFromReadWriteToken } from "@vercel/blob/client";
import { ACCEPTED_MIME_TYPES } from '#shared';
import { env } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
async function generateClientUploadToken(pathname) {
  if (env.STORAGE_DRIVER !== "blob") {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "Direct uploads are not enabled in local storage mode."
    );
  }
  try {
    return await generateClientTokenFromReadWriteToken({
      pathname,
      token: token(),
      allowedContentTypes: [...ACCEPTED_MIME_TYPES],
      maximumSizeInBytes: env.MAX_FILE_SIZE_MB * 1024 * 1024,
      addRandomSuffix: false,
      allowOverwrite: false,
      validUntil: Date.now() + env.UPLOAD_TOKEN_MINUTES * 60 * 1e3
    });
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(
      "Blob token generation failed:",
      error instanceof Error ? error.message : error
    );
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "The document upload could not be authorized. Please try again.",
      { cause: error }
    );
  }
}
async function inspectAttachment(pathname) {
  if (env.STORAGE_DRIVER === "local") {
    const fullPath = localPath(pathname);
    try {
      const stats = await fs.stat(fullPath);
      const handle = await fs.open(fullPath, "r");
      try {
        const buffer = Buffer.alloc(8);
        const { bytesRead } = await handle.read(buffer, 0, 8, 0);
        return {
          size: stats.size,
          head: buffer.subarray(0, bytesRead)
        };
      } finally {
        await handle.close();
      }
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return null;
      }
      console.error(
        "Local document inspection failed:",
        error instanceof Error ? error.message : error
      );
      throw new HttpError(
        502,
        "UPLOAD_FAILED",
        "The document could not be verified. Please try again.",
        { cause: error }
      );
    }
  }
  try {
    const result = await get(pathname, {
      access: "private",
      token: token()
    });
    if (!result || result.statusCode !== 200) return null;
    const stream = Readable.fromWeb(
      result.stream
    );
    const chunks = [];
    let length = 0;
    for await (const chunk of stream) {
      const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
      chunks.push(buffer);
      length += buffer.length;
      if (length >= 8) break;
    }
    stream.destroy();
    return {
      size: result.blob.size ?? 0,
      head: Buffer.concat(chunks).subarray(0, 8)
    };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    console.error(
      "Blob document inspection failed:",
      error instanceof Error ? error.message : error
    );
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "The document could not be verified. Please try again.",
      { cause: error }
    );
  }
}
function token() {
  if (!env.BLOB_READ_WRITE_TOKEN) {
    throw new HttpError(
      503,
      "STORAGE_NOT_CONFIGURED",
      "File storage is not configured. Add BLOB_READ_WRITE_TOKEN to the server environment."
    );
  }
  return env.BLOB_READ_WRITE_TOKEN;
}
function pathFor(employeeId, kind, extension) {
  const filename = `${kind}-${randomUUID()}.${extension}`;
  return [env.BLOB_PREFIX, employeeId, filename].filter(Boolean).join("/");
}
function localPath(pathname) {
  const root = path.resolve(process.cwd(), env.LOCAL_UPLOAD_DIR);
  const resolved = path.resolve(root, pathname);
  if (resolved !== root && !resolved.startsWith(`${root}${path.sep}`)) {
    throw new HttpError(400, "VALIDATION_ERROR", "Invalid document path.");
  }
  return resolved;
}
async function storeAttachment({
  buffer,
  originalName,
  employeeId,
  kind,
  detected
}) {
  const pathname = pathFor(employeeId, kind, detected.extension);
  if (env.STORAGE_DRIVER === "local") {
    try {
      const fullPath = localPath(pathname);
      await fs.mkdir(path.dirname(fullPath), { recursive: true });
      await fs.writeFile(fullPath, buffer);
      return {
        pathname,
        originalName,
        mimeType: detected.mimeType,
        size: buffer.length,
        uploadedAt: /* @__PURE__ */ new Date()
      };
    } catch (error) {
      if (error instanceof HttpError) throw error;
      console.error(
        "Local upload failed:",
        error instanceof Error ? error.message : error
      );
      throw new HttpError(
        502,
        "UPLOAD_FAILED",
        "The document could not be saved. Please try again.",
        { cause: error }
      );
    }
  }
  try {
    const result = await put(pathname, buffer, {
      access: "private",
      addRandomSuffix: false,
      contentType: detected.mimeType,
      token: token()
    });
    return {
      pathname: result.pathname,
      originalName,
      mimeType: detected.mimeType,
      size: buffer.length,
      uploadedAt: /* @__PURE__ */ new Date()
    };
  } catch (error) {
    if (error instanceof HttpError) throw error;
    console.error(
      "Blob upload failed:",
      error instanceof Error ? error.message : error
    );
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "The document could not be uploaded. Please try again.",
      { cause: error }
    );
  }
}
async function openAttachment(pathname) {
  if (env.STORAGE_DRIVER === "local") {
    const fullPath = localPath(pathname);
    try {
      const stats = await fs.stat(fullPath);
      return {
        stream: createReadStream(fullPath),
        size: stats.size
      };
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return null;
      }
      console.error(
        "Local download failed:",
        error instanceof Error ? error.message : error
      );
      throw new HttpError(
        502,
        "UPLOAD_FAILED",
        "The document could not be opened. Please try again.",
        { cause: error }
      );
    }
  }
  try {
    const result = await get(pathname, {
      access: "private",
      token: token()
    });
    if (!result || result.statusCode !== 200) return null;
    return {
      stream: Readable.fromWeb(
        result.stream
      ),
      size: result.blob.size ?? 0
    };
  } catch (error) {
    if (error instanceof BlobNotFoundError) return null;
    console.error(
      "Blob download failed:",
      error instanceof Error ? error.message : error
    );
    throw new HttpError(
      502,
      "UPLOAD_FAILED",
      "The document could not be opened. Please try again.",
      { cause: error }
    );
  }
}
async function removeAttachment(pathname) {
  if (env.STORAGE_DRIVER === "local") {
    try {
      const fullPath = localPath(pathname);
      await fs.unlink(fullPath);
      await fs.rmdir(path.dirname(fullPath)).catch(() => void 0);
      return true;
    } catch (error) {
      if (typeof error === "object" && error !== null && "code" in error && error.code === "ENOENT") {
        return true;
      }
      console.warn(
        "Could not remove local document:",
        error instanceof Error ? error.message : error
      );
      return false;
    }
  }
  try {
    await del(pathname, { token: token() });
    return true;
  } catch (error) {
    if (error instanceof BlobNotFoundError) return true;
    console.warn(
      "Could not remove blob:",
      error instanceof Error ? error.message : error
    );
    return false;
  }
}
export {
  generateClientUploadToken,
  inspectAttachment,
  openAttachment,
  removeAttachment,
  storeAttachment
};
