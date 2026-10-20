# Blaupunkt Employee Master Record

An internal employee data collection system for Blaupunkt. Employees submit their master record through a public form; HR administrators sign in to review records, open private identity documents, edit details, and export a CSV.

## What is included

- Public employee form with all fields from `Employee Master Creation Form.xlsx`.
- Server-side and client-side validation, including Indian mobile, PIN, PAN, and Aadhaar rules.
- Optional employee code (excluded from duplicate checks when blank) and a required Organization selector with BPIN PRIVATE LIMITED and AUTO SONICS INDIA PRIVATE LIMITED.
- Duplicate protection on employee code, personal email, personal mobile, and office mobile.
- State-filtered city dropdowns, an optional joining date, and an employee-code helper hint.
- Automatic local draft saving, including form values, selected files, upload-session state, and confirmed document metadata.
- Direct browser-to-Vercel-Blob uploads in production with short-lived scoped tokens; no document bytes pass through the API.
- Upload sessions linked to a pre-generated employee record, with retry, resume, duplicate rescue, and abandoned-upload cleanup.
- Admin-only portal with search, filters, sorting, pagination, counts, record detail, edit, CSV export, Drive upload, and permanent record deletion with typed confirmation.
- Private document storage in Vercel Blob under `EMP records/<employeeId>/`, served to admins only through an authenticated backend proxy.
- Incremental Google Drive sync that creates `EMP records/<employee folder>` in the shared drive, copies only new or changed employee documents, uploads a master CSV, and stores Drive links for the CSV export.
- Background Drive-sync jobs with live progress, polling, resume-after-reload, and skipped-file reporting.
- A development-only local file driver so the app can run without a Blob token.
- REST API built with Express, MongoDB, Passport local auth, and session storage in MongoDB.
- 47 backend tests covering validation, identifiers, upload sessions, file signatures, CSV export, Drive links, and duplicate handling.

## Tech stack

| Layer | Technology |
|---|---|
| Frontend | React 19, Vite, TypeScript, React Router, TanStack Query, React Hook Form, Zod |
| Styling | Hand-written CSS with design tokens; self-hosted Public Sans and Newsreader |
| Backend | Node.js, Express 5, TypeScript, Mongoose |
| Database | MongoDB (local now, Atlas later) |
| Auth | Passport local strategy, express-session, connect-mongo, bcryptjs |
| Files | Direct browser uploads to a private Vercel Blob store; Multer only for the local development driver |
| Google Drive | Service-account REST sync into a shared drive; no extra Google SDK dependency |
| Export | csv-stringify with Excel BOM, formula-injection protection, and Google Drive link columns |

## Prerequisites

- Node.js 22.12 or newer (Node 24 also works).
- npm 10 or newer.
- MongoDB running locally, or a MongoDB Atlas connection string.
- A Vercel Blob private store and read-write token for production file storage.
- A Google service account with access to the target Google shared drive (or a folder shared with the service account) for Drive sync.

## Quick start

```bash
# 1. Install dependencies
npm install

# If your shell has NODE_ENV=production, include dev dependencies:
# NODE_ENV=development npm install --include=dev

# 2. Configure the backend
cp backend/.env.example backend/.env
# Edit backend/.env:
#   - set SESSION_SECRET
#   - set ADMIN_PASSWORD
#   - set MONGODB_URI if you are not using the local default
#   - set STORAGE_DRIVER=local for local files, or blob for Vercel Blob
#   - set BLOB_READ_WRITE_TOKEN when STORAGE_DRIVER=blob
#   - set GOOGLE_DRIVE_CREDENTIALS_FILE or GOOGLE_SERVICE_ACCOUNT_JSON for Drive sync

# 3. Create the admin account
npm run seed:admin

# 4. Run both apps
npm run dev
```

| App | URL |
|---|---|
| Employee form | http://localhost:5173 |
| Admin sign in | http://localhost:5173/admin/login |
| API health | http://localhost:5050/api/health |

