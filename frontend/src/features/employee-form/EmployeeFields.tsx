import { useEffect, useRef, useState } from 'react';
import {
  useFormContext,
  useWatch,
  type UseFormRegisterReturn,
} from 'react-hook-form';
import { useQuery } from '@tanstack/react-query';
import {
  isValidCityForState,
  type AttachmentKind,
  type EmployeeInput,
} from '@bpi/shared';
import { X } from 'lucide-react';
import {
  CheckboxField,
  DateField,
  SelectField,
  TextAreaField,
  TextField,
} from '../../components/Field';
import {
  FileDrop,
  type ExistingAttachment,
} from '../../components/FileDrop';
import { apiFetch, type Conflict } from '../../lib/api';
import type { EmployeeListResponse } from '../admin/types';
import type {
  AttachmentUploadStates,
  UploadedDocument,
} from '../../lib/uploads';
import { maximumDobIso } from '../../lib/format';
import {
  bloodGroupOptions,
  cityOptions,
  departmentOptions,
  genderOptions,
  maritalStatusOptions,
  organizationOptions,
  stateOptions,
  type FileMap,
} from './defaults';

export type AdminAttachmentMap = Partial<
  Record<AttachmentKind, ExistingAttachment>
>;

type EmployeeFieldsProps = {
  mode: 'public' | 'admin';
  files: FileMap;
  onFileChange: (kind: AttachmentKind, file: File | null) => void;
  fileErrors: Partial<Record<AttachmentKind, string>>;
  existingAttachments?: AdminAttachmentMap;
  uploadedDocuments?: Partial<Record<AttachmentKind, UploadedDocument>>;
  uploadStates?: AttachmentUploadStates;
  onRetryUpload?: (kind: AttachmentKind) => void;
  passportRemoved?: boolean;
  onRemovePassport?: () => void;
  duplicateConflicts?: Conflict[];
  onIdentifierBlur?: () => void;
  onIdentifierChange?: (field: string) => void;
  currentEmployeeId?: string;
  iraEmployeeId?: string | null;
  onIraEmployeeIdChange?: (id: string | null) => void;
};

