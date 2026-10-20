import "dotenv/config";
import { z } from "zod";
const booleanString = (defaultValue) => z.string().optional().transform(
  (value) => value === void 0 ? defaultValue : value === "true" || value === "1"
);
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z.coerce.number().int().positive().max(65535).default(5050),
  MONGODB_URI: z.string().min(1).default("mongodb://127.0.0.1:27017/blaupunkt_employee_records"),
  SESSION_SECRET: z.string().min(32, "SESSION_SECRET must be at least 32 characters"),
  SESSION_HOURS: z.coerce.number().positive().max(168).default(8),
  COOKIE_SECURE: booleanString(false),
  COOKIE_SAME_SITE: z.enum(["lax", "strict", "none"]).default("lax"),
  CLIENT_ORIGIN: z.string().optional().default(""),
  PUBLIC_API_URL: z.string().optional().default("http://localhost:5050"),
  STORAGE_DRIVER: z.enum(["blob", "local"]).default("blob"),
  BLOB_READ_WRITE_TOKEN: z.string().optional().default(""),
  BLOB_PREFIX: z.string().optional().default("EMP records"),
  GOOGLE_DRIVE_CREDENTIALS_FILE: z.string().optional().default(""),
  GOOGLE_SERVICE_ACCOUNT_JSON: z.string().optional().default(""),
  GOOGLE_DRIVE_FOLDER_ID: z.string().optional().default(""),
  GOOGLE_SHARED_DRIVE_ID: z.string().optional().default(""),
  GOOGLE_DRIVE_ROOT_NAME: z.string().optional().default("EMP records"),
  LOCAL_UPLOAD_DIR: z.string().optional().default(".uploads"),
  MAX_FILE_SIZE_MB: z.coerce.number().int().positive().max(25).default(5),
  UPLOAD_SESSION_HOURS: z.coerce.number().positive().max(168).default(24),
  UPLOAD_TOKEN_MINUTES: z.coerce.number().int().positive().max(60).default(15),
  CLEANUP_SECRET: z.string().optional().default(""),
  ADMIN_USERNAME: z.string().optional().default("admin"),
  ADMIN_PASSWORD: z.string().optional().default(""),
  ADMIN_DISPLAY_NAME: z.string().optional().default("HR Administrator"),
  SEED_ADMIN_ON_START: booleanString(false)
}).superRefine((value, ctx) => {
  if (value.COOKIE_SAME_SITE === "none" && !value.COOKIE_SECURE) {
    ctx.addIssue({
      code: "custom",
      path: ["COOKIE_SECURE"],
      message: "COOKIE_SECURE must be true when COOKIE_SAME_SITE is none"
    });
  }
  if (value.BLOB_PREFIX.includes("..")) {
    ctx.addIssue({
      code: "custom",
      path: ["BLOB_PREFIX"],
      message: "BLOB_PREFIX cannot contain .."
    });
  }
});
const parsed = envSchema.safeParse(process.env);
if (!parsed.success) {
  const details = parsed.error.issues.map((issue) => `${issue.path.join(".")}: ${issue.message}`).join("\n");
  console.error(`Invalid environment configuration:
${details}`);
  throw new Error("Invalid environment configuration");
}
const env = {
  ...parsed.data,
  BLOB_PREFIX: parsed.data.BLOB_PREFIX.replace(/^\/+|\/+$/g, ""),
  PUBLIC_API_URL: parsed.data.PUBLIC_API_URL.replace(/\/+$/g, "")
};
const isProduction = env.NODE_ENV === "production";
export {
  env,
  isProduction
};