The API uses port `5050` because macOS Control Center uses `5000` for AirPlay.

The local development `.env` is set up and currently seeds:

```
username: admin
password: ChangeMe!2026
```

**Change this password before sharing the app.** Update `ADMIN_PASSWORD` in `backend/.env`, then run:

```bash
npm run seed:admin -- --force
```

## Environment variables

### Backend (`backend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `NODE_ENV` | yes | `development`, `test`, or `production` |
| `PORT` | no | API port, default `5050` |
| `MONGODB_URI` | yes | Local MongoDB or Atlas connection string |
| `SESSION_SECRET` | yes | At least 32 characters; generate with `openssl rand -hex 48` |
| `SESSION_HOURS` | no | Session lifetime, default `8` |
| `COOKIE_SECURE` | no | `true` in HTTPS production |
| `COOKIE_SAME_SITE` | no | `lax` when the frontend proxies `/api` (recommended); `none` only for direct cross-site API calls |
| `CLIENT_ORIGIN` | no | Comma-separated allowed frontend origins |
| `PUBLIC_API_URL` | yes | Origin used in exported CSV fallback attachment links. In the Vercel two-project setup, set this to the **frontend** URL so links go through the first-party `/api` proxy. |
| `STORAGE_DRIVER` | no | `blob` (default) or `local` |
| `BLOB_READ_WRITE_TOKEN` | with `blob` | Vercel Blob read-write token for the private store |
| `BLOB_PREFIX` | no | Blob folder prefix, default `EMP records` |
| `GOOGLE_DRIVE_CREDENTIALS_FILE` | for Drive sync | Path to the Google service-account JSON file |
| `GOOGLE_SERVICE_ACCOUNT_JSON` | for Drive sync | Service-account JSON as an environment value; takes precedence over the file |
| `GOOGLE_DRIVE_FOLDER_ID` | no | Existing Drive folder ID; when set, sync uses this folder instead of auto-discovering `EMP records` |
| `GOOGLE_SHARED_DRIVE_ID` | no | Shared drive ID; when empty, the first shared drive visible to the service account is used |
| `GOOGLE_DRIVE_ROOT_NAME` | no | Drive root folder name, default `EMP records` |
| `LOCAL_UPLOAD_DIR` | no | Local driver directory, default `.uploads` |
| `MAX_FILE_SIZE_MB` | no | Per-file limit, default `5` |
| `UPLOAD_SESSION_HOURS` | no | Upload-session lifetime, default `24` |
| `UPLOAD_TOKEN_MINUTES` | no | Scoped Blob upload-token lifetime, default `15` |
| `CLEANUP_SECRET` | no | Enables the cron-protected cleanup endpoint when set |
| `ADMIN_USERNAME` | yes | Seeded administrator username |
| `ADMIN_PASSWORD` | for seeding | Seeded administrator password |
| `ADMIN_DISPLAY_NAME` | no | Name shown in the admin sidebar |
| `SEED_ADMIN_ON_START` | no | Create the admin on startup when missing |

### Frontend (`frontend/.env`)

| Variable | Required | Purpose |
|---|---|---|
| `VITE_API_BASE_URL` | no | Leave unset locally and in the Vercel frontend project. The local Vite proxy and the production Vercel `/api` rewrite both make API calls same-origin. Set it only when intentionally calling the backend directly cross-site. |
| `VITE_ADMIN_CONTACT` | no | Contact text shown in the duplicate-entry notice |

## Storage modes

### Vercel Blob (production)

Set:

```
STORAGE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
BLOB_PREFIX=EMP records
```

The browser never sends document bytes to the API. It requests an upload session, receives a path-scoped client token from the API, and uploads directly to the private store with `access: 'private'`. The API receives only the JSON token request, the confirmation, and the employee form submission. This bypasses Vercel's 4.5 MB function request limit.

Files live under:

```
EMP records/<employeeId>/<kind>-<uuid>.<ext>
```

