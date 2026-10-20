import { useState, type ReactNode } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { ArrowLeft, Pencil, Trash2 } from 'lucide-react';
import { Banner } from '../../components/Banner';
import { DepartmentBadge } from '../../components/DepartmentBadge';
import { Dialog } from '../../components/Dialog';
import { EmptyState, ErrorState, PageLoading } from '../../components/PageStates';
import { apiFetch, ApiError } from '../../lib/api';
import {
  formatCityState,
  formatDateOnly,
  formatDateTime,
  formatMobile,
  initials,
} from '../../lib/format';
import { AttachmentPanel } from './AttachmentPanel';
import { adminKeys, useEmployeeDetail } from './queries';
import type { AttachmentInfo, DeleteEmployeeResult } from './types';

function Definition({
  label,
  children,
  full,
}: {
  label: string;
  children: ReactNode;
  full?: boolean;
}) {
  return (
    <div className={`definition ${full ? 'definition--full' : ''}`.trim()}>
      <dt>{label}</dt>
      <dd>{children || '—'}</dd>
    </div>
  );
}

export default function EmployeeDetailPage() {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const queryClient = useQueryClient();
  const query = useEmployeeDetail(id);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [confirmation, setConfirmation] = useState('');

  const deleteMutation = useMutation({
    mutationFn: (value: string) => {
      if (!id) throw new Error('The employee record could not be found.');
      return apiFetch<DeleteEmployeeResult>(
        `/api/admin/employees/${id}`,
        {
          method: 'DELETE',
          body: JSON.stringify({ confirmation: value }),
        },
      );
    },
    onSuccess: () => {
      setDeleteOpen(false);
      setConfirmation('');
      queryClient.removeQueries({
        queryKey: adminKeys.employee(id ?? ''),
      });
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'employees'],
      });
      void queryClient.invalidateQueries({
        queryKey: adminKeys.stats,
      });
      navigate('/admin', { replace: true });
    },
  });

  const canDelete = confirmation.trim().toLowerCase() === 'confirm';
  const deleteError =
    deleteMutation.error instanceof ApiError
      ? deleteMutation.error.message
      : deleteMutation.error
        ? 'The employee record could not be deleted.'
        : undefined;

  if (query.isLoading) {
    return <PageLoading label="Loading employee record" />;
  }

  if (query.isError) {
    const notFound =
      query.error instanceof ApiError && query.error.status === 404;
    return (
      <div className="admin-page admin-page--narrow">
        <Link className="back-link" to="/admin">
          <ArrowLeft size={15} aria-hidden="true" />
          All records
        </Link>
        {notFound ? (
          <EmptyState
            title="Record not found"
            description="This employee record does not exist or may have been removed."
            action={
              <Link className="btn btn--secondary" to="/admin">
                Back to records
              </Link>
            }
          />
        ) : (
          <ErrorState
            title="Record could not be loaded"
            description={
              query.error instanceof ApiError
                ? query.error.message
                : 'Check your connection and try again.'
            }
            action={
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => void query.refetch()}
              >
                Try again
              </button>
            }
          />
        )}
      </div>
    );
  }

  if (!query.data) return null;
  const employee = query.data;
  const attachments = employee.attachments as Record<
    'aadhaar' | 'pan' | 'passport',
    AttachmentInfo | null
  >;

  return (
    <div className="admin-page admin-page--detail">
      <Link className="back-link" to="/admin">
        <ArrowLeft size={15} aria-hidden="true" />
        All records
      </Link>

      <header className="detail-head">
        <div className="detail-title">
          <span className="avatar avatar--lg" aria-hidden="true">
            {initials(employee.fullName)}
          </span>
          <div>
            <h1>{employee.fullName}</h1>
            <div className="detail-meta">
              <span className="detail-meta__code">
                {employee.employeeCode || 'No employee code'}
              </span>
              <span>{employee.organization || 'Organization not provided'}</span>
              <DepartmentBadge department={employee.department} />
              <span>
                {employee.joiningDate
                  ? `Joined ${formatDateOnly(employee.joiningDate)}`
                  : 'Joining date not provided'}
              </span>
            </div>
          </div>
        </div>
        <div className="admin-page-head__actions">
          <Link
            className="btn btn--primary"
            to={`/admin/employees/${employee.id}/edit`}
          >
            <Pencil size={16} aria-hidden="true" />
            Edit record
          </Link>
          <button
            type="button"
            className="btn btn--danger"
            onClick={() => {
              setConfirmation('');
              deleteMutation.reset();
              setDeleteOpen(true);
            }}
          >
            <Trash2 size={16} aria-hidden="true" />
            Delete record
          </button>
        </div>
      </header>

      <div className="detail-grid">
        <div className="detail-main">
          <section className="detail-panel">
            <div className="detail-panel__head">
              <h2>Personal details</h2>
            </div>
            <dl className="definition-grid">
              <Definition label="Date of birth">
                {formatDateOnly(employee.dateOfBirth)}
              </Definition>
              <Definition label="Gender">{employee.gender}</Definition>
              <Definition label="Nationality">
                {employee.nationality}
              </Definition>
              <Definition label="Marital status">
                {employee.maritalStatus}
              </Definition>
              <Definition label="Blood group">
                {employee.bloodGroup}
              </Definition>
              <Definition label="Nominee">{employee.nominee}</Definition>
            </dl>
          </section>

          <section className="detail-panel">
            <div className="detail-panel__head">
              <h2>Identity and employment</h2>
            </div>
            <dl className="definition-grid">
              <Definition label="Employee code">
                {employee.employeeCode ? (
                  <span className="mono-value">{employee.employeeCode}</span>
                ) : (
                  'Not provided'
                )}
              </Definition>
              <Definition label="Organization">
                {employee.organization || 'Not provided'}
              </Definition>
              <Definition label="Department">
                <DepartmentBadge department={employee.department} />
              </Definition>
              <Definition label="Joining date">
                {employee.joiningDate
                  ? formatDateOnly(employee.joiningDate)
                  : 'Not provided'}
              </Definition>
              <Definition label="Aadhaar number">
                <span className="mono-value">{employee.aadhaarNumber}</span>
              </Definition>
              <Definition label="PAN number">
                <span className="mono-value">{employee.panNumber}</span>
              </Definition>
              <Definition label="Passport number">
                {employee.passportNumber ? (
                  <span className="mono-value">
                    {employee.passportNumber}
                  </span>
                ) : (
                  'Not provided'
                )}
              </Definition>
            </dl>
          </section>

          <section className="detail-panel">
            <div className="detail-panel__head">
              <h2>Address and contact</h2>
            </div>
            <dl className="definition-grid">
              <Definition label="Permanent address" full>
                <address className="address-lines">
                  {employee.permanentAddress.line}
                  <br />
                  {formatCityState(employee.permanentAddress)}
                </address>
              </Definition>
              <Definition label="Office mobile">
                {formatMobile(employee.officeMobile)}
              </Definition>
              <Definition label="Office email">
                {employee.officeEmail || 'Not provided'}
              </Definition>
              <Definition
                label="Present address"
                full
              >
                {employee.presentSameAsPermanent ? (
                    <span>
                    Same as permanent address
                    <br />
                    <span className="definition__quiet">
                      {formatCityState(employee.presentAddress)}
                    </span>
                  </span>
                ) : (
                  <address className="address-lines">
                    {employee.presentAddress.line}
                    <br />
                    {formatCityState(employee.presentAddress)}
                  </address>
                )}
              </Definition>
              <Definition label="Personal mobile">
                {formatMobile(employee.personalMobile)}
              </Definition>
              <Definition label="Personal email">
                {employee.personalEmail}
              </Definition>
            </dl>
          </section>

          <section className="detail-panel">
            <div className="detail-panel__head">
              <h2>Emergency contact</h2>
            </div>
            <dl className="definition-grid definition-grid--three">
              <Definition label="Name">
                {employee.emergencyContact.name}
              </Definition>
              <Definition label="Relation">
                {employee.emergencyContact.relation}
              </Definition>
              <Definition label="Mobile">
                {formatMobile(employee.emergencyContact.mobile)}
              </Definition>
            </dl>
          </section>
        </div>

        <aside className="detail-side">
          <AttachmentPanel attachments={attachments} />

          <section className="detail-panel detail-panel--meta">
            <div className="detail-panel__head">
              <h2>Record timeline</h2>
            </div>
            <dl className="definition-grid definition-grid--single">
              <Definition label="Submitted">
                {formatDateTime(employee.createdAt)}
              </Definition>
              <Definition label="Last updated">
                {formatDateTime(employee.updatedAt)}
              </Definition>
            </dl>
          </section>
        </aside>
      </div>

      {deleteOpen ? (
        <Dialog
          open
          onClose={() => {
            if (deleteMutation.isPending) return;
            setDeleteOpen(false);
            setConfirmation('');
          }}
          title="Delete employee record"
          footer={
            <>
              <button
                type="button"
                className="btn btn--secondary"
                onClick={() => {
                  setDeleteOpen(false);
                  setConfirmation('');
                }}
                disabled={deleteMutation.isPending}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn--danger"
                onClick={() => deleteMutation.mutate(confirmation)}
                disabled={!canDelete || deleteMutation.isPending}
              >
                {deleteMutation.isPending ? (
                  <span className="btn__spinner" aria-hidden="true" />
                ) : (
                  <Trash2 size={16} aria-hidden="true" />
                )}
                {deleteMutation.isPending
                  ? 'Deleting record'
                  : 'Confirm delete'}
              </button>
            </>
          }
        >
          <p>
            Are you sure? This permanently deletes{' '}
            <strong>{employee.fullName}</strong> and all uploaded
            documents. The linked Google Drive folder is also removed. This
            action cannot be undone.
          </p>
          <p>
            Type <strong>confirm</strong> in the box below, then press{' '}
            <strong>Confirm delete</strong>.
          </p>
          <div className="field">
            <label
              className="field__label"
              htmlFor="delete-confirmation"
            >
              Type confirm
            </label>
            <input
              id="delete-confirmation"
              className="input"
              value={confirmation}
              onChange={(event) => {
                setConfirmation(event.target.value);
                if (deleteMutation.error) deleteMutation.reset();
              }}
              placeholder="confirm"
              autoComplete="off"
              spellCheck={false}
              autoFocus
              disabled={deleteMutation.isPending}
            />
          </div>
          {deleteError ? (
            <Banner variant="danger" title="Delete failed">
              {deleteError}
            </Banner>
          ) : null}
        </Dialog>
      ) : null}
    </div>
  );
}
