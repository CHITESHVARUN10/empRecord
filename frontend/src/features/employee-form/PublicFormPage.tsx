import { useCallback, useEffect, useRef, useState } from 'react';
import {
  FormProvider,
  useForm,
  useWatch,
  type FieldErrors,
  type Path,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import {
  employeeSchema,
  type AttachmentKind,
  type EmployeeInput,
} from '@bpi/shared';
import { ArrowRight, LockKeyhole } from 'lucide-react';
import { Banner } from '../../components/Banner';
import { Dialog } from '../../components/Dialog';
import { PageLoading } from '../../components/PageStates';
import { apiFetch, ApiError, type Conflict } from '../../lib/api';
import {
  clearDraft,
  hasDraftContent,
  loadDraft,
  saveDraft,
  type DraftPayload,
} from '../../lib/draft';
import {
  createPublicUploadSession,
  fetchUploadSession,
  type UploadedDocument,
} from '../../lib/uploads';
import { formatDateTime } from '../../lib/format';
import { EmployeeFields } from './EmployeeFields';
import { defaultEmployeeValues } from './defaults';
import { DuplicateNotice } from './DuplicateNotice';
import { useDocumentUploads } from './useDocumentUploads';
import {
  SectionRail,
  type FormSectionId,
} from './SectionRail';
import { SuccessView, type SubmissionReceipt } from './SuccessView';

const LAST_SUBMISSION_KEY = 'bpi.last-submission.v1';

type DraftUiState = 'idle' | 'saving' | 'saved' | 'saved-text' | 'error';

function readReceipt(): SubmissionReceipt | null {
  try {
    const raw = window.sessionStorage.getItem(LAST_SUBMISSION_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as SubmissionReceipt;
    if (!parsed.employeeCode || !parsed.submittedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

function mergeDraft(draft: DraftPayload): EmployeeInput {
  return {
    ...defaultEmployeeValues,
    ...draft.values,
    permanentAddress: {
      ...defaultEmployeeValues.permanentAddress,
      ...draft.values.permanentAddress,
    },
    presentAddress: {
      ...defaultEmployeeValues.presentAddress,
      ...draft.values.presentAddress,
    },
    emergencyContact: {
      ...defaultEmployeeValues.emergencyContact,
      ...draft.values.emergencyContact,
    },
  };
}

function findFirstErrorPath(
  errors: FieldErrors<EmployeeInput>,
  prefix = '',
): string | undefined {
  for (const [key, value] of Object.entries(errors)) {
    if (!value) continue;
    const path = prefix ? `${prefix}.${key}` : key;
    if (
      typeof value === 'object' &&
      'message' in value &&
      typeof (value as { message?: unknown }).message === 'string'
    ) {
      return path;
    }
    if (typeof value === 'object') {
      const nested = findFirstErrorPath(
        value as FieldErrors<EmployeeInput>,
        path,
      );
      if (nested) return nested;
    }
  }
  return undefined;
}

function isComplete(
  values: EmployeeInput,
  uploadedDocuments: Partial<Record<AttachmentKind, UploadedDocument>>,
): Record<FormSectionId, boolean> {
  const personal = Boolean(
    values.fullName?.trim() &&
      values.organization &&
      values.dateOfBirth &&
      values.gender &&
      values.nationality?.trim() &&
      values.maritalStatus &&
      values.bloodGroup &&
      values.nominee?.trim() &&
      values.department,
  );

  const identity = Boolean(
    values.aadhaarNumber?.trim() &&
      values.panNumber?.trim() &&
      uploadedDocuments.aadhaar &&
      uploadedDocuments.pan,
  );

  const permanent = Boolean(
    values.permanentAddress?.line?.trim() &&
      values.permanentAddress?.state &&
      values.permanentAddress?.city?.trim() &&
      values.permanentAddress?.pincode?.trim(),
  );
  const present =
    values.presentSameAsPermanent ||
    Boolean(
      values.presentAddress?.line?.trim() &&
        values.presentAddress?.state &&
        values.presentAddress?.city?.trim() &&
        values.presentAddress?.pincode?.trim(),
    );
  const address = Boolean(
    permanent &&
      present &&
      values.officeMobile?.trim() &&
      values.personalMobile?.trim() &&
      values.personalEmail?.trim(),
  );

  const emergency = Boolean(
    values.emergencyContact?.name?.trim() &&
      values.emergencyContact?.relation?.trim() &&
      values.emergencyContact?.mobile?.trim(),
  );

  return { personal, identity, address, emergency };
}

function prefersReducedMotion(): boolean {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function PublicFormPage() {
  const createUploadSession = useCallback(
    () => createPublicUploadSession(),
    [],
  );
  const uploads = useDocumentUploads({
    createSession: createUploadSession,
  });
  const {
    files,
    session: uploadSession,
    documents: uploadedDocuments,
    states: uploadStates,
    handleFileChange,
    retry: retryUpload,
    startAllUploads,
    prepareForSubmit,
    hydrate: hydrateUploads,
    replaceSessionFromStatus,
    clearSession,
    reset: resetUploads,
    getSnapshot,
  } = uploads;

  const [fileErrors, setFileErrors] = useState<
    Partial<Record<AttachmentKind, string>>
  >({});
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [duplicateNotice, setDuplicateNotice] = useState(false);
  const [serverMessage, setServerMessage] = useState<string>();
  const [submitting, setSubmitting] = useState(false);
  const [pendingDraft, setPendingDraft] = useState<DraftPayload | null>(null);
  const [draftReady, setDraftReady] = useState(false);
  const [draftState, setDraftState] = useState<DraftUiState>('idle');
  const [draftSavedAt, setDraftSavedAt] = useState<number>();
  const [activeSection, setActiveSection] = useState<string>('personal');
  const [lastSubmission, setLastSubmission] =
    useState<SubmissionReceipt | null>(readReceipt);
  const [confirmDiscard, setConfirmDiscard] = useState(false);

  const methods = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    mode: 'onBlur',
    defaultValues: defaultEmployeeValues,
  });

  const {
    control,
    getValues,
    reset,
    setError,
    setFocus,
    watch,
    handleSubmit,
  } = methods;

  const watchedValues = useWatch({ control }) as EmployeeInput;
  const completed = isComplete(watchedValues, uploadedDocuments);

  const saveTimerRef = useRef<number | undefined>(undefined);
  const checkTimerRef = useRef<number | undefined>(undefined);
  const draftReadyRef = useRef(false);
  const conflictsRef = useRef(conflicts);
  const duplicateNoticeRef = useRef(duplicateNotice);

  conflictsRef.current = conflicts;
  duplicateNoticeRef.current = duplicateNotice;

  const persistDraft = useCallback(
    async (
      values: EmployeeInput,
      nextConflicts: Conflict[],
      blocked: boolean,
    ) => {
      const snapshot = getSnapshot();
      if (
        !hasDraftContent(values) &&
        Object.keys(snapshot.files).length === 0
      ) {
        return;
      }
      setDraftState('saving');
      const result = await saveDraft({
        values,
        files: snapshot.files,
        savedAt: Date.now(),
        conflicts: nextConflicts,
        blocked,
        attachmentsSaved: true,
        uploadSession: snapshot.session,
        uploadedDocuments: snapshot.documents,
      });
      setDraftSavedAt(Date.now());
      setDraftState(
        result.ok
          ? result.attachmentsSaved
            ? 'saved'
            : 'saved-text'
          : 'error',
      );
    },
    [getSnapshot],
  );

  const scheduleSave = useCallback(() => {
    if (!draftReadyRef.current || pendingDraft || lastSubmission) return;
    window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      void persistDraft(
        getValues(),
        conflictsRef.current,
        duplicateNoticeRef.current,
      );
    }, 600);
  }, [getValues, pendingDraft, lastSubmission, persistDraft]);

  const reconcileResumedUploads = useCallback(
    async (draft: DraftPayload) => {
      const draftSession = draft.uploadSession ?? null;
      if (!draftSession) {
        if (Object.keys(draft.files ?? {}).length > 0) {
          void startAllUploads();
        }
        return;
      }

      try {
        const status = await fetchUploadSession(draftSession.sessionId);
        replaceSessionFromStatus(status);
        void startAllUploads();
      } catch {
        clearSession();
        void startAllUploads();
        setServerMessage(
          'Your previous document upload session expired. Your form is saved, and saved documents will be uploaded again where possible. Reselect any document that was not stored in this browser.',
        );
      }
    },
    [
      startAllUploads,
      replaceSessionFromStatus,
      clearSession,
    ],
  );

  const resumeDraft = useCallback(
    (draft: DraftPayload) => {
      reset(mergeDraft(draft));
      hydrateUploads(
        draft.files ?? {},
        draft.uploadSession ?? null,
        draft.uploadedDocuments ?? {},
      );
      setConflicts(draft.conflicts ?? []);
      setDuplicateNotice(Boolean(draft.blocked));
      setFileErrors({});
      setDraftState(draft.attachmentsSaved ? 'saved' : 'saved-text');
      setDraftSavedAt(draft.savedAt);
      setPendingDraft(null);
      void reconcileResumedUploads(draft);
      requestAnimationFrame(() => {
        document
          .getElementById('form-alerts')
          ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    },
    [reset, hydrateUploads, reconcileResumedUploads],
  );

  useEffect(() => {
    let active = true;
    void loadDraft()
      .then((draft) => {
        if (!active) return;
        if (draft) {
          if (draft.blocked) {
            resumeDraft(draft);
          } else {
            setPendingDraft(draft);
          }
        }
        draftReadyRef.current = true;
        setDraftReady(true);
      })
      .catch(() => {
        if (!active) return;
        draftReadyRef.current = true;
        setDraftReady(true);
      });

    return () => {
      active = false;
      window.clearTimeout(saveTimerRef.current);
      window.clearTimeout(checkTimerRef.current);
    };
  }, [resumeDraft]);

  useEffect(() => {
    const subscription = watch(() => {
      scheduleSave();
    });
    return () => subscription.unsubscribe();
  }, [watch, scheduleSave]);

  useEffect(() => {
    if (!draftReady) return;
    scheduleSave();
  }, [
    files,
    uploadSession,
    uploadedDocuments,
    conflicts,
    duplicateNotice,
    draftReady,
    scheduleSave,
  ]);

  useEffect(() => {
    if (lastSubmission) return;
    const sections = Array.from(
      document.querySelectorAll<HTMLElement>('[data-form-section]'),
    );
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort(
            (left, right) =>
              left.boundingClientRect.top - right.boundingClientRect.top,
          );
        const first = visible[0];
        if (first) {
          setActiveSection(first.target.id.replace('section-', ''));
        }
      },
      { rootMargin: '-18% 0px -64% 0px', threshold: [0, 0.1] },
    );
    sections.forEach((section) => observer.observe(section));
    return () => observer.disconnect();
  }, [lastSubmission, draftReady]);

  useEffect(() => {
    if (duplicateNotice && conflicts.length === 0) {
      setDuplicateNotice(false);
    }
  }, [conflicts, duplicateNotice]);

  const discardSavedEntry = useCallback(async () => {
    window.clearTimeout(saveTimerRef.current);
    await clearDraft();
    reset(defaultEmployeeValues);
    resetUploads();
    setConflicts([]);
    setDuplicateNotice(false);
    setPendingDraft(null);
    setServerMessage(undefined);
    setFileErrors({});
    setDraftState('idle');
    setDraftSavedAt(undefined);
    setConfirmDiscard(false);
    draftReadyRef.current = true;
    setDraftReady(true);
    window.scrollTo({
      top: 0,
      behavior: prefersReducedMotion() ? 'auto' : 'smooth',
    });
  }, [reset, resetUploads]);

  const runDuplicateCheck = useCallback(async () => {
    const values = getValues();
    const payload = {
      employeeCode: values.employeeCode.trim() || undefined,
      organization: values.organization || undefined,
      personalEmail: values.personalEmail.trim() || undefined,
      personalMobile: values.personalMobile.trim() || undefined,
      officeMobile: values.officeMobile.trim() || undefined,
    };
    if (
      ![
        payload.employeeCode,
        payload.personalEmail,
        payload.personalMobile,
        payload.officeMobile,
      ].some(Boolean)
    ) {
      setConflicts([]);
      return;
    }
    try {
      const data = await apiFetch<{ conflicts: Conflict[] }>(
        '/api/public/duplicates/check',
        {
          method: 'POST',
          body: JSON.stringify(payload),
        },
      );
      setConflicts(data.conflicts);
    } catch {
      // The preview is advisory. Submission performs the authoritative check.
    }
  }, [getValues]);

  const scheduleDuplicateCheck = useCallback(() => {
    window.clearTimeout(checkTimerRef.current);
    checkTimerRef.current = window.setTimeout(() => {
      void runDuplicateCheck();
    }, 500);
  }, [runDuplicateCheck]);

  useEffect(() => {
    if (!draftReady || lastSubmission) return;
    setConflicts((current) =>
      current.filter((conflict) => conflict.field !== 'employeeCode'),
    );
    scheduleDuplicateCheck();
  }, [
    watchedValues.organization,
    draftReady,
    lastSubmission,
    scheduleDuplicateCheck,
  ]);

  function scrollToField(field: string) {
    document
      .querySelector(`[data-field="${field}"]`)
      ?.scrollIntoView({
        behavior: prefersReducedMotion() ? 'auto' : 'smooth',
        block: 'center',
      });
  }

  const submit = async (values: EmployeeInput) => {
    setServerMessage(undefined);
    setSubmitting(true);

    try {
      const prepared = await prepareForSubmit(['aadhaar', 'pan']);
      setFileErrors(prepared.errors);

      if (
        Object.keys(prepared.errors).length > 0 ||
        !prepared.session
      ) {
        const firstKind = (
          ['aadhaar', 'pan', 'passport'] as const
        ).find((kind) => prepared.errors[kind]);
        if (firstKind) scrollToField(`attachments.${firstKind}`);
        setServerMessage(
          'The record was not submitted because a document did not finish uploading. Your form and documents are saved on this device. Retry the upload and submit again.',
        );
        await persistDraft(values, conflictsRef.current, false);
        return;
      }

      const attachments = {
        aadhaar: prepared.documents.aadhaar?.pathname,
        pan: prepared.documents.pan?.pathname,
        ...(prepared.documents.passport
          ? { passport: prepared.documents.passport.pathname }
          : {}),
      };

      if (!attachments.aadhaar || !attachments.pan) {
        setFileErrors({
          aadhaar: 'Attach the Aadhaar document (PDF or JPEG).',
          pan: 'Attach the PAN document (PDF or JPEG).',
        });
        scrollToField('attachments.aadhaar');
        await persistDraft(values, conflictsRef.current, false);
        return;
      }

      const response = await apiFetch<{
        employee: { id: string; employeeCode: string; createdAt: string };
      }>('/api/public/employees', {
        method: 'POST',
        body: JSON.stringify({
          data: values,
          uploadSessionId: prepared.session.sessionId,
          attachments,
        }),
      });

      const receipt: SubmissionReceipt = {
        employeeCode: response.employee.employeeCode,
        submittedAt: response.employee.createdAt,
      };

      try {
        window.sessionStorage.setItem(
          LAST_SUBMISSION_KEY,
          JSON.stringify(receipt),
        );
      } catch {
        // The confirmation still renders in memory.
      }

      window.clearTimeout(saveTimerRef.current);
      await clearDraft();
      reset(defaultEmployeeValues);
      resetUploads();
      setConflicts([]);
      setDuplicateNotice(false);
      setFileErrors({});
      setDraftState('idle');
      setDraftSavedAt(undefined);
      setLastSubmission(receipt);
      window.scrollTo({ top: 0, behavior: 'auto' });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 410) {
          clearSession();
          setServerMessage(
            'Your document upload session expired. Your form is saved; retry the document uploads and submit again.',
          );
          await persistDraft(values, conflictsRef.current, false);
        } else if (error.status === 409 && error.conflicts?.length) {
          setConflicts(error.conflicts);
          setDuplicateNotice(true);
          await persistDraft(values, error.conflicts, true);
          requestAnimationFrame(() => {
            document
              .getElementById('form-alerts')
              ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
          });
        } else {
          if (error.fields && Object.keys(error.fields).length > 0) {
            const attachmentErrors: Partial<
              Record<AttachmentKind, string>
            > = {};
            let generalMessage: string | undefined;

            for (const [field, message] of Object.entries(error.fields)) {
              if (field.startsWith('attachments.')) {
                const kind = field.split('.')[1] as AttachmentKind;
                attachmentErrors[kind] = message;
              } else if (field === 'form') {
                generalMessage = message;
              } else {
                setError(field as Path<EmployeeInput>, {
                  type: 'server',
                  message,
                });
              }
            }

            if (Object.keys(attachmentErrors).length > 0) {
              setFileErrors((current) => ({
                ...current,
                ...attachmentErrors,
              }));
            }
            if (generalMessage) setServerMessage(generalMessage);

            const firstField = Object.keys(error.fields)[0];
            if (firstField) scrollToField(firstField);
            await persistDraft(values, conflictsRef.current, false);
          } else {
            setServerMessage(error.message);
            await persistDraft(values, conflictsRef.current, false);
          }
        }
      } else {
        setServerMessage(
          'Record submission failed. Your form and uploaded documents are saved; retry submission without re-uploading.',
        );
        await persistDraft(values, conflictsRef.current, false);
      }
    } finally {
      setSubmitting(false);
    }
  };

  const invalid = (formErrors: FieldErrors<EmployeeInput>) => {
    const first = findFirstErrorPath(formErrors);
    if (!first) return;
    setFocus(first as Path<EmployeeInput>);
    scrollToField(first);
  };

  const resetForAnother = () => {
    try {
      window.sessionStorage.removeItem(LAST_SUBMISSION_KEY);
    } catch {
      // Ignore storage failures.
    }
    setLastSubmission(null);
    reset(defaultEmployeeValues);
    resetUploads();
    setConflicts([]);
    setDuplicateNotice(false);
    setDraftState('idle');
    setDraftSavedAt(undefined);
    window.scrollTo({ top: 0, behavior: 'auto' });
  };

  if (!draftReady) {
    return (
      <div className="public-page">
        <div className="public-layout">
          <SectionRail
            activeSection="personal"
            completed={completed}
            draftState="idle"
            onNavigate={() => undefined}
            showNavigation={false}
          />
          <main className="public-main" id="employee-form">
            <PageLoading label="Preparing your form" />
          </main>
        </div>
      </div>
    );
  }

  return (
    <div className="public-page">
      <a className="skip-link" href="#employee-form">
        Skip to form
      </a>

      <div className="public-layout">
        <SectionRail
          activeSection={activeSection}
          completed={completed}
          draftState={draftState}
          draftSavedAt={draftSavedAt}
          showNavigation={!lastSubmission}
          showDraftNote={!lastSubmission}
          onNavigate={(id) => {
            document.getElementById(`section-${id}`)?.scrollIntoView({
              behavior: prefersReducedMotion() ? 'auto' : 'smooth',
              block: 'start',
            });
          }}
        />

        <main className="public-main" id="employee-form">
          {lastSubmission ? (
            <SuccessView submission={lastSubmission} onReset={resetForAnother} />
          ) : (
            <>
              <div className="form-alerts" id="form-alerts">
                {pendingDraft ? (
                  <Banner
                    variant="info"
                    title="Saved entry found on this device"
                    actions={
                      <>
                        <button
                          type="button"
                          className="btn btn--secondary btn--sm"
                          onClick={() => resumeDraft(pendingDraft)}
                        >
                          Resume saved entry
                        </button>
                        <button
                          type="button"
                          className="btn btn--ghost btn--sm"
                          onClick={() => setConfirmDiscard(true)}
                        >
                          Discard
                        </button>
                      </>
                    }
                  >
                    A saved entry from{' '}
                    {formatDateTime(new Date(pendingDraft.savedAt))} is
                    available. Resume it to keep the details and documents
                    already entered.
                    {pendingDraft.uploadedDocuments?.aadhaar ||
                    pendingDraft.uploadedDocuments?.pan ? (
                      <span>
                        {' '}
                        Your documents are already uploaded and linked to this
                        draft.
                      </span>
                    ) : pendingDraft.attachmentsSaved ? (
                      <span>
                        {' '}
                        Your selected documents will upload when you resume.
                      </span>
                    ) : (
                      <span>
                        {' '}
                        Documents from this draft could not be stored;
                        reselect them after resuming.
                      </span>
                    )}
                  </Banner>
                ) : null}

                {duplicateNotice ? (
                  <DuplicateNotice
                    conflicts={conflicts}
                    onDiscard={() => setConfirmDiscard(true)}
                  />
                ) : null}

                {serverMessage ? (
                  <Banner variant="danger" title="Submission failed">
                    {serverMessage}
                  </Banner>
                ) : null}
              </div>

              <FormProvider {...methods}>
                <form
                  className="form-sheet"
                  onSubmit={handleSubmit(submit, invalid)}
                  noValidate
                  aria-busy={submitting}
                >
                  <EmployeeFields
                    mode="public"
                    files={files}
                    onFileChange={(kind, file) => {
                      if (file) {
                        setFileErrors((current) => ({
                          ...current,
                          [kind]: undefined,
                        }));
                      }
                      handleFileChange(kind, file);
                    }}
                    fileErrors={fileErrors}
                    uploadedDocuments={uploadedDocuments}
                    uploadStates={uploadStates}
                    onRetryUpload={retryUpload}
                    duplicateConflicts={conflicts}
                    onIdentifierBlur={scheduleDuplicateCheck}
                    onIdentifierChange={(field) => {
                      setConflicts((current) =>
                        current.filter((conflict) => conflict.field !== field),
                      );
                    }}
                  />

                <div className="form-actions">
                  <div className="form-actions__note">
                    <LockKeyhole size={16} aria-hidden="true" />
                    <span>
                      Your record goes directly to the HR administrator. Check
                      the details before submitting.
                    </span>
                  </div>
                  <button
                    type="submit"
                    className="btn btn--primary btn--lg"
                    disabled={submitting}
                  >
                    {submitting ? (
                      <>
                        <span className="btn__spinner" aria-hidden="true" />
                        {Object.values(uploadStates).some(
                          (state) => state?.status === 'uploading',
                        )
                          ? 'Uploading documents'
                          : 'Submitting record'}
                      </>
                    ) : (
                      <>
                        Submit employee record
                        <ArrowRight size={17} aria-hidden="true" />
                      </>
                      )}
                    </button>
                  </div>
                </form>
              </FormProvider>
            </>
          )}
        </main>
      </div>

      <Dialog
        open={confirmDiscard}
        onClose={() => setConfirmDiscard(false)}
        title="Discard saved entry?"
        footer={
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmDiscard(false)}
            >
              Keep entry
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => void discardSavedEntry()}
            >
              Discard entry
            </button>
          </>
        }
      >
        <p>
          This removes the employee details saved in this browser. It cannot be
          undone. Only discard the entry if you no longer need it.
        </p>
      </Dialog>
    </div>
  );
}
