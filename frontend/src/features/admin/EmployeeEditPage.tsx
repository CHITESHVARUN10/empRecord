import { useCallback, useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import {
  FormProvider,
  useForm,
  type FieldErrors,
  type Path,
} from 'react-hook-form';
import { zodResolver } from '@hookform/resolvers/zod';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import {
  ATTACHMENT_KINDS,
  employeeSchema,
  type AttachmentKind,
  type EmployeeInput,
} from '@bpi/shared';
import { ArrowLeft, Save } from 'lucide-react';
import { Banner } from '../../components/Banner';
import { Dialog } from '../../components/Dialog';
import {
  ErrorState,
  PageLoading,
} from '../../components/PageStates';
import { apiFetch, ApiError, type Conflict } from '../../lib/api';
import { createAdminUploadSession } from '../../lib/uploads';
import { formatDateTime } from '../../lib/format';
import {
  EmployeeFields,
  type AdminAttachmentMap,
} from '../employee-form/EmployeeFields';
import { useDocumentUploads } from '../employee-form/useDocumentUploads';
import { adminKeys, useEmployeeDetail } from './queries';
import type { EmployeeDetail } from './types';

type SavePayload = {
  data: EmployeeInput;
  uploadSessionId?: string;
  attachments?: Partial<Record<AttachmentKind, string>>;
  removePassport: boolean;
};

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

function toFormValues(employee: EmployeeDetail): EmployeeInput {
  return {
    employeeCode: employee.employeeCode,
    organization: (employee.organization ??
      '') as EmployeeInput['organization'],
    fullName: employee.fullName,
    dateOfBirth: employee.dateOfBirth,
    gender: employee.gender,
    nationality: employee.nationality,
    maritalStatus: employee.maritalStatus,
    bloodGroup: employee.bloodGroup,
    nominee: employee.nominee,
    aadhaarNumber: employee.aadhaarNumber,
    panNumber: employee.panNumber,
    passportNumber: employee.passportNumber ?? '',
    department: employee.department,
    joiningDate: employee.joiningDate,
    permanentAddress: { ...employee.permanentAddress },
    officeMobile: employee.officeMobile,
    officeEmail: employee.officeEmail ?? '',
    presentSameAsPermanent: employee.presentSameAsPermanent,
    presentAddress: { ...employee.presentAddress },
    personalMobile: employee.personalMobile,
    personalEmail: employee.personalEmail,
    emergencyContact: { ...employee.emergencyContact },
  };
}

function EditForm({ employee }: { employee: EmployeeDetail }) {
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const createUploadSession = useCallback(
    () => createAdminUploadSession(employee.id),
    [employee.id],
  );
  const uploads = useDocumentUploads({
    createSession: createUploadSession,
  });
  const {
    files,
    documents: uploadedDocuments,
    states: uploadStates,
    handleFileChange,
    retry: retryUpload,
    prepareForSubmit,
    clearSession,
  } = uploads;

  const [fileErrors, setFileErrors] = useState<
    Partial<Record<AttachmentKind, string>>
  >({});
  const [passportRemoved, setPassportRemoved] = useState(false);
  const [conflicts, setConflicts] = useState<Conflict[]>([]);
  const [formError, setFormError] = useState<string>();
  const [confirmCancel, setConfirmCancel] = useState(false);
  const [preparing, setPreparing] = useState(false);

  const methods = useForm<EmployeeInput>({
    resolver: zodResolver(employeeSchema),
    mode: 'onBlur',
    defaultValues: toFormValues(employee),
  });

  const {
    formState: { isDirty },
    handleSubmit,
    setError,
    setFocus,
  } = methods;

  const existing: AdminAttachmentMap = {
    aadhaar: employee.attachments.aadhaar ?? undefined,
    pan: employee.attachments.pan ?? undefined,
    passport: employee.attachments.passport ?? undefined,
  };

  const hasChanges =
    isDirty || Object.keys(files).length > 0 || passportRemoved;

  useEffect(() => {
    const handler = (event: BeforeUnloadEvent) => {
      if (!hasChanges) return;
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', handler);
    return () => window.removeEventListener('beforeunload', handler);
  }, [hasChanges]);

  const save = useMutation({
    mutationFn: (payload: SavePayload) =>
      apiFetch<EmployeeDetail>(`/api/admin/employees/${employee.id}`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      }),
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.employee(employee.id), updated);
      void queryClient.invalidateQueries({
        queryKey: adminKeys.employee(employee.id),
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      navigate(`/admin/employees/${employee.id}`, { replace: true });
    },
  });

  function scrollToField(field: string) {
    document
      .querySelector(`[data-field="${field}"]`)
      ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }

  function changeFile(kind: AttachmentKind, file: File | null) {
    if (file) {
      setFileErrors((current) => ({ ...current, [kind]: undefined }));
      if (kind === 'passport') setPassportRemoved(false);
    }
    handleFileChange(kind, file);
  }

  const submit = async (values: EmployeeInput) => {
    setFormError(undefined);
    setConflicts([]);
    setPreparing(true);

    try {
      const prepared = await prepareForSubmit(
        ['aadhaar', 'pan'],
        {
          aadhaar: Boolean(existing.aadhaar),
          pan: Boolean(existing.pan),
        },
      );
      setFileErrors(prepared.errors);

      if (Object.keys(prepared.errors).length > 0) {
        const firstKind = ATTACHMENT_KINDS.find(
          (kind) => prepared.errors[kind],
        );
        if (firstKind) scrollToField(`attachments.${firstKind}`);
        setFormError(
          'Some documents did not finish uploading. Your changes and uploaded documents are kept; retry the upload or remove the file, then save again.',
        );
        return;
      }

      const attachments: Partial<Record<AttachmentKind, string>> = {};
      for (const kind of ATTACHMENT_KINDS) {
        const document = prepared.documents[kind];
        if (document) attachments[kind] = document.pathname;
      }

      const payload: SavePayload = {
        data: values,
        removePassport:
          passportRemoved && !prepared.documents.passport,
      };

      if (Object.keys(attachments).length > 0) {
        if (!prepared.session) {
          setFormError(
            'The document upload session is missing. Retry the upload and save again.',
          );
          return;
        }
        payload.uploadSessionId = prepared.session.sessionId;
        payload.attachments = attachments;
      }

      save.mutate(payload);
    } finally {
      setPreparing(false);
    }
  };

  const invalid = (formErrors: FieldErrors<EmployeeInput>) => {
    const first = findFirstErrorPath(formErrors);
    if (!first) return;
    setFocus(first as Path<EmployeeInput>);
    scrollToField(first);
  };

  function handleCancel() {
    if (!hasChanges) {
      navigate(`/admin/employees/${employee.id}`);
      return;
    }
    setConfirmCancel(true);
  }

  const busy = preparing || save.isPending;
  const apiError = save.error instanceof ApiError ? save.error : undefined;
  const generalError =
    formError ??
    (apiError && apiError.status !== 409 ? apiError.message : undefined);

  useEffect(() => {
    if (!apiError) return;

    if (apiError.status === 410) {
      clearSession();
      setFormError(
        'The document upload session expired. Your changes are kept; retry saving and the selected documents will be uploaded again.',
      );
      return;
    }

    if (apiError.status === 409 && apiError.conflicts?.length) {
      setConflicts(apiError.conflicts);
      for (const conflict of apiError.conflicts) {
        setError(conflict.field as Path<EmployeeInput>, {
          type: 'server',
          message: conflict.message,
        });
      }
      scrollToField(apiError.conflicts[0].field);
      return;
    }

    if (apiError.fields) {
      const attachmentErrors: Partial<Record<AttachmentKind, string>> = {};
      for (const [field, message] of Object.entries(apiError.fields)) {
        if (field.startsWith('attachments.')) {
          const kind = field.split('.')[1] as AttachmentKind;
          attachmentErrors[kind] = message;
        } else if (field !== 'form') {
          setError(field as Path<EmployeeInput>, {
            type: 'server',
            message,
          });
        }
      }
      if (Object.keys(attachmentErrors).length > 0) {
        setFileErrors((current) => ({ ...current, ...attachmentErrors }));
      }
      const firstField = Object.keys(apiError.fields)[0];
      if (firstField) scrollToField(firstField);
    }
  }, [apiError, setError, clearSession]);

  return (
    <div className="admin-page edit-page">
      <Link className="back-link" to={`/admin/employees/${employee.id}`}>
        <ArrowLeft size={15} aria-hidden="true" />
        Back to record
      </Link>

      <header className="admin-page-head">
        <div>
          <span className="eyebrow">Edit record</span>
          <h1>{employee.fullName}</h1>
          <p>
            {employee.employeeCode} · Last updated{' '}
            {formatDateTime(employee.updatedAt)}
          </p>
        </div>
      </header>

      {generalError ? (
        <div className="admin-notice">
          <Banner variant="danger" title="Changes were not saved">
            {generalError}
          </Banner>
        </div>
      ) : null}

      {conflicts.length > 0 ? (
        <div className="admin-notice">
          <Banner variant="warning" title="Duplicate details">
            Correct the highlighted fields. Employee code, personal email,
            personal mobile, and office mobile must be unique.
          </Banner>
        </div>
      ) : null}

      <FormProvider {...methods}>
        <form
          className="form-sheet form-sheet--admin"
          onSubmit={handleSubmit(submit, invalid)}
          noValidate
          aria-busy={busy}
        >
          <EmployeeFields
            mode="admin"
            files={files}
            onFileChange={changeFile}
            fileErrors={fileErrors}
            uploadedDocuments={uploadedDocuments}
            uploadStates={uploadStates}
            onRetryUpload={retryUpload}
            existingAttachments={existing}
            passportRemoved={passportRemoved}
            onRemovePassport={() => setPassportRemoved(true)}
            duplicateConflicts={conflicts}
          />

          <div className="edit-savebar">
            <span className="edit-savebar__note">
              {busy
                ? save.isPending
                  ? 'Saving changes'
                  : 'Uploading documents'
                : hasChanges
                  ? 'Unsaved changes'
                  : 'No changes yet'}
            </span>
            <div className="edit-savebar__actions">
              <button
                type="button"
                className="btn btn--secondary"
                onClick={handleCancel}
                disabled={busy}
              >
                Cancel
              </button>
              <button
                type="submit"
                className="btn btn--primary"
                disabled={busy}
              >
                {busy ? (
                  <>
                    <span className="btn__spinner" aria-hidden="true" />
                    {save.isPending ? 'Saving' : 'Uploading'}
                  </>
                ) : (
                  <>
                    <Save size={16} aria-hidden="true" />
                    Save changes
                  </>
                )}
              </button>
            </div>
          </div>
        </form>
      </FormProvider>

      <Dialog
        open={confirmCancel}
        onClose={() => setConfirmCancel(false)}
        title="Discard changes?"
        footer={
          <>
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => setConfirmCancel(false)}
            >
              Keep editing
            </button>
            <button
              type="button"
              className="btn btn--danger"
              onClick={() => navigate(`/admin/employees/${employee.id}`)}
            >
              Discard changes
            </button>
          </>
        }
      >
        <p>
          The changes made to this record will not be saved. This cannot be
          undone.
        </p>
      </Dialog>

      <span className="sr-only" aria-live="polite">
        {busy ? 'Saving changes' : ''}
      </span>
    </div>
  );
}

export default function EmployeeEditPage() {
  const { id } = useParams<{ id: string }>();
  const query = useEmployeeDetail(id);

  if (query.isLoading) {
    return <PageLoading label="Loading employee record" />;
  }

  if (query.isError) {
    return (
      <div className="admin-page admin-page--narrow">
        <ErrorState
          title="Record could not be loaded"
          description={
            query.error instanceof ApiError
              ? query.error.message
              : 'Check your connection and try again.'
          }
          action={
            <Link className="btn btn--secondary" to="/admin">
              Back to records
            </Link>
          }
        />
      </div>
    );
  }

  if (!query.data) return null;
  return <EditForm employee={query.data} />;
}
