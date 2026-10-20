import { useCallback, useRef, useState } from 'react';
import {
  ATTACHMENT_KINDS,
  ATTACHMENT_LABELS,
  type AttachmentKind,
} from '@bpi/shared';
import { ApiError } from '../../lib/api';
import {
  uploadDocument,
  uploadErrorMessage,
  type AttachmentUploadStates,
  type UploadedDocument,
  type UploadSession,
  type UploadSessionStatus,
} from '../../lib/uploads';
import type { FileMap } from './defaults';

type UploadedDocuments = Partial<Record<AttachmentKind, UploadedDocument>>;
type SatisfiedMap = Partial<Record<AttachmentKind, boolean>>;

export type PrepareUploadsResult = {
  documents: UploadedDocuments;
  session: UploadSession | null;
  errors: Partial<Record<AttachmentKind, string>>;
};

export type DocumentUploads = {
  files: FileMap;
  session: UploadSession | null;
  documents: UploadedDocuments;
  states: AttachmentUploadStates;
  handleFileChange: (kind: AttachmentKind, file: File | null) => void;
  retry: (kind: AttachmentKind) => void;
  startAllUploads: () => Promise<void>;
  prepareForSubmit: (
    required: AttachmentKind[],
    satisfied?: SatisfiedMap,
  ) => Promise<PrepareUploadsResult>;
  hydrate: (
    files: FileMap,
    session: UploadSession | null,
    documents: UploadedDocuments,
  ) => void;
  replaceSessionFromStatus: (status: UploadSessionStatus) => void;
  clearSession: () => void;
  reset: () => void;
  getSnapshot: () => {
    files: FileMap;
    session: UploadSession | null;
    documents: UploadedDocuments;
  };
};

function documentsFromStatus(
  status: UploadSessionStatus,
): UploadedDocuments {
  const documents: UploadedDocuments = {};
  for (const kind of ATTACHMENT_KINDS) {
    const document = status.documents[kind];
    if (document) documents[kind] = { kind, ...document };
  }
  return documents;
}

function uploadedStates(
  documents: UploadedDocuments,
): AttachmentUploadStates {
  const states: AttachmentUploadStates = {};
  for (const kind of ATTACHMENT_KINDS) {
    states[kind] = documents[kind]
      ? { status: 'uploaded', progress: 100 }
      : { status: 'idle' };
  }
  return states;
}