The old `Blaupunkt-employee-records/attachments` prefix is not used for new uploads. Existing records that still point at the old prefix continue to work because attachment retrieval and Drive sync follow the stored pathname.

The Blob URL and read-write token are never sent to the browser. The admin attachment route checks the session, then streams the blob through the API. CSV attachment cells use Google Drive links after a Drive sync and fall back to that authenticated API route for unsynced files.

Upload sessions expire after `UPLOAD_SESSION_HOURS`. Abandoned, replaced, and unconfirmed paths are deleted by the cleanup job. Files referenced by an employee record are never deleted by cleanup.

### Local files (development)

Set:

```
STORAGE_DRIVER=local
LOCAL_UPLOAD_DIR=.uploads
```

The browser uses the development-only `POST /api/uploads/local` endpoint, which stores files in `backend/.uploads` while preserving the same session, draft, linking, and retry behavior. The folder is gitignored. This driver is for local development only; use `blob` in production. The local endpoint still receives files through the API and must not be used on a host with the 4.5 MB request limit.

## Google Drive sync

The admin dashboard has an **Upload to Google Drive** button. Clicking it starts a background job and returns immediately. The page polls the job status every two seconds and shows:

- how many employees have been checked,
- how many were skipped because they were already up to date,
- how many files were uploaded or skipped,
- the Drive folder and master CSV links when complete.

The progress survives a page reload: the latest job is read from MongoDB, so reopening the dashboard resumes the progress view. The button and CSV export are disabled while a job is running.

The job:

1. Resolves `GOOGLE_DRIVE_FOLDER_ID`, or finds/creates `EMP records` in the configured Google shared drive.
2. Skips employees whose Drive folder name and attachment file links are already current. Only new employees, changed folders, or new/replaced attachments are processed.
3. Creates or reuses one folder per employee, named `<employee code or NO-CODE> - <full name>`.
4. Copies Aadhaar, PAN, and passport files from the configured storage driver (Vercel Blob or local) into the employee folder.
5. Updates `Employee Records.csv` in the `EMP records` root. The master CSV is refreshed every run so data-only changes such as department or phone are reflected even when no documents need re-uploading.
6. Stores the Drive folder and file links on the MongoDB records.

The layout is:

```
EMP records/
  Employee Records.csv
  E005 - MURUGESH PALANI DURAI/
    Aadhaar - <original file name>
    PAN - <original file name>
    Passport - <original file name> (when present)
```

For a 70-record sync followed by 10 new records, only the 10 new employees and their files are uploaded; the existing 70 are counted as skipped. Re-running is idempotent: the same employee folders, Drive files, and master CSV are updated instead of duplicated.

Drive jobs run in the API process. On Vercel the job is kept alive with `waitUntil` within the configured function duration (`maxDuration: 300` in `backend/vercel.json`); on a persistent Node host it continues normally. For record sets that can exceed the function duration, move the job to a durable worker or process it in chunks. Jobs are retained in MongoDB for progress and status history.

Configuration:

```
GOOGLE_DRIVE_CREDENTIALS_FILE=bpin-employee-records-xxxx.json
# or, preferably in production:
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_SHARED_DRIVE_ID=
GOOGLE_DRIVE_FOLDER_ID=
GOOGLE_DRIVE_ROOT_NAME=EMP records
```

- The service account needs contributor access to the target shared drive, or a folder shared with the service account and its ID in `GOOGLE_DRIVE_FOLDER_ID`.
- When `GOOGLE_SHARED_DRIVE_ID` is empty, the first shared drive visible to the service account is used.
- The sync does not change Google Drive sharing permissions. The Drive links work for users who already have access to the shared drive/folder.
- Keep the service-account JSON out of source control. The local key file pattern is gitignored; use the JSON environment value on a host.
- Contributor-level service accounts can move deleted employee folders to the shared-drive trash but cannot permanently purge them. Grant the service account a manager/organizer role if permanent Drive deletion is required. The app removes the folder from `EMP records` either way and refreshes the master CSV.

