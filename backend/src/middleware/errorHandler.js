import multer from "multer";
import { isProduction } from "../config/env.js";
import { HttpError } from "../utils/http-error.js";
function notFoundHandler(request, response) {
  response.status(404).json({
    error: {
      code: "NOT_FOUND",
      message: `No route matches ${request.method} ${request.path}.`
    }
  });
}
function mongooseValidationFields(error) {
  const fields = {};
  for (const [key, value] of Object.entries(error.errors ?? {})) {
    fields[key] = value.message ?? "Invalid value";
  }
  return fields;
}
function errorHandler(error, _request, response, next) {
  if (response.headersSent) {
    next(error);
    return;
  }
  if (error instanceof HttpError) {
    response.status(error.status).json({
      error: {
        code: error.code,
        message: error.message,
        ...error.fields ? { fields: error.fields } : {},
        ...error.conflicts ? { conflicts: error.conflicts } : {}
      }
    });
    return;
  }
  if (error instanceof multer.MulterError) {
    if (error.code === "LIMIT_FILE_SIZE") {
      response.status(413).json({
        error: {
          code: "FILE_TOO_LARGE",
          message: "Each document must be 5 MB or smaller."
        }
      });
      return;
    }
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: error.code === "LIMIT_FILE_COUNT" ? "Too many documents were attached." : "The documents could not be processed."
      }
    });
    return;
  }
  if (typeof error === "object" && error !== null && "name" in error && error.name === "ValidationError") {
    const fields = mongooseValidationFields(
      error
    );
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "Please correct the highlighted fields.",
        fields
      }
    });
    return;
  }
  if (typeof error === "object" && error !== null && "name" in error && error.name === "CastError") {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request contains an invalid value."
      }
    });
    return;
  }
  if (typeof error === "object" && error !== null && "code" in error && error.code === 11e3) {
    response.status(409).json({
      error: {
        code: "DUPLICATE_ENTRY",
        message: "This entry matches an existing employee record."
      }
    });
    return;
  }
  if (error instanceof SyntaxError && "body" in error) {
    response.status(400).json({
      error: {
        code: "VALIDATION_ERROR",
        message: "The request body could not be read."
      }
    });
    return;
  }
  console.error(
    "Unhandled request error:",
    error instanceof Error ? error.stack ?? error.message : error
  );
  response.status(500).json({
    error: {
      code: "INTERNAL",
      message: isProduction ? "Something went wrong. Please try again." : error instanceof Error ? error.message : "Something went wrong."
    }
  });
}
export {
  errorHandler,
  notFoundHandler
};
