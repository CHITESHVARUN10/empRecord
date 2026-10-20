import { createSign, randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import path from "node:path";
import { waitUntil } from "@vercel/functions";
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_LABELS
} from '#shared';
import { env } from "../config/env.js";
import {
  DriveSyncJobModel,
  serializeDriveSyncJob
} from "../models/DriveSyncJob.js";
import {
  EmployeeModel
} from "../models/Employee.js";
import { HttpError } from "../utils/http-error.js";
import { buildEmployeeCsv } from "./csv.service.js";
import { openAttachment } from "./storage.service.js";
const DRIVE_API = "https://www.googleapis.com/drive/v3";
const DRIVE_UPLOAD_API = "https://www.googleapis.com/upload/drive/v3";
const DRIVE_SCOPE = "https://www.googleapis.com/auth/drive";
const FOLDER_MIME = "application/vnd.google-apps.folder";
const CSV_MIME = "text/csv";
let cachedKey = null;
let cachedToken = null;
function encodeBase64Url(value) {
  return Buffer.from(value).toString("base64url");
}
function credentialPath(file) {
  if (path.isAbsolute(file)) return file;
  const candidates = [
    path.resolve(process.cwd(), file),
    path.resolve(process.cwd(), "backend", file)
  ];
  const found = candidates.find((candidate) => existsSync(candidate));
  return found ?? candidates[0];
}
function loadServiceAccount() {
  if (cachedKey) return cachedKey;
  let raw = env.GOOGLE_SERVICE_ACCOUNT_JSON.trim();
  if (!raw && env.GOOGLE_DRIVE_CREDENTIALS_FILE) {
    const file = credentialPath(env.GOOGLE_DRIVE_CREDENTIALS_FILE);
    if (!existsSync(file)) {
      throw new HttpError(
        503,
        "DRIVE_NOT_CONFIGURED",
        "The Google Drive credentials file was not found."
      );
    }
    raw = readFileSync(file, "utf8");
  }
  if (!raw) {
    throw new HttpError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "Google Drive is not configured. Add GOOGLE_DRIVE_CREDENTIALS_FILE or GOOGLE_SERVICE_ACCOUNT_JSON to the server environment."
    );
  }
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new HttpError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "The Google Drive credentials are not valid JSON."
    );
  }
  if (!parsed.client_email || !parsed.private_key || !parsed.token_uri) {
    throw new HttpError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "The Google Drive service account is missing required fields."
    );
  }
  cachedKey = {
    client_email: parsed.client_email,
    private_key: parsed.private_key,
    token_uri: parsed.token_uri
  };
  return cachedKey;
}
async function accessToken(force = false) {
  if (!force && cachedToken && cachedToken.expiresAt > Date.now() + 6e4) {
    return cachedToken.value;
  }
  const key = loadServiceAccount();
  const issuedAt = Math.floor(Date.now() / 1e3);
  const header = encodeBase64Url(
    JSON.stringify({ alg: "RS256", typ: "JWT" })
  );
  const claim = encodeBase64Url(
    JSON.stringify({
      iss: key.client_email,
      scope: DRIVE_SCOPE,
      aud: key.token_uri,
      iat: issuedAt,
      exp: issuedAt + 3600
    })
  );
  const unsigned = `${header}.${claim}`;
  let assertion;
  try {
    const signer = createSign("RSA-SHA256");
    signer.update(unsigned);
    signer.end();
    assertion = `${unsigned}.${signer.sign(key.private_key).toString("base64url")}`;
  } catch {
    throw new HttpError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "The Google Drive service account private key could not be read."
    );
  }
  const response = await fetch(key.token_uri, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion
    })
  });
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) {
    throw new HttpError(
      502,
      "DRIVE_AUTH_FAILED",
      body?.error_description || body?.error || "Google Drive authentication failed."
    );
  }
  const expiresIn = Number(body.expires_in ?? 3600);
  cachedToken = {
    value: body.access_token,
    expiresAt: Date.now() + Math.max(60, expiresIn - 120) * 1e3
  };
  return body.access_token;
}
async function driveResponse(url, init = {}, retry = true) {
  const token = await accessToken();
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${token}`);
  const response = await fetch(url, { ...init, headers });
  if (response.status === 401 && retry) {
    cachedToken = null;
    return driveResponse(url, init, false);
  }
  return response;
}
function googleErrorMessage(body, fallback) {
  if (typeof body === "object" && body !== null && "error" in body && typeof body.error === "object") {
    const error = body.error;
    if (typeof error.message === "string" && error.message.trim()) {
      return error.message.slice(0, 400);
    }
  }
  return fallback;
}
async function driveJson(url, init = {}) {
  const response = await driveResponse(url, init);
  const text = await response.text();
  let body = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = null;
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "DRIVE_SYNC_FAILED",
      googleErrorMessage(body, `Google Drive request failed (${response.status}).`)
    );
  }
  return body;
}
function escapeQuery(value) {
  return value.replace(/\\/g, "\\\\").replace(/'/g, "\\'");
}
function scopeParams(driveId) {
  return driveId ? {
    corpora: "drive",
    driveId,
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true"
  } : {
    corpora: "allDrives",
    includeItemsFromAllDrives: "true",
    supportsAllDrives: "true"
  };
}
async function listFiles(query, driveId) {
  const url = new URL(`${DRIVE_API}/files`);
  url.searchParams.set("q", query);
  url.searchParams.set(
    "fields",
    "files(id,name,webViewLink,appProperties,driveId,parents)"
  );
  url.searchParams.set("pageSize", "100");
  for (const [key, value] of Object.entries(scopeParams(driveId))) {
    url.searchParams.set(key, value);
  }
  const body = await driveJson(url.toString());
  return body.files ?? [];
}
async function getFile(fileId, fields = "id,name,webViewLink,driveId,parents,mimeType") {
  const url = new URL(`${DRIVE_API}/files/${encodeURIComponent(fileId)}`);
  url.searchParams.set("fields", fields);
  url.searchParams.set("supportsAllDrives", "true");
  return driveJson(url.toString());
}
async function createFolder(input) {
  return driveJson(
    `${DRIVE_API}/files?supportsAllDrives=true&fields=id,name,webViewLink,driveId,parents`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: input.name,
        mimeType: FOLDER_MIME,
        parents: [input.parentId],
        ...input.appProperties ? { appProperties: input.appProperties } : {}
      })
    }
  );
}
async function resolveRootFolder() {
  if (env.GOOGLE_DRIVE_FOLDER_ID) {
    try {
      const folder = await getFile(env.GOOGLE_DRIVE_FOLDER_ID);
      if (folder.mimeType !== FOLDER_MIME) {
        throw new HttpError(
          503,
          "DRIVE_NOT_CONFIGURED",
          "GOOGLE_DRIVE_FOLDER_ID must point to a Google Drive folder."
        );
      }
      return folder;
    } catch (error) {
      if (error instanceof HttpError) throw error;
      throw new HttpError(
        502,
        "DRIVE_SYNC_FAILED",
        "The configured Google Drive folder could not be opened."
      );
    }
  }
  const drives = await driveJson(
    `${DRIVE_API}/drives?pageSize=100`
  );
  const driveId = env.GOOGLE_SHARED_DRIVE_ID || drives.drives?.[0]?.id || "";
  if (!driveId) {
    throw new HttpError(
      503,
      "DRIVE_NOT_CONFIGURED",
      "No Google shared drive was found. Share a folder with the service account and set GOOGLE_DRIVE_FOLDER_ID."
    );
  }
  const rootName = env.GOOGLE_DRIVE_ROOT_NAME;
  const existing = await listFiles(
    `name = '${escapeQuery(rootName)}' and mimeType = '${FOLDER_MIME}' and trashed = false`,
    driveId
  );
  const found = existing.find((file) => file.name === rootName);
  if (found) return found;
  return createFolder({
    name: rootName,
    parentId: driveId
  });
}
function safeDriveName(value) {
  return value.replace(/[\u0000-\u001F\\/:*?"<>|]/g, "-").replace(/\s+/g, " ").trim().slice(0, 120);
}
function employeeFolderName(employee) {
  const code = employee.employeeCode?.trim() || "NO-CODE";
  return safeDriveName(`${code} - ${employee.fullName}`) || `Employee ${String(employee._id)}`;
}
function attachmentFileName(kind, meta) {
  return safeDriveName(`${ATTACHMENT_LABELS[kind]} - ${meta.originalName}`) || `${kind}.${meta.mimeType === "application/pdf" ? "pdf" : "jpg"}`;
}
function attachmentIsSynced(meta) {
  return Boolean(
    meta?.driveFileId && meta.driveWebViewLink && meta.driveSyncedAt && meta.driveSyncedAt.getTime() >= meta.uploadedAt.getTime()
  );
}
function countAttachments(employee) {
  return ATTACHMENT_KINDS.filter(
    (kind) => Boolean(employee.attachments?.[kind])
  ).length;
}
function employeeIsFullySynced(employee) {
  if (!employee.driveFolderId || !employee.driveFolderWebViewLink || employee.driveFolderName !== employeeFolderName(employee)) {
    return false;
  }
  return ATTACHMENT_KINDS.every((kind) => {
    const meta = employee.attachments?.[kind];
    return !meta || attachmentIsSynced(meta);
  });
}
async function ensureEmployeeFolder(root, employee) {
  const employeeId = String(employee._id);
  const query = [
    `appProperties has { key='employeeId' and value='${escapeQuery(employeeId)}' }`,
    `mimeType = '${FOLDER_MIME}'`,
    `'${escapeQuery(root.id)}' in parents`,
    "trashed = false"
  ].join(" and ");
  const found = await listFiles(query, root.driveId);
  const name = employeeFolderName(employee);
  if (found[0]) {
    const folder = found[0];
    if (folder.name !== name) {
      const updated = await driveJson(
        `${DRIVE_API}/files/${encodeURIComponent(folder.id)}?supportsAllDrives=true&fields=id,name,webViewLink,driveId,parents`,
        {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ name })
        }
      );
      return updated;
    }
    return folder;
  }
  return createFolder({
    name,
    parentId: root.id,
    appProperties: { employeeId }
  });
}
async function findAttachmentFile(folderId, employeeId, kind, driveId) {
  const query = [
    `appProperties has { key='employeeId' and value='${escapeQuery(employeeId)}' }`,
    `appProperties has { key='attachmentKind' and value='${kind}' }`,
    `'${escapeQuery(folderId)}' in parents`,
    "trashed = false"
  ].join(" and ");
  const files = await listFiles(query, driveId);
  return files[0];
}
function multipartBody(metadata, mimeType, buffer) {
  const boundary = `bpi-${randomUUID()}`;
  const head = Buffer.from(
    `--${boundary}\r
Content-Type: application/json; charset=UTF-8\r
\r
${JSON.stringify(
      metadata
    )}\r
--${boundary}\r
Content-Type: ${mimeType}\r
\r
`
  );
  const tail = Buffer.from(`\r
--${boundary}--`);
  return {
    boundary,
    body: new Uint8Array(Buffer.concat([head, buffer, tail]))
  };
}
async function writeDriveFile(input) {
  const metadata = {
    name: input.name,
    appProperties: input.appProperties,
    ...input.fileId ? {} : { mimeType: input.mimeType, parents: [input.folderId] }
  };
  const { boundary, body } = multipartBody(
    metadata,
    input.mimeType,
    input.buffer
  );
  const url = input.fileId ? `${DRIVE_UPLOAD_API}/files/${encodeURIComponent(
    input.fileId
  )}?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink` : `${DRIVE_UPLOAD_API}/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,webViewLink`;
  const response = await driveResponse(url, {
    method: input.fileId ? "PATCH" : "POST",
    headers: {
      "Content-Type": `multipart/related; boundary=${boundary}`
    },
    body
  });
  const text = await response.text();
  let parsed = null;
  try {
    parsed = text ? JSON.parse(text) : null;
  } catch {
    parsed = null;
  }
  if (response.status === 404 && input.fileId) {
    return writeDriveFile({ ...input, fileId: void 0 });
  }
  if (!response.ok) {
    throw new HttpError(
      502,
      "DRIVE_SYNC_FAILED",
      googleErrorMessage(
        parsed,
        `Google Drive upload failed (${response.status}).`
      )
    );
  }
  return parsed;
}
async function readAttachmentBuffer(meta) {
  const result = await openAttachment(meta.pathname);
  if (!result) return null;
  const chunks = [];
  for await (const chunk of result.stream) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }
  return Buffer.concat(chunks);
}
async function syncAttachment(employee, folder, root, kind) {
  const meta = employee.attachments?.[kind];
  if (!meta) return "skipped";
  if (attachmentIsSynced(meta)) return "skipped";
  const employeeId = String(employee._id);
  const buffer = await readAttachmentBuffer(meta);
  if (!buffer) {
    throw new Error("The source document was not found in file storage.");
  }
  let fileId = meta.driveFileId;
  if (!fileId) {
    const existing = await findAttachmentFile(
      folder.id,
      employeeId,
      kind,
      root.driveId
    );
    fileId = existing?.id;
  }
  const file = await writeDriveFile({
    fileId,
    folderId: folder.id,
    name: attachmentFileName(kind, meta),
    mimeType: meta.mimeType,
    buffer,
    appProperties: {
      employeeId,
      attachmentKind: kind
    }
  });
  await EmployeeModel.updateOne(
    { _id: employee._id },
    {
      $set: {
        [`attachments.${kind}.driveFileId`]: file.id,
        [`attachments.${kind}.driveWebViewLink`]: file.webViewLink,
        [`attachments.${kind}.driveSyncedAt`]: /* @__PURE__ */ new Date()
      }
    }
  );
  return "uploaded";
}
async function syncMasterCsv(root, csv) {
  const query = [
    "appProperties has { key='masterCsv' and value='true' }",
    `'${escapeQuery(root.id)}' in parents`,
    "trashed = false"
  ].join(" and ");
  const found = await listFiles(query, root.driveId);
  const buffer = Buffer.from(csv, "utf8");
  return writeDriveFile({
    fileId: found[0]?.id,
    folderId: root.id,
    name: "Employee Records.csv",
    mimeType: CSV_MIME,
    buffer,
    appProperties: { masterCsv: "true" }
  });
}
function errorMessage(error) {
  return error instanceof Error ? error.message : "The Google Drive upload failed.";
}
async function runDriveSyncJob(jobId) {
  const job = await DriveSyncJobModel.findOne({ jobId });
  if (!job || job.status !== "running") return;
  try {
    const employees = await EmployeeModel.find({}).sort({ createdAt: 1 }).lean();
    const total = employees.length;
    await DriveSyncJobModel.updateOne(
      { jobId },
      { $set: { total } }
    );
    if (total === 0) {
      throw new Error("There are no employee records to upload.");
    }
    const root = await resolveRootFolder();
    const failures = [];
    let processed = 0;
    let skipped = 0;
    let filesUploaded = 0;
    let filesSkipped = 0;
    for (const employee of employees) {
      const employeeId = String(employee._id);
      try {
        if (employeeIsFullySynced(employee)) {
          skipped += 1;
          filesSkipped += countAttachments(employee);
        } else {
          const folder = await ensureEmployeeFolder(root, employee);
          const folderName = employeeFolderName(employee);
          await EmployeeModel.updateOne(
            { _id: employee._id },
            {
              $set: {
                driveFolderId: folder.id,
                driveFolderName: folderName,
                driveFolderWebViewLink: folder.webViewLink,
                driveSyncedAt: /* @__PURE__ */ new Date()
              }
            }
          );
          for (const kind of ATTACHMENT_KINDS) {
            if (!employee.attachments?.[kind]) continue;
            try {
              const result2 = await syncAttachment(
                employee,
                folder,
                root,
                kind
              );
              if (result2 === "uploaded") filesUploaded += 1;
              else filesSkipped += 1;
            } catch (error) {
              failures.push({
                employeeId,
                employeeName: employee.fullName,
                kind,
                message: errorMessage(error)
              });
            }
          }
        }
      } catch (error) {
        failures.push({
          employeeId,
          employeeName: employee.fullName,
          message: errorMessage(error)
        });
      }
      processed += 1;
      await DriveSyncJobModel.updateOne(
        { jobId },
        {
          $set: {
            processed,
            skipped,
            filesUploaded,
            filesSkipped,
            failures,
            lastProgressAt: /* @__PURE__ */ new Date()
          }
        }
      );
    }
    const fresh = await EmployeeModel.find({}).sort({ createdAt: 1 }).lean();
    const csvFile = await syncMasterCsv(
      root,
      buildEmployeeCsv(fresh, env.PUBLIC_API_URL)
    );
    const result = {
      rootFolderId: root.id,
      rootFolderWebViewLink: root.webViewLink,
      csvFileId: csvFile.id,
      csvWebViewLink: csvFile.webViewLink,
      employees: total,
      skippedEmployees: skipped,
      files: filesUploaded,
      skippedFiles: filesSkipped,
      failures,
      syncedAt: (/* @__PURE__ */ new Date()).toISOString()
    };
    await DriveSyncJobModel.updateOne(
      { jobId },
      {
        $set: {
          status: "completed",
          processed: total,
          skipped,
          filesUploaded,
          filesSkipped,
          failures,
          result,
          finishedAt: /* @__PURE__ */ new Date()
        }
      }
    );
  } catch (error) {
    const latest = await DriveSyncJobModel.findOne({ jobId });
    await DriveSyncJobModel.updateOne(
      { jobId, status: "running" },
      {
        $set: {
          status: "failed",
          error: errorMessage(error),
          failures: latest?.failures ?? [],
          finishedAt: /* @__PURE__ */ new Date()
        }
      }
    );
  }
}
async function startDriveSyncJob() {
  const staleBefore = new Date(Date.now() - 15 * 60 * 1e3);
  await DriveSyncJobModel.updateMany(
    {
      status: "running",
      $or: [
        { lastProgressAt: { $lt: staleBefore } },
        {
          lastProgressAt: { $exists: false },
          startedAt: { $lt: staleBefore }
        }
      ]
    },
    {
      $set: {
        status: "failed",
        error: "The previous Drive upload was interrupted.",
        finishedAt: /* @__PURE__ */ new Date()
      }
    }
  );
  const existing = await DriveSyncJobModel.findOne({
    status: "running"
  }).sort({ startedAt: -1 });
  if (existing) return serializeDriveSyncJob(existing);
  const total = await EmployeeModel.countDocuments({});
  if (total === 0) {
    throw new HttpError(
      400,
      "VALIDATION_ERROR",
      "There are no employee records to upload."
    );
  }
  const job = await DriveSyncJobModel.create({
    jobId: randomUUID(),
    status: "running",
    total,
    processed: 0,
    skipped: 0,
    filesUploaded: 0,
    filesSkipped: 0,
    failures: [],
    startedAt: /* @__PURE__ */ new Date(),
    lastProgressAt: /* @__PURE__ */ new Date()
  });
  const jobPromise = runDriveSyncJob(job.jobId).catch((error) => {
    console.error("Drive sync job failed:", errorMessage(error));
  });
  try {
    waitUntil(jobPromise);
  } catch {
    void jobPromise;
  }
  return serializeDriveSyncJob(job);
}
async function getLatestDriveSyncJob() {
  const job = await DriveSyncJobModel.findOne({}).sort({
    startedAt: -1
  });
  return job ? serializeDriveSyncJob(job) : null;
}
async function getDriveSyncJob(jobId) {
  const job = await DriveSyncJobModel.findOne({ jobId });
  if (!job) {
    throw new HttpError(404, "NOT_FOUND", "Drive sync job not found.");
  }
  return serializeDriveSyncJob(job);
}
async function deleteDriveFolder(folderId) {
  const fileUrl = `${DRIVE_API}/files/${encodeURIComponent(
    folderId
  )}?supportsAllDrives=true`;
  try {
    const trashResponse = await driveResponse(fileUrl, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ trashed: true })
    });
    if (!trashResponse.ok && trashResponse.status !== 404) {
      console.warn(
        `Could not trash Google Drive folder ${folderId}: ${trashResponse.status}`
      );
      return false;
    }
    const deleteResponse = await driveResponse(fileUrl, {
      method: "DELETE"
    });
    if (deleteResponse.ok) return true;
    const checkResponse = await driveResponse(
      `${fileUrl}&fields=id,trashed,explicitlyTrashed`
    );
    if (checkResponse.status === 404) return true;
    if (checkResponse.ok) {
      const body = await checkResponse.json();
      if (body.trashed || body.explicitlyTrashed) {
        console.warn(
          `Google Drive folder ${folderId} was moved to the shared-drive trash.`
        );
        return true;
      }
    }
    console.warn(
      `Could not delete Google Drive folder ${folderId}; it is still visible.`
    );
    return false;
  } catch (error) {
    console.warn(
      `Could not delete Google Drive folder ${folderId}:`,
      errorMessage(error)
    );
    return false;
  }
}
async function refreshDriveMasterCsv() {
  const root = await resolveRootFolder();
  const employees = await EmployeeModel.find({}).sort({ createdAt: 1 }).lean();
  const csvFile = await syncMasterCsv(
    root,
    buildEmployeeCsv(employees, env.PUBLIC_API_URL)
  );
  return {
    rootFolderWebViewLink: root.webViewLink,
    csvFileId: csvFile.id,
    csvWebViewLink: csvFile.webViewLink
  };
}
export {
  deleteDriveFolder,
  getDriveSyncJob,
  getLatestDriveSyncJob,
  refreshDriveMasterCsv,
  startDriveSyncJob
};
