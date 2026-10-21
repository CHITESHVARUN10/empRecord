import { useEffect, useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ShieldCheck } from 'lucide-react';
import { Banner } from '../../components/Banner';
import { Dialog } from '../../components/Dialog';
import { TextAreaField, TextField } from '../../components/Field';
import { apiFetch, ApiError } from '../../lib/api';
import { adminKeys } from './queries';
import type { EmployeeDetail, VerificationUpdate } from './types';
import { VerificationBadge } from './VerificationBadge';

type VerificationReviewDialogProps = {
  employee: EmployeeDetail;
  open: boolean;
  onClose: () => void;
};

type FormValues = {
  nameAsPerAadhaar: string;
  aadhaarNumberFromFile: string;
  panNumberFromFile: string;
  aadhaarNumber: string;
  panNumber: string;
  verificationNotes: string;
};

function initialValues(employee: EmployeeDetail): FormValues {
  return {
    nameAsPerAadhaar: employee.nameAsPerAadhaar,
    aadhaarNumberFromFile: employee.aadhaarNumberFromFile,
    panNumberFromFile: employee.panNumberFromFile,
    aadhaarNumber: employee.aadhaarNumber,
    panNumber: employee.panNumber,
    verificationNotes: employee.verificationNotes,
  };
}

export function VerificationReviewDialog({
  employee,
  open,
  onClose,
}: VerificationReviewDialogProps) {
  const queryClient = useQueryClient();
  const [values, setValues] = useState<FormValues>(() =>
    initialValues(employee),
  );
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});
  const [formError, setFormError] = useState<string>();
  const [pendingAction, setPendingAction] = useState<'save' | 'done' | null>(
    null,
  );

  useEffect(() => {
    if (!open) return;
    setValues(initialValues(employee));
    setFieldErrors({});
    setFormError(undefined);
    setPendingAction(null);
  }, [employee, open]);

  const save = useMutation({
    mutationFn: ({
      markVerified,
    }: {
      markVerified: boolean;
    }) => {
      const payload: VerificationUpdate = {
        ...values,
        markVerified,
      };
      return apiFetch<EmployeeDetail>(
        `/api/admin/employees/${employee.id}/verification`,
        {
          method: 'PATCH',
          body: JSON.stringify(payload),
        },
      );
    },
    onSuccess: (updated) => {
      queryClient.setQueryData(adminKeys.employee(employee.id), updated);
      void queryClient.invalidateQueries({
        queryKey: adminKeys.employee(employee.id),
      });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'employees'] });
      void queryClient.invalidateQueries({ queryKey: ['admin', 'stats'] });
      onClose();
    },
    onError: (error) => {
      if (error instanceof ApiError) {
        setFieldErrors(error.fields ?? {});
        setFormError(error.message);
      } else {
        setFormError('The verification details could not be saved.');
      }
      setPendingAction(null);
    },
  });

  function updateValue(field: keyof FormValues, value: string) {
    setValues((current) => ({ ...current, [field]: value }));
    if (fieldErrors[field]) {
      setFieldErrors((current) => {
        const next = { ...current };
        delete next[field];
        return next;
      });
    }
    if (formError) setFormError(undefined);
  }

  function submit(markVerified: boolean) {
    setFormError(undefined);
    setFieldErrors({});
    setPendingAction(markVerified ? 'done' : 'save');
    save.mutate({ markVerified });
  }

  const busy = save.isPending;

  return (
    <Dialog
      open={open}
      onClose={() => {
        if (!busy) onClose();
      }}
      title="Review document verification"
      footer={
        <>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={onClose}
            disabled={busy}
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => submit(false)}
            disabled={busy}
          >
            {busy && pendingAction === 'save' ? 'Saving' : 'Save changes'}
          </button>
          <button
            type="button"
            className="btn btn--primary"
            onClick={() => submit(true)}
            disabled={busy}
          >
            {busy && pendingAction === 'done' ? (
              <span className="btn__spinner" aria-hidden="true" />
            ) : (
              <ShieldCheck size={16} aria-hidden="true" />
            )}
            {busy && pendingAction === 'done'
              ? 'Marking done'
              : 'Save & mark done'}
          </button>
        </>
      }
    >
      <div className="verification-review">
        <div className="verification-review__status">
          <span>
            Aadhaar <VerificationBadge status={employee.aadhaarVerificationStatus} />
          </span>
          <span>
            PAN <VerificationBadge status={employee.panVerificationStatus} />
          </span>
          <span>
            Overall <VerificationBadge status={employee.verificationStatus} />
          </span>
        </div>

        <p className="verification-review__intro">
          Check the numbers entered by the employee against the values read
          from the uploaded documents. Saving recalculates the status. Use
          <strong> Save &amp; mark done </strong>
          after you have reviewed and corrected both documents.
        </p>

        {formError ? (
          <Banner variant="danger" title="Verification not saved">
            {formError}
          </Banner>
        ) : null}

        <div className="field-row">
          <TextField
            label="Name as per Aadhaar"
            value={values.nameAsPerAadhaar}
            onChange={(event) =>
              updateValue('nameAsPerAadhaar', event.target.value)
            }
            maxLength={100}
            error={fieldErrors.nameAsPerAadhaar}
            disabled={busy}
          />
          <TextField
            label="Aadhaar number read from file"
            value={values.aadhaarNumberFromFile}
            onChange={(event) =>
              updateValue('aadhaarNumberFromFile', event.target.value)
            }
            maxLength={20}
            placeholder="1234 5678 9012"
            hint="Leave blank if the file is unreadable."
            error={fieldErrors.aadhaarNumberFromFile}
            disabled={busy}
            className="input--numeric"
          />
          <TextField
            label="PAN number read from file"
            value={values.panNumberFromFile}
            onChange={(event) =>
              updateValue('panNumberFromFile', event.target.value)
            }
            maxLength={10}
            placeholder="ABCDE1234F"
            hint="Leave blank if the file is unreadable."
            error={fieldErrors.panNumberFromFile}
            disabled={busy}
            className="input--code"
          />
        </div>

        <div className="verification-review__source">
          <h3>Employee-entered values</h3>
          <div className="field-row">
            <TextField
              label="Aadhaar number entered by employee"
              value={values.aadhaarNumber}
              onChange={(event) =>
                updateValue('aadhaarNumber', event.target.value)
              }
              maxLength={20}
              error={fieldErrors.aadhaarNumber}
              disabled={busy}
              className="input--numeric"
            />
            <TextField
              label="PAN number entered by employee"
              value={values.panNumber}
              onChange={(event) =>
                updateValue('panNumber', event.target.value)
              }
              maxLength={10}
              error={fieldErrors.panNumber}
              disabled={busy}
              className="input--code"
            />
          </div>
        </div>

        <TextAreaField
          label="Verification notes"
          value={values.verificationNotes}
          onChange={(event) =>
            updateValue('verificationNotes', event.target.value)
          }
          rows={3}
          maxLength={1000}
          hint="Optional. Record why a document needs review or what was corrected."
          error={fieldErrors.verificationNotes}
          disabled={busy}
        />
      </div>
    </Dialog>
  );
}