## Delete employee records

Open an employee record and click **Delete record**. The admin must type `confirm` and then press **Confirm delete**; the button stays disabled until the text matches. **Cancel**, the dialog close button, Escape, or clicking outside the dialog aborts the operation.

Deleting a record:

- permanently deletes the MongoDB employee record,
- deletes its private Vercel Blob/local documents,
- deletes any upload sessions and pending files for that employee,
- moves the linked Google Drive folder to the shared-drive trash (or permanently deletes it when the service account has organizer permission),
- refreshes `Employee Records.csv` in Google Drive to remove the deleted row.

The API also requires `{ "confirmation": "confirm" }` in the DELETE body, so the typed confirmation cannot be bypassed by an unattended API call.

## Duplicate handling

The following identifiers must each be unique across employees:

- Employee code, when provided
- Personal email
- Personal mobile
- Office mobile

Employee code is optional. Multiple employees can have no code, and blank codes are skipped by duplicate checks. Organization is required for new submissions; existing records created before this field was added show a blank organization until an administrator assigns one on the edit screen.

Office email is intentionally allowed to repeat because shared inboxes are common.

When a submission collides:

1. The API returns `409 DUPLICATE_ENTRY` with the conflicting field names, never the existing employee's data.
2. The form keeps every value and document in place.
3. The entry is saved in IndexedDB on the employee's device, including document contents as ArrayBuffers and the upload-session/document metadata.
4. The uploaded documents stay linked to the open upload session, so correcting the clashing values does not require re-uploading them.
5. A notice tells the employee to contact the HR administrator; the admin can edit the existing record.
6. On reload, a blocked draft auto-resumes with its uploaded documents restored.
7. Once the employee changes the clashing values, they can submit again.

A unique multikey index on the normalized identifiers enforces the same rule at the database level, including race conditions.

## Documents

- Aadhaar and PAN documents are required.
- Passport details and its document are optional.
- Accepted formats: PDF and JPEG only.
- Maximum size: 5 MB per file.
- A scoped token is issued for one exact pathname, MIME type, and size limit; the confirmation verifies the actual blob contents and magic bytes.
- A document is linked to an employee only when the form submission references a confirmed document from the same session.
- If an upload fails, the form is not submitted and the selected file is kept in the draft for retry. If the form submission fails after uploads, retry the form without re-uploading.
- Documents are replaced or removed on the admin edit screen through the same session flow. Old blobs are deleted after the database save succeeds.

## CSV export

The export includes every form field, including Organization, a `Google Drive Folder` column, and the Aadhaar/PAN/passport attachment links. It is UTF-8 with a BOM so Excel opens Indian characters correctly, uses `DD-MM-YYYY` dates, escapes commas and newlines, and prefixes formula-leading cells to prevent CSV injection.

After clicking **Upload to Google Drive**, the attachment columns contain the Google Drive file links and `Google Drive Folder` contains the employee's Drive folder link. Unsynced attachments fall back to the authenticated API attachment route, which requires an active admin session. The master `Employee Records.csv` in Drive is generated from the same data and therefore also contains Drive links.

## API overview