function IraField({
  mode,
  currentEmployeeId,
  iraEmployeeId,
  onIraEmployeeIdChange,
  error,
  disabled,
}: {
  mode: 'public' | 'admin';
  currentEmployeeId?: string;
  iraEmployeeId?: string | null;
  onIraEmployeeIdChange?: (id: string | null) => void;
  error?: string;
  disabled?: boolean;
}) {
  const { register, setValue, getValues } =
    useFormContext<EmployeeInput>();
  const [query, setQuery] = useState(() => getValues('ira') ?? '');
  const [debounced, setDebounced] = useState(query.trim());
  const [open, setOpen] = useState(false);
  const registration = register('ira');

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);

  const search = useQuery({
    queryKey: ['admin', 'employees', 'ira', debounced],
    queryFn: () =>
      apiFetch<EmployeeListResponse>(
        `/api/admin/employees?search=${encodeURIComponent(debounced)}&limit=6`,
      ),
    enabled: mode === 'admin' && debounced.length >= 2,
    staleTime: 30_000,
  });

  const results = (search.data?.items ?? []).filter(
    (candidate) => candidate.id !== currentEmployeeId,
  );
  const showResults = mode === 'admin' && open && debounced.length >= 2;
  const selected = Boolean(iraEmployeeId);

  function choose(id: string, fullName: string) {
    setValue('ira', fullName, { shouldDirty: true, shouldValidate: true });
    setQuery(fullName);
    setDebounced(fullName);
    onIraEmployeeIdChange?.(id);
    setOpen(false);
  }

  return (
    <div className="field" data-field="ira">
      <div className="field__label">
        <label htmlFor="employee-ira">IRA (Immediate Reporting Authority)</label>
      </div>
      <div className="ira-field">
        <input
          {...registration}
          id="employee-ira"
          className="input"
          maxLength={100}
          autoComplete="off"
          placeholder={
            mode === 'admin'
              ? 'Type a name or search an employee'
              : 'Type the name'
          }
          onChange={async (event) => {
            await registration.onChange(event);
            setQuery(event.target.value);
            setOpen(true);
            if (iraEmployeeId) onIraEmployeeIdChange?.(null);
          }}
          onFocus={() => setOpen(true)}
          onBlur={async (event) => {
            await registration.onBlur(event);
            window.setTimeout(() => setOpen(false), 150);
          }}
          aria-expanded={showResults}
          aria-controls={showResults ? 'ira-search-results' : undefined}
          aria-autocomplete="list"
          disabled={disabled}
        />
        {selected ? (
          <button
            type="button"
            className="btn btn--ghost btn--icon"
            onClick={() => {
              onIraEmployeeIdChange?.(null);
              setOpen(true);
            }}
            aria-label="Clear linked IRA employee"
            title="Clear linked employee"
          >
            <X size={16} aria-hidden="true" />
          </button>
        ) : null}
      </div>

      {showResults ? (
        <div className="ira-results" id="ira-search-results" role="listbox">
          {search.isLoading ? (
            <div className="ira-results__note">Searching employees...</div>
          ) : search.isError ? (
            <div className="ira-results__note">
              Search unavailable. The typed name will be saved as free text.
            </div>
          ) : results.length === 0 ? (
            <div className="ira-results__note">
              No matching employee. The typed name will be saved as free text.
            </div>
          ) : (
            results.map((candidate) => (
              <button
                key={candidate.id}
                type="button"
                className="ira-results__item"
                role="option"
                aria-selected={false}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => choose(candidate.id, candidate.fullName)}
              >
                <span>{candidate.fullName}</span>
                {candidate.employeeCode ? (
                  <span className="ira-results__code">
                    {candidate.employeeCode}
                  </span>
                ) : null}
              </button>
            ))
          )}
        </div>
      ) : null}

      {error ? (
        <div className="field__error">{error}</div>
      ) : selected ? (
        <div className="field__hint">Linked to an employee record.</div>
      ) : (
        <div className="field__hint">
          {mode === 'admin'
            ? 'Search existing employees or type a name to keep this as free text.'
            : 'Optional. Type the name of the immediate reporting authority.'}
        </div>
      )}
    </div>
  );
}

function nestedMessage(errors: unknown, path: string): string | undefined {
  let current: unknown = errors;
  for (const part of path.split('.')) {
    if (!current || typeof current !== 'object') return undefined;
    current = (current as Record<string, unknown>)[part];
  }
  if (current && typeof current === 'object' && 'message' in current) {
    const message = (current as { message?: unknown }).message;
    return typeof message === 'string' ? message : undefined;
  }
  return undefined;
}