export function useDocumentUploads({
  createSession,
}: {
  createSession: () => Promise<UploadSession>;
}): DocumentUploads {
  const [files, setFiles] = useState<FileMap>({});
  const [session, setSession] = useState<UploadSession | null>(null);
  const [documents, setDocuments] = useState<UploadedDocuments>({});
  const [states, setStates] = useState<AttachmentUploadStates>({});

  const filesRef = useRef<FileMap>({});
  const sessionRef = useRef<UploadSession | null>(null);
  const documentsRef = useRef<UploadedDocuments>({});
  const sessionPromiseRef = useRef<Promise<UploadSession> | null>(null);
  const uploadPromisesRef = useRef<
    Partial<Record<AttachmentKind, Promise<UploadedDocument | null>>>
  >({});
  const abortRef = useRef<
    Partial<Record<AttachmentKind, AbortController>>
  >({});
  const uploadIdsRef = useRef<Partial<Record<AttachmentKind, string>>>({});
  const uploadQueueRef = useRef<Promise<void>>(Promise.resolve());

  const updateFiles = useCallback(
    (updater: (current: FileMap) => FileMap) => {
      const next = updater(filesRef.current);
      filesRef.current = next;
      setFiles(next);
    },
    [],
  );

  const updateDocuments = useCallback(
    (updater: (current: UploadedDocuments) => UploadedDocuments) => {
      const next = updater(documentsRef.current);
      documentsRef.current = next;
      setDocuments(next);
    },
    [],
  );

  const setSessionValue = useCallback((next: UploadSession | null) => {
    sessionRef.current = next;
    setSession(next);
  }, []);

  const abortKind = useCallback((kind: AttachmentKind) => {
    abortRef.current[kind]?.abort();
    delete abortRef.current[kind];
    delete uploadPromisesRef.current[kind];
    delete uploadIdsRef.current[kind];
  }, []);

  const abortAll = useCallback(() => {
    for (const kind of ATTACHMENT_KINDS) abortKind(kind);
  }, [abortKind]);

  const clearSession = useCallback(() => {
    abortAll();
    setSessionValue(null);
    updateDocuments(() => ({}));
    setStates({});
  }, [abortAll, setSessionValue, updateDocuments]);

  const reset = useCallback(() => {
    abortAll();
    setSessionValue(null);
    updateFiles(() => ({}));
    updateDocuments(() => ({}));
    setStates({});
  }, [abortAll, setSessionValue, updateFiles, updateDocuments]);

  const ensureSession = useCallback(
    async (forceNew = false): Promise<UploadSession> => {
      const current = sessionRef.current;
      if (
        !forceNew &&
        current &&
        new Date(current.expiresAt).getTime() > Date.now() + 30_000
      ) {
        return current;
      }
      if (sessionPromiseRef.current) return sessionPromiseRef.current;

      if (forceNew || current) {
        setSessionValue(null);
        updateDocuments(() => ({}));
        setStates({});
      }

      const pending = createSession().then((created) => {
        setSessionValue(created);
        return created;
      });
      sessionPromiseRef.current = pending;
      try {
        return await pending;
      } finally {
        if (sessionPromiseRef.current === pending) {
          sessionPromiseRef.current = null;
        }
      }
    },
    [createSession, setSessionValue, updateDocuments],
  );

  const uploadFile = useCallback(
    async (
      kind: AttachmentKind,
      file: File,
    ): Promise<UploadedDocument | null> => {
      abortKind(kind);
      const controller = new AbortController();
      const uploadId = crypto.randomUUID();
      abortRef.current[kind] = controller;
      uploadIdsRef.current[kind] = uploadId;

      updateDocuments((current) => {
        if (!(kind in current)) return current;
        const next = { ...current };
        delete next[kind];
        return next;
      });
      setStates((current) => ({
        ...current,
        [kind]: { status: 'uploading', progress: 0 },
      }));

      const run = uploadQueueRef.current.then(async () => {
        if (controller.signal.aborted) return null;
        try {
          const activeSession = await ensureSession();
          const document = await uploadDocument(
            activeSession,
            kind,
            file,
            {
              signal: controller.signal,
              onProgress: (progress) => {
                if (
                  controller.signal.aborted ||
                  uploadIdsRef.current[kind] !== uploadId
                ) {
                  return;
                }
                setStates((current) => ({
                  ...current,
                  [kind]: { status: 'uploading', progress },
                }));
              },
            },
          );

          if (
            controller.signal.aborted ||
            uploadIdsRef.current[kind] !== uploadId
          ) {
            return null;
          }

          updateDocuments((current) => ({
            ...current,
            [kind]: document,
          }));
          setStates((current) => ({
            ...current,
            [kind]: { status: 'uploaded', progress: 100 },
          }));
          return document;
        } catch (error) {
          if (
            controller.signal.aborted ||
            uploadIdsRef.current[kind] !== uploadId
          ) {
            return null;
          }

          if (error instanceof ApiError && error.status === 410) {
            setSessionValue(null);
            updateDocuments(() => ({}));
            setStates({});
          }

          setStates((current) => ({
            ...current,
            [kind]: {
              status: 'error',
              error: uploadErrorMessage(error),
            },
          }));
          return null;
        } finally {
          if (uploadIdsRef.current[kind] === uploadId) {
            delete uploadIdsRef.current[kind];
            delete uploadPromisesRef.current[kind];
            delete abortRef.current[kind];
          }
        }
      });

      uploadQueueRef.current = run.then(
        () => undefined,
        () => undefined,
      );
      uploadPromisesRef.current[kind] = run;
      return run;
    },
    [
      abortKind,
      ensureSession,
      setSessionValue,
      updateDocuments,
    ],
  );

  const handleFileChange = useCallback(
    (kind: AttachmentKind, file: File | null) => {
      abortKind(kind);
      if (!file) {
        updateFiles((current) => {
          if (!(kind in current)) return current;
          const next = { ...current };
          delete next[kind];
          return next;
        });
        updateDocuments((current) => {
          if (!(kind in current)) return current;
          const next = { ...current };
          delete next[kind];
          return next;
        });
        setStates((current) => ({
          ...current,
          [kind]: { status: 'idle' },
        }));
        return;
      }

      updateFiles((current) => ({ ...current, [kind]: file }));
      void uploadFile(kind, file);
    },
    [abortKind, updateFiles, updateDocuments, uploadFile],
  );

  const retry = useCallback(
    (kind: AttachmentKind) => {
      const file = filesRef.current[kind];
      if (file) void uploadFile(kind, file);
    },
    [uploadFile],
  );

  const startAllUploads = useCallback(async () => {
    const pending: Promise<UploadedDocument | null>[] = [];
    for (const kind of ATTACHMENT_KINDS) {
      const file = filesRef.current[kind];
      if (file && !documentsRef.current[kind]) {
        pending.push(uploadFile(kind, file));
      }
    }
    await Promise.allSettled(pending);
  }, [uploadFile]);

  const prepareForSubmit = useCallback(
    async (
      required: AttachmentKind[],
      satisfied: SatisfiedMap = {},
    ): Promise<PrepareUploadsResult> => {
      await Promise.allSettled(
        Object.values(uploadPromisesRef.current),
      );

      const activeSession = sessionRef.current;
      if (
        !activeSession ||
        new Date(activeSession.expiresAt).getTime() <= Date.now() + 30_000
      ) {
        if (
          sessionRef.current ||
          Object.keys(documentsRef.current).length > 0
        ) {
          setSessionValue(null);
          updateDocuments(() => ({}));
          setStates({});
        }
      }

      const resolved: UploadedDocuments = { ...documentsRef.current };
      const errors: Partial<Record<AttachmentKind, string>> = {};

      for (const kind of ATTACHMENT_KINDS) {
        const file = filesRef.current[kind];
        if (file && !resolved[kind]) {
          const document = await uploadFile(kind, file);
          if (document) resolved[kind] = document;
        }
        if (file && !resolved[kind]) {
          errors[kind] =
            `The ${ATTACHMENT_LABELS[kind]} document did not finish uploading. Retry the upload or remove it.`;
        }
      }

      for (const kind of required) {
        if (satisfied[kind] || resolved[kind] || errors[kind]) continue;
        errors[kind] =
          `Attach the ${ATTACHMENT_LABELS[kind]} document (PDF or JPEG).`;
      }

      return {
        documents: resolved,
        session: sessionRef.current,
        errors,
      };
    },
    [uploadFile, setSessionValue, updateDocuments],
  );

  const hydrate = useCallback(
    (
      nextFiles: FileMap,
      nextSession: UploadSession | null,
      nextDocuments: UploadedDocuments,
    ) => {
      abortAll();
      updateFiles(() => nextFiles);
      setSessionValue(nextSession);
      updateDocuments(() => nextDocuments);
      setStates(uploadedStates(nextDocuments));
    },
    [abortAll, updateFiles, setSessionValue, updateDocuments],
  );

  const replaceSessionFromStatus = useCallback(
    (status: UploadSessionStatus) => {
      setSessionValue({
        sessionId: status.sessionId,
        mode: status.mode,
        pathPrefix: status.pathPrefix,
        expiresAt: status.expiresAt,
      });
      const nextDocuments = documentsFromStatus(status);
      updateDocuments(() => nextDocuments);
      setStates(uploadedStates(nextDocuments));
    },
    [setSessionValue, updateDocuments],
  );

  const getSnapshot = useCallback(
    () => ({
      files: filesRef.current,
      session: sessionRef.current,
      documents: documentsRef.current,
    }),
    [],
  );

  return {
    files,
    session,
    documents,
    states,
    handleFileChange,
    retry,
    startAllUploads,
    prepareForSubmit,
    hydrate,
    replaceSessionFromStatus,
    clearSession,
    reset,
    getSnapshot,
  };
}