| Method | Path | Auth | Purpose |
|---|---|---|---|
| GET | `/api/health` | public | Health check |
| POST | `/api/auth/login` | public | Admin login |
| POST | `/api/auth/logout` | public | Destroy session |
| GET | `/api/auth/me` | admin | Session probe |
| POST | `/api/public/duplicates/check` | public | Duplicate preview |
| POST | `/api/public/upload-sessions` | public | Create a form upload session |
| POST | `/api/public/employees` | public | Create employee from confirmed uploads |
| POST | `/api/admin/employees/:id/upload-sessions` | admin | Create an edit upload session |
| POST | `/api/uploads/token` | session-aware | Issue a scoped Blob upload token |
| POST | `/api/uploads/confirm` | session-aware | Verify and confirm an upload |
| POST | `/api/uploads/local` | session-aware, dev only | Upload through the local development driver |
| GET | `/api/uploads/sessions/:sessionId` | session-aware | Upload-session status and documents |
| POST/GET | `/api/internal/cleanup-uploads` | cleanup secret | Delete expired/unlinked uploads; GET is used by Vercel Cron |
| GET | `/api/admin/employees` | admin | List/search/filter/sort |
| GET | `/api/admin/employees/:id` | admin | Full record |
| PATCH | `/api/admin/employees/:id` | admin | Edit record and replace documents |
| GET | `/api/admin/employees/:id/attachments/:kind` | admin | Stream private document |
| DELETE | `/api/admin/employees/:id` | admin | Delete a record and its documents; body requires `{"confirmation":"confirm"}` |
| POST | `/api/admin/drive/sync` | admin | Start an incremental Drive-sync background job |
| GET | `/api/admin/drive/sync` | admin | Latest Drive-sync job status/progress |
| GET | `/api/admin/drive/sync/:jobId` | admin | Specific Drive-sync job status/progress |
| GET | `/api/admin/stats` | admin | Counts and recent submissions |
| GET | `/api/admin/export.csv` | admin | CSV export with Drive links where synced |

## Scripts

| Command | Purpose |
|---|---|
| `npm run dev` | Run API and web app together |
| `npm run build` | Production builds for API and web |
| `npm run typecheck` | Typecheck all workspaces |
| `npm test` | Run backend tests |
| `npm run seed:admin` | Create or update the admin account |
| `npm run generate:locations` | Regenerate the India states/cities dataset |

## Project structure

```
package.json / package-lock.json   npm workspaces manifest and single lockfile
tsconfig.base.json                Shared TypeScript compiler options
shared/                           Zod schemas, constants, identifier normalization, India locations
backend/                          Express API, MongoDB models, Passport sessions, storage, CSV, tests
frontend/                         React employee form and admin portal
frontend/vercel.json              Vercel frontend project config and /api proxy
backend/vercel.json               Vercel backend functions/cron config
backend/api/[...path].ts          Vercel catch-all API function
backend/src/vercel.ts             Serverless API initializer
asstes/                           Original Blaupunkt logo PDF
```

The generated locations file lives at `shared/src/data/india-locations.json` and contains 36 states/UTs and 4,242 cities. The city field only offers cities belonging to the selected state, and the server validates the same rule.

## Why the root files exist

This repository is an npm **workspaces monorepo**:

| Path | Purpose |
|---|---|
| `package.json` | Workspace manifest and root scripts |
| `package-lock.json` | One lockfile for all three workspaces |
| `tsconfig.base.json` | Shared TypeScript compiler options |
| `node_modules/` | Hoisted local dependencies; gitignored and never deployed |
| `shared/` | Imported as `@bpi/shared` by both applications |

The `shared` package is build-time only. Vite bundles it into `frontend/dist`, and `tsup` bundles it into `backend/dist` (`noExternal: ['@bpi/shared']`). There is no shared runtime process and no shared deployment dependency, so hosting the two apps separately does not create a conflict.

Do not upload the root `node_modules/` or any `.env` file. Vercel installs from the root lockfile.

## Deploying as two Vercel projects

The frontend and backend are separate Vercel projects from the same repository:

- **Frontend project:** Root Directory `frontend`
- **Backend project:** Root Directory `backend`

Both projects should enable Vercel's **Include source files outside of the Root Directory in the Build Step** option. This makes the parent workspace (`shared/`, root `package.json`, and root lockfile) available. Each app has its own `vercel.json` that runs the workspace install/build from the repository root.

### 1. Backend Vercel project

1. Import the repository into Vercel.
2. Set **Root Directory** to `backend`.
3. Enable **Include source files outside of the Root Directory in the Build Step**.
4. `backend/vercel.json` provides:
   - Install: `cd .. && npm ci --include=dev`
   - Build: `cd .. && npm run build -w backend`
   - Catch-all API function: `api/[...path].ts`
   - Function duration: `300` seconds
   - Hourly cron: `GET /api/internal/cleanup-uploads`