export function EmployeeFields({
  mode,
  files,
  onFileChange,
  fileErrors,
  existingAttachments,
  uploadedDocuments,
  uploadStates,
  onRetryUpload,
  passportRemoved,
  onRemovePassport,
  duplicateConflicts = [],
  onIdentifierBlur,
  onIdentifierChange,
  currentEmployeeId,
  iraEmployeeId,
  onIraEmployeeIdChange,
}: EmployeeFieldsProps) {
  const {
    register,
    control,
    formState: { errors },
    getValues,
    setValue,
  } = useFormContext<EmployeeInput>();

  const permanentState = useWatch({
    control,
    name: 'permanentAddress.state',
  });
  const presentState = useWatch({ control, name: 'presentAddress.state' });
  const presentSameAsPermanent = useWatch({
    control,
    name: 'presentSameAsPermanent',
  });

  const previousPermanentState = useRef(permanentState);
  const previousPresentState = useRef(presentState);

  useEffect(() => {
    if (previousPermanentState.current === permanentState) return;
    const city = getValues('permanentAddress.city');
    if (city && !isValidCityForState(permanentState, city)) {
      setValue('permanentAddress.city', '', { shouldValidate: false });
    }
    previousPermanentState.current = permanentState;
  }, [permanentState, getValues, setValue]);

  useEffect(() => {
    if (previousPresentState.current === presentState) return;
    const city = getValues('presentAddress.city');
    if (city && !isValidCityForState(presentState, city)) {
      setValue('presentAddress.city', '', { shouldValidate: false });
    }
    previousPresentState.current = presentState;
  }, [presentState, getValues, setValue]);

  function errorFor(path: string): string | undefined {
    const conflict = duplicateConflicts.find(
      (item) => item.field === path,
    );
    if (conflict) return conflict.message;
    return nestedMessage(errors, path);
  }

  function bindIdentifier(
    field: string,
    registration: UseFormRegisterReturn,
  ): UseFormRegisterReturn {
    if (mode !== 'public' || (!onIdentifierBlur && !onIdentifierChange)) {
      return registration;
    }
    return {
      ...registration,
      onChange: async (event) => {
        await registration.onChange(event);
        onIdentifierChange?.(field);
      },
      onBlur: async (event) => {
        await registration.onBlur(event);
        onIdentifierBlur?.();
      },
    };
  }

  const employeeCodeRegistration = register('employeeCode');
  const personalEmailRegistration = register('personalEmail');
  const personalMobileRegistration = register('personalMobile');
  const officeMobileRegistration = register('officeMobile');

  return (
    <>
      <section
        className="form-section"
        id="section-personal"
        data-form-section
      >
        <header className="form-section__header">
          <span className="form-section__index">01</span>
          <div>
            <h2>Personal details</h2>
            <p>
              Enter the details exactly as they should appear in the employee
              master record.
            </p>
          </div>
        </header>

        <div className="form-section__body">
          <div className="field-row">
            <TextField
              {...bindIdentifier('employeeCode', employeeCodeRegistration)}
              label="Employee code"
              placeholder="For example BPI-014"
              autoComplete="off"
              maxLength={30}
              hint="Optional"
              infoText="You can find your employee code on your salary slips."
              infoLabel="Where to find your employee code"
              containerClassName="field--full-mobile"
              dataField="employeeCode"
              className="input--code"
              error={errorFor('employeeCode')}
            />
            <SelectField
              {...register('organization')}
              label="Organization"
              placeholder="Select organization"
              options={organizationOptions}
              required
              containerClassName="field--full-mobile"
              dataField="organization"
              error={errorFor('organization')}
            />
            <TextField
              {...register('fullName')}
              label="Employee name"
              placeholder="Full name as on official records"
              autoComplete="name"
              required
              dataField="fullName"
              error={errorFor('fullName')}
            />
            <DateField
              {...register('dateOfBirth')}
              label="Date of birth"
              max={maximumDobIso()}
              required
              dataField="dateOfBirth"
              error={errorFor('dateOfBirth')}
            />
            <SelectField
              {...register('gender')}
              label="Gender"
              options={genderOptions}
              placeholder="Select gender"
              required
              dataField="gender"
              error={errorFor('gender')}
            />
            <TextField
              {...register('nationality')}
              label="Nationality"
              autoComplete="country-name"
              required
              dataField="nationality"
              error={errorFor('nationality')}
            />
            <SelectField
              {...register('maritalStatus')}
              label="Marital status"
              options={maritalStatusOptions}
              placeholder="Select marital status"
              required
              dataField="maritalStatus"
              error={errorFor('maritalStatus')}
            />
            <SelectField
              {...register('bloodGroup')}
              label="Blood group"
              options={bloodGroupOptions}
              placeholder="Select blood group"
              required
              dataField="bloodGroup"
              error={errorFor('bloodGroup')}
            />
            <TextField
              {...register('nominee')}
              label="Nominee"
              placeholder="Full name of nominee"
              autoComplete="off"
              required
              dataField="nominee"
              error={errorFor('nominee')}
            />
            <SelectField
              {...register('department')}
              label="Department"
              options={departmentOptions}
              placeholder="Select department"
              required
              dataField="department"
              error={errorFor('department')}
            />
            <DateField
              {...register('joiningDate')}
              label="Joining date"
              hint="Optional"
              dataField="joiningDate"
              error={errorFor('joiningDate')}
            />
          </div>
        </div>
      </section>

      <section
        className="form-section"
        id="section-identity"
        data-form-section
      >
        <header className="form-section__header">
          <span className="form-section__index">02</span>
          <div>
            <h2>Identity documents</h2>
            <p>
              Aadhaar and PAN documents are required. The passport is optional.
              Upload PDF or JPEG files up to 5 MB each.
              {mode === 'admin'
                ? ' Replacing an Aadhaar or PAN file resets its verification to Pending.'
                : ''}
            </p>
          </div>
        </header>

        <div className="form-section__body document-list">
          <div className="document-block" data-document="aadhaar">
            <div className="document-block__head">
              <h3>Aadhaar</h3>
              <p>12-digit Aadhaar number and a clear copy of the card.</p>
            </div>
            <div className="document-block__fields">
              <TextField
                {...register('aadhaarNumber')}
                label="Aadhaar number"
                inputMode="numeric"
                autoComplete="off"
                maxLength={20}
                placeholder="1234 5678 9012"
                hint="12 digits"
                required
                dataField="aadhaarNumber"
                error={errorFor('aadhaarNumber')}
                className="input--numeric"
              />
              <FileDrop
                id="aadhaar-file"
                name="aadhaar"
                label="Aadhaar document"
                required
                file={files.aadhaar ?? null}
                onFileChange={(file) => onFileChange('aadhaar', file)}
                error={
                  fileErrors.aadhaar ?? errorFor('attachments.aadhaar')
                }
                existing={existingAttachments?.aadhaar}
                uploaded={uploadedDocuments?.aadhaar ?? null}
                uploadStatus={
                  uploadStates?.aadhaar &&
                  uploadStates.aadhaar.status !== 'idle'
                    ? uploadStates.aadhaar.status
                    : undefined
                }
                uploadProgress={uploadStates?.aadhaar?.progress}
                uploadError={uploadStates?.aadhaar?.error}
                onRetryUpload={() => onRetryUpload?.('aadhaar')}
                dataField="attachments.aadhaar"
              />
            </div>
          </div>

          <div className="document-block" data-document="pan">
            <div className="document-block__head">
              <h3>PAN</h3>
              <p>Permanent account number and a clear copy of the card.</p>
            </div>
            <div className="document-block__fields">
              <TextField
                {...register('panNumber')}
                label="PAN number"
                placeholder="ABCDE1234F"
                autoComplete="off"
                maxLength={10}
                hint="10 characters, for example ABCDE1234F"
                required
                dataField="panNumber"
                error={errorFor('panNumber')}
                className="input--code"
              />
              <FileDrop
                id="pan-file"
                name="pan"
                label="PAN document"
                required
                file={files.pan ?? null}
                onFileChange={(file) => onFileChange('pan', file)}
                error={fileErrors.pan ?? errorFor('attachments.pan')}
                existing={existingAttachments?.pan}
                uploaded={uploadedDocuments?.pan ?? null}
                uploadStatus={
                  uploadStates?.pan && uploadStates.pan.status !== 'idle'
                    ? uploadStates.pan.status
                    : undefined
                }
                uploadProgress={uploadStates?.pan?.progress}
                uploadError={uploadStates?.pan?.error}
                onRetryUpload={() => onRetryUpload?.('pan')}
                dataField="attachments.pan"
              />
            </div>
          </div>

          <div className="document-block" data-document="passport">
            <div className="document-block__head">
              <h3>Passport</h3>
              <p>Optional. Add the passport number and a copy if available.</p>
            </div>
            <div className="document-block__fields">
              <TextField
                {...register('passportNumber')}
                label="Passport number"
                placeholder="Optional"
                autoComplete="off"
                maxLength={12}
                hint="Optional"
                dataField="passportNumber"
                error={errorFor('passportNumber')}
                className="input--code"
              />
              <FileDrop
                id="passport-file"
                name="passport"
                label="Passport document"
                file={files.passport ?? null}
                onFileChange={(file) => onFileChange('passport', file)}
                error={fileErrors.passport ?? errorFor('attachments.passport')}
                existing={existingAttachments?.passport}
                uploaded={uploadedDocuments?.passport ?? null}
                uploadStatus={
                  uploadStates?.passport &&
                  uploadStates.passport.status !== 'idle'
                    ? uploadStates.passport.status
                    : undefined
                }
                uploadProgress={uploadStates?.passport?.progress}
                uploadError={uploadStates?.passport?.error}
                onRetryUpload={() => onRetryUpload?.('passport')}
                existingRemoved={passportRemoved}
                canRemoveExisting
                onRemoveExisting={onRemovePassport}
                hint={
                  passportRemoved
                    ? 'The existing passport document will be removed when you save.'
                    : 'Optional. PDF or JPEG up to 5 MB.'
                }
                dataField="attachments.passport"
              />
            </div>
          </div>

          <div className="form-subsection">
            <h3 className="form-subheading">Offer and appointment letters</h3>
            <p className="form-subheading__note">
              Optional. Upload a PDF or JPEG copy of each letter if available.
            </p>
          </div>

          <div className="document-block" data-document="offerLetter">
            <div className="document-block__head">
              <h3>Offer letter</h3>
              <p>Optional. PDF or JPEG up to 5 MB.</p>
            </div>
            <div className="document-block__fields">
              <FileDrop
                id="offer-letter-file"
                name="offerLetter"
                label="Offer letter"
                file={files.offerLetter ?? null}
                onFileChange={(file) => onFileChange('offerLetter', file)}
                error={
                  fileErrors.offerLetter ??
                  errorFor('attachments.offerLetter')
                }
                existing={existingAttachments?.offerLetter}
                uploaded={uploadedDocuments?.offerLetter ?? null}
                uploadStatus={
                  uploadStates?.offerLetter &&
                  uploadStates.offerLetter.status !== 'idle'
                    ? uploadStates.offerLetter.status
                    : undefined
                }
                uploadProgress={uploadStates?.offerLetter?.progress}
                uploadError={uploadStates?.offerLetter?.error}
                onRetryUpload={() => onRetryUpload?.('offerLetter')}
                hint="Optional. PDF or JPEG up to 5 MB."
                dataField="attachments.offerLetter"
              />
            </div>
          </div>

          <div
            className="document-block"
            data-document="appointmentLetter"
          >
            <div className="document-block__head">
              <h3>Job appointment / confirmation letter</h3>
              <p>Optional. PDF or JPEG up to 5 MB.</p>
            </div>
            <div className="document-block__fields">
              <FileDrop
                id="appointment-letter-file"
                name="appointmentLetter"
                label="Appointment / confirmation letter"
                file={files.appointmentLetter ?? null}
                onFileChange={(file) =>
                  onFileChange('appointmentLetter', file)
                }
                error={
                  fileErrors.appointmentLetter ??
                  errorFor('attachments.appointmentLetter')
                }
                existing={existingAttachments?.appointmentLetter}
                uploaded={uploadedDocuments?.appointmentLetter ?? null}
                uploadStatus={
                  uploadStates?.appointmentLetter &&
                  uploadStates.appointmentLetter.status !== 'idle'
                    ? uploadStates.appointmentLetter.status
                    : undefined
                }
                uploadProgress={uploadStates?.appointmentLetter?.progress}
                uploadError={uploadStates?.appointmentLetter?.error}
                onRetryUpload={() => onRetryUpload?.('appointmentLetter')}
                hint="Optional. PDF or JPEG up to 5 MB."
                dataField="attachments.appointmentLetter"
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="form-section"
        id="section-address"
        data-form-section
      >
        <header className="form-section__header">
          <span className="form-section__index">03</span>
          <div>
            <h2>Address and contact</h2>
            <p>
              Add the permanent address, a present address if it differs, and
              the contact details HR should use.
            </p>
          </div>
        </header>

        <div className="form-section__body">
          <h3 className="form-subheading">Permanent address</h3>
          <div className="field-row">
            <TextAreaField
              {...register('permanentAddress.line')}
              label="Address"
              rows={2}
              autoComplete="street-address"
              required
              containerClassName="field--full"
              dataField="permanentAddress.line"
              error={errorFor('permanentAddress.line')}
            />
            <SelectField
              {...register('permanentAddress.state')}
              label="State"
              options={stateOptions}
              placeholder="Select state"
              required
              dataField="permanentAddress.state"
              error={errorFor('permanentAddress.state')}
            />
            <SelectField
              {...register('permanentAddress.city')}
              label="City"
              options={cityOptions(permanentState)}
              placeholder={
                permanentState ? 'Select city' : 'Select a state first'
              }
              disabled={!permanentState}
              hint="Only cities in the selected state are shown."
              required
              dataField="permanentAddress.city"
              error={errorFor('permanentAddress.city')}
            />
            <TextField
              {...register('permanentAddress.pincode')}
              label="Pincode"
              inputMode="numeric"
              autoComplete="postal-code"
              maxLength={8}
              required
              dataField="permanentAddress.pincode"
              error={errorFor('permanentAddress.pincode')}
              className="input--numeric"
            />
            <TextField
              {...bindIdentifier('officeMobile', officeMobileRegistration)}
              label="Office mobile number"
              type="tel"
              inputMode="numeric"
              autoComplete="tel"
              maxLength={14}
              placeholder="10-digit number"
              required
              dataField="officeMobile"
              error={errorFor('officeMobile')}
              className="input--numeric"
            />
            <TextField
              {...register('officeEmail')}
              label="Office email"
              type="email"
              autoComplete="email"
              hint="Optional"
              dataField="officeEmail"
              error={errorFor('officeEmail')}
            />
          </div>

          <div className="present-toggle">
            <CheckboxField
              {...register('presentSameAsPermanent')}
              label="Present address is the same as the permanent address"
              hint="Uncheck if the present address is different."
            />
          </div>

          {!presentSameAsPermanent ? (
            <div className="nested-address">
              <h3 className="form-subheading">Present address</h3>
              <div className="field-row">
                <TextAreaField
                  {...register('presentAddress.line')}
                  label="Address"
                  rows={2}
                  autoComplete="off"
                  required
                  containerClassName="field--full"
                  dataField="presentAddress.line"
                  error={errorFor('presentAddress.line')}
                />
                <SelectField
                  {...register('presentAddress.state')}
                  label="State"
                  options={stateOptions}
                  placeholder="Select state"
                  required
                  dataField="presentAddress.state"
                  error={errorFor('presentAddress.state')}
                />
                <SelectField
                  {...register('presentAddress.city')}
                  label="City"
                  options={cityOptions(presentState)}
                  placeholder={
                    presentState ? 'Select city' : 'Select a state first'
                  }
                  disabled={!presentState}
                  hint="Only cities in the selected state are shown."
                  required
                  dataField="presentAddress.city"
                  error={errorFor('presentAddress.city')}
                />
                <TextField
                  {...register('presentAddress.pincode')}
                  label="Pincode"
                  inputMode="numeric"
                  autoComplete="off"
                  maxLength={8}
                  required
                  dataField="presentAddress.pincode"
                  error={errorFor('presentAddress.pincode')}
                  className="input--numeric"
                />
              </div>
            </div>
          ) : null}

          <div className="form-subsection">
            <h3 className="form-subheading">Personal contact</h3>
            <div className="field-row">
              <TextField
                {...bindIdentifier(
                  'personalMobile',
                  personalMobileRegistration,
                )}
                label="Personal mobile number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                maxLength={14}
                placeholder="10-digit number"
                required
                dataField="personalMobile"
                error={errorFor('personalMobile')}
                className="input--numeric"
              />
              <TextField
                {...bindIdentifier(
                  'personalEmail',
                  personalEmailRegistration,
                )}
                label="Personal email"
                type="email"
                autoComplete="email"
                required
                dataField="personalEmail"
                error={errorFor('personalEmail')}
              />
            </div>
          </div>
        </div>
      </section>

      <section
        className="form-section"
        id="section-emergency"
        data-form-section
      >
        <header className="form-section__header">
          <span className="form-section__index">04</span>
          <div>
            <h2>Emergency contact</h2>
            <p>Who should HR contact if there is an emergency at work.</p>
          </div>
        </header>

        <div className="form-section__body">
          <div className="field-row field-row--three">
            <TextField
              {...register('emergencyContact.name')}
              label="Contact name"
              autoComplete="off"
              required
              dataField="emergencyContact.name"
              error={errorFor('emergencyContact.name')}
            />
            <TextField
              {...register('emergencyContact.relation')}
              label="Relation"
              placeholder="For example Spouse"
              autoComplete="off"
              required
              dataField="emergencyContact.relation"
              error={errorFor('emergencyContact.relation')}
            />
            <TextField
              {...register('emergencyContact.mobile')}
              label="Mobile number"
              type="tel"
              inputMode="numeric"
              autoComplete="off"
              maxLength={14}
              required
              dataField="emergencyContact.mobile"
              error={errorFor('emergencyContact.mobile')}
              className="input--numeric"
            />
          </div>
        </div>
      </section>

      <section
        className="form-section"
        id="section-employment"
        data-form-section
      >
        <header className="form-section__header">
          <span className="form-section__index">05</span>
          <div>
            <h2>Employment and bank details</h2>
            <p>
              Optional. These details can be completed now or added by the HR
              administrator later.
            </p>
          </div>
        </header>

        <div className="form-section__body">
          <div className="field-row">
            <TextField
              {...register('designation')}
              label="Designation"
              autoComplete="organization-title"
              maxLength={100}
              dataField="designation"
              error={errorFor('designation')}
            />
            <IraField
              mode={mode}
              currentEmployeeId={currentEmployeeId}
              iraEmployeeId={iraEmployeeId}
              onIraEmployeeIdChange={onIraEmployeeIdChange}
              error={errorFor('ira') ?? errorFor('iraEmployeeId')}
            />
            <TextField
              {...register('bankName')}
              label="Bank name"
              autoComplete="organization"
              maxLength={120}
              dataField="bankName"
              error={errorFor('bankName')}
            />
            <TextField
              {...register('accountNo')}
              label="Account number"
              inputMode="numeric"
              autoComplete="off"
              maxLength={24}
              dataField="accountNo"
              error={errorFor('accountNo')}
              className="input--numeric"
            />
            <TextField
              {...register('ifscCode')}
              label="IFSC code"
              autoComplete="off"
              maxLength={11}
              placeholder="ABCD0123456"
              dataField="ifscCode"
              error={errorFor('ifscCode')}
              className="input--code"
            />
            <TextField
              {...register('uanNo')}
              label="UAN number"
              inputMode="numeric"
              autoComplete="off"
              maxLength={12}
              dataField="uanNo"
              error={errorFor('uanNo')}
              className="input--numeric"
            />
            <TextField
              {...register('receiverCode')}
              label="Receiver code as per bank"
              autoComplete="off"
              maxLength={30}
              dataField="receiverCode"
              error={errorFor('receiverCode')}
              className="input--code"
            />
          </div>
        </div>
      </section>
    </>
  );
}
