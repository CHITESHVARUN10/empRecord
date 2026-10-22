import localforage from 'localforage';
import {
  ATTACHMENT_KINDS,
  type AttachmentKind,
  type EmployeeInput,
} from '@bpi/shared';
import type { Conflict } from './api';
import type {
  UploadedDocument,
  UploadSession,
} from './uploads';

const STORAGE_KEY = 'bpi.employee-draft.v1';

const store = localforage.createInstance({
  name: 'blaupunkt-employee-form',
  storeName: 'drafts',
});

type FileMap = Partial<Record<AttachmentKind, File>>;

export type DraftPayload = {
  values: EmployeeInput;
  files: FileMap;
  savedAt: number;
  conflicts: Conflict[];
  blocked: boolean;
  attachmentsSaved: boolean;
  uploadSession?: UploadSession | null;
  uploadedDocuments?: Partial<Record<AttachmentKind, UploadedDocument>>;
};

type SerializedDraftFile = {
  name: string;
  type: string;
  lastModified: number;
  data: ArrayBuffer;
};

type StoredDraftPayload = Omit<DraftPayload, 'files'> & {
  files: Partial<Record<AttachmentKind, SerializedDraftFile>>;
};

export type SaveDraftResult = {
  ok: boolean;
  attachmentsSaved: boolean;
};

const fileBufferCache = new WeakMap<File, Promise<ArrayBuffer>>();

function serializeFile(file: File): Promise<ArrayBuffer> {
  const cached = fileBufferCache.get(file);
  if (cached) return cached;
  const pending = file.arrayBuffer();
  fileBufferCache.set(file, pending);
  return pending;
}

async function serializeFiles(
  files: FileMap,
): Promise<Partial<Record<AttachmentKind, SerializedDraftFile>>> {
  const serialized: Partial<Record<AttachmentKind, SerializedDraftFile>> = {};

  for (const kind of ATTACHMENT_KINDS) {
    const file = files[kind];
    if (!file) continue;
    serialized[kind] = {
      name: file.name,
      type: file.type,
      lastModified: file.lastModified,
      data: await serializeFile(file),
    };
  }

  return serialized;
}

function deserializeFiles(value: unknown): {
  files: FileMap;
  complete: boolean;
} {
  if (!value || typeof value !== 'object') {
    return { files: {}, complete: false };
  }

  const files: FileMap = {};
  let complete = true;
  const record = value as Record<string, unknown>;

  for (const kind of ATTACHMENT_KINDS) {
    const entry = record[kind];
    if (!entry) continue;

    if (entry instanceof File) {
      complete = false;
      continue;
    }

    if (typeof entry !== 'object') {
      complete = false;
      continue;
    }

    const stored = entry as Partial<SerializedDraftFile>;
    if (
      !(stored.data instanceof ArrayBuffer) ||
      !stored.name ||
      !stored.type
    ) {
      complete = false;
      continue;
    }

    files[kind] = new File([stored.data], stored.name, {
      type: stored.type,
      lastModified: stored.lastModified ?? Date.now(),
    });
  }

  return { files, complete };
}

export async function saveDraft(
  payload: DraftPayload,
): Promise<SaveDraftResult> {
  try {
    const stored: StoredDraftPayload = {
      ...payload,
      files: await serializeFiles(payload.files),
    };
    await store.setItem(STORAGE_KEY, stored);
    return { ok: true, attachmentsSaved: true };
  } catch {
    try {
      const fallback: StoredDraftPayload = {
        ...payload,
        files: {},
        attachmentsSaved: false,
      };
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(fallback));
      return { ok: true, attachmentsSaved: false };
    } catch {
      return { ok: false, attachmentsSaved: false };
    }
  }
}

export async function loadDraft(): Promise<DraftPayload | null> {
  try {
    const stored = await store.getItem<StoredDraftPayload>(STORAGE_KEY);
    if (stored?.values) {
      const { files, complete } = deserializeFiles(stored.files);
      return {
        ...stored,
        files,
        attachmentsSaved: stored.attachmentsSaved && complete,
      };
    }
  } catch {
    // Fall through to the text-only copy.
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as DraftPayload;
    if (!parsed?.values) return null;
    return {
      ...parsed,
      files: {},
      attachmentsSaved: false,
    };
  } catch {
    return null;
  }
}

export async function clearDraft(): Promise<void> {
  try {
    await store.removeItem(STORAGE_KEY);
  } catch {
    // Ignore IndexedDB failures; clear the fallback too.
  }
  window.localStorage.removeItem(STORAGE_KEY);
}

export function hasDraftContent(values: EmployeeInput): boolean {
  return Boolean(
    values.employeeCode ||
      values.fullName ||
      values.dateOfBirth ||
      values.personalEmail ||
      values.personalMobile ||
      values.aadhaarNumber ||
      values.panNumber ||
      values.designation ||
      values.ira ||
      values.bankName ||
      values.accountNo ||
      values.ifscCode ||
      values.uanNo ||
      values.receiverCode ||
      values.permanentAddress?.line,
  );
}