5. Add the backend environment variables:

```
NODE_ENV=production
MONGODB_URI=mongodb+srv://<atlas-user>:<password>@<cluster>/<database>
SESSION_SECRET=<64+ random characters>
CLIENT_ORIGIN=https://<your-frontend>.vercel.app
PUBLIC_API_URL=https://<your-frontend>.vercel.app
COOKIE_SECURE=true
COOKIE_SAME_SITE=lax
STORAGE_DRIVER=blob
BLOB_READ_WRITE_TOKEN=vercel_blob_rw_...
BLOB_PREFIX=EMP records
GOOGLE_SERVICE_ACCOUNT_JSON={"type":"service_account",...}
GOOGLE_DRIVE_ROOT_NAME=EMP records
ADMIN_USERNAME=admin
ADMIN_PASSWORD=<strong password>
SEED_ADMIN_ON_START=true
CLEANUP_SECRET=<strong random value>
CRON_SECRET=<same value as CLEANUP_SECRET>
```

`PUBLIC_API_URL` intentionally points at the **frontend** domain. The frontend proxies `/api/*` to the backend, so CSV attachment links stay first-party and work with the admin session on iOS/Safari.

Vercel Cron sends `Authorization: Bearer $CRON_SECRET`; the cleanup endpoint validates `CLEANUP_SECRET`, so set both variables to the same value. On Vercel, the hourly schedule may require a Pro plan; adjust the schedule in `backend/vercel.json` for your plan.

Set `SEED_ADMIN_ON_START=false` after the first successful deployment, or seed Atlas directly:

```bash
MONGODB_URI='mongodb+srv://...' npm run seed:admin -w backend
```

Atlas must allow Vercel's outbound connections. For a simple setup, add `0.0.0.0/0` to the Atlas IP access list with a strong database password; for production, use Atlas PrivateLink/Vercel integration or a restricted egress proxy.

The backend's `api/[...path].ts` function imports the built `backend/dist/vercel.js`; the Vercel build command creates it. The serverless initializer connects to Atlas once per warm instance, creates the Express app, and reuses the Mongoose connection. The Drive-sync background job uses Vercel `waitUntil`, so it continues after the `202` response within the function duration limit. Large syncs should move to a durable worker.

### 2. Frontend Vercel project

1. Import the repository into Vercel.
2. Set **Root Directory** to `frontend`.
3. Enable **Include source files outside of the Root Directory in the Build Step**.
4. Edit `frontend/vercel.json` and replace `https://YOUR-BACKEND.vercel.app` with the backend project's production URL.
5. Add frontend environment variables:
   - `VITE_ADMIN_CONTACT` (optional)
   - Do **not** set `VITE_API_BASE_URL`. Leaving it unset makes every `/api` request same-origin through the Vercel rewrite.
6. Deploy.

`frontend/vercel.json` provides:

- Install: `cd .. && npm ci --include=dev`
- Build: `cd .. && npm run build -w frontend`
- Output: `dist`
- `/api/*` proxy rewrite to the backend project
- SPA fallback for React Router

The backend URL is not a secret. No backend token, Mongo URI, Blob token, Google key, or session secret belongs in the frontend project.

### iOS/Safari sessions and cross-origin cookies

The frontend calls `/api/*` on its own domain. Vercel's rewrite proxies that request to the backend and returns the backend's `Set-Cookie` through the frontend origin. The browser therefore treats `bpi.sid` as a **first-party frontend cookie**, not a third-party backend cookie. That is the key to reliable admin sessions on iOS/Safari.

The required combination is:

- Frontend: `VITE_API_BASE_URL` unset
- Frontend rewrite: `/api/(.*)` to the backend
- Backend: `COOKIE_SECURE=true`
- Backend: `COOKIE_SAME_SITE=lax`
- Backend: `PUBLIC_API_URL=https://<frontend>`
- Backend: `CLIENT_ORIGIN=https://<frontend>`
- Backend Express already sets `trust proxy`, so the session library sees the HTTPS proxy request

If you bypass the proxy and call the backend domain directly, you would need `COOKIE_SAME_SITE=none` and `VITE_API_BASE_URL=https://<backend>`. That is the cross-site arrangement iOS may block, so the first-party rewrite is recommended.

### Alternative non-Vercel backend

A persistent Node host (Render, Railway, Fly.io, VPS) can still run `backend/dist/index.js`. In that case, either keep the frontend rewrite proxy (recommended) or use `COOKIE_SAME_SITE=none` and point `VITE_API_BASE_URL` directly at the backend. The Vercel-specific `api/[...path].ts` and `waitUntil` paths are not required there.

### MongoDB and Blob

- Change only `MONGODB_URI` to move from local MongoDB to Atlas. Indexes are created at cold start/startup.
- Use a private Vercel Blob store. Keep `BLOB_READ_WRITE_TOKEN` on the API only; never expose it to Vite.
- In production, document files go directly from the browser to Vercel Blob. The API receives only small JSON requests, so Vercel's 4.5 MB request limit no longer applies to documents.
- New Blob files live under `EMP records/<employeeId>/`. Existing records keep working from their stored pathnames.
- For Google Drive sync, give the service account access to the shared drive, or share a folder with it and set `GOOGLE_DRIVE_FOLDER_ID`. Do not commit the service-account JSON; use `GOOGLE_SERVICE_ACCOUNT_JSON` in Vercel.
- Drive sync now runs as a background job with progress polling. On Vercel it is kept alive with `waitUntil`; syncs longer than the function duration should use a durable queue.
- The cleanup job is `GET /api/internal/cleanup-uploads` with `Authorization: Bearer <CLEANUP_SECRET>`; Vercel Cron calls it using `CRON_SECRET` (set both to the same value).
- Seed with a strong admin password and reset with `npm run seed:admin -- --force` when rotating.

## Security and privacy notes

- Admin sessions are HTTP-only cookies backed by MongoDB, with session regeneration on login and an 8-hour rolling lifetime.
- Login is rate-limited to 5 failed attempts per 15 minutes per IP.
- Public duplicate checks, upload sessions, upload confirmations, and submissions are rate-limited.
- Public endpoints never return employee records.
- Upload tokens are scoped to one private pathname, PDF/JPEG only, size-limited, and short-lived. The read-write token stays on the server.
- Confirmation verifies the blob's actual size and magic bytes; a form can only reference confirmed documents from its own session.
- Edit upload sessions require an authenticated admin and the matching employee record.
- The list API masks Aadhaar and PAN. Full values are only available in the authenticated detail endpoint and CSV export.
- Request logs contain method, path, status, and duration; they do not log request bodies, document bytes, or PII.
- Document access requires an admin session; private Blob URLs are never exposed.
- Google Drive sync and record deletion are admin-only. Sync uses a server-side service account; the JSON key is never sent to the browser or committed to the repository. Drive links are visible only to users with access to the target shared drive/folder.
- Deletion requires both the typed `confirm` value in the browser and `{"confirmation":"confirm"}` in the API request.
- Cleanup deletes abandoned/unlinked blobs but skips any pathname referenced by an employee record.
- `backend/.env`, `frontend/.env`, `backend/.uploads`, and the Google service-account JSON pattern are gitignored.

## Deferred / possible next steps

- A durable distributed queue for Drive jobs on multi-instance or serverless hosts.
- Signed, expiring attachment URLs for unsynced CSV links shared outside the admin browser.
- Employee self-service login or an access code for the public form.
- Soft delete/archive for records.
- Field-level encryption for Aadhaar and PAN at rest.
- AWS/Atlas backup policy and audit logging.
