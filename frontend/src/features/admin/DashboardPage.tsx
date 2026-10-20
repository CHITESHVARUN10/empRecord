import { useEffect, useRef, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import {
  keepPreviousData,
  useMutation,
  useQuery,
  useQueryClient,
} from '@tanstack/react-query';
import { CloudUpload, Download, Search, X } from 'lucide-react';
import {
  ADMIN_SORT_FIELDS,
  DEPARTMENTS,
  type AdminSortField,
} from '@bpi/shared';
import { Banner } from '../../components/Banner';
import { EmptyState, ErrorState } from '../../components/PageStates';
import { Pagination } from '../../components/Pagination';
import { apiFetch, apiFetchBlob, ApiError } from '../../lib/api';
import { EmployeeTable } from './EmployeeTable';
import { StatsStrip } from './StatsStrip';
import { adminKeys } from './queries';
import type {
  AdminStats,
  DriveSyncJob,
  EmployeeListResponse,
} from './types';

function asSort(value: string | null): AdminSortField {
  return ADMIN_SORT_FIELDS.includes(value as AdminSortField)
    ? (value as AdminSortField)
    : 'createdAt';
}

export default function DashboardPage() {
  const queryClient = useQueryClient();
  const [params, setParams] = useSearchParams();

  const search = params.get('search') ?? '';
  const department = params.get('department') ?? '';
  const page = Math.max(1, Number(params.get('page') ?? '1') || 1);
  const sort = asSort(params.get('sort'));
  const order = params.get('order') === 'asc' ? 'asc' : 'desc';

  const [searchInput, setSearchInput] = useState(search);

  useEffect(() => {
    setSearchInput(search);
  }, [search]);

  useEffect(() => {
    if (searchInput === search) return;
    const timer = window.setTimeout(() => {
      setParams(
        (current) => {
          const next = new URLSearchParams(current);
          const trimmed = searchInput.trim();
          if (trimmed) next.set('search', trimmed);
          else next.delete('search');
          next.set('page', '1');
          return next;
        },
        { replace: true },
      );
    }, 350);
    return () => window.clearTimeout(timer);
  }, [searchInput, search, setParams]);

  const filters = { search, department, page, sort, order };
  const query = new URLSearchParams();
  if (search) query.set('search', search);
  if (department) query.set('department', department);
  query.set('page', String(page));
  query.set('limit', '20');
  query.set('sort', sort);
  query.set('order', order);

  const statsQuery = useQuery({
    queryKey: adminKeys.stats,
    queryFn: () => apiFetch<AdminStats>('/api/admin/stats'),
  });

  const employeesQuery = useQuery({
    queryKey: adminKeys.employees(filters),
    queryFn: () =>
      apiFetch<EmployeeListResponse>(
        `/api/admin/employees?${query.toString()}`,
      ),
    placeholderData: keepPreviousData,
  });

  const driveSyncQuery = useQuery({
    queryKey: ['admin', 'drive-sync'],
    queryFn: () =>
      apiFetch<DriveSyncJob | null>('/api/admin/drive/sync'),
    refetchInterval: (query) =>
      query.state.data?.status === 'running' ? 2000 : false,
  });

  const startDriveSync = useMutation({
    mutationFn: () =>
      apiFetch<DriveSyncJob>('/api/admin/drive/sync', {
        method: 'POST',
      }),
    onSuccess: (job) => {
      queryClient.setQueryData(['admin', 'drive-sync'], job);
      void queryClient.invalidateQueries({
        queryKey: ['admin', 'drive-sync'],
      });
    },
  });

  const lastCompletedJob = useRef<string | null>(null);

  const driveJob = driveSyncQuery.data ?? startDriveSync.data ?? null;
  const driveRunning =
    startDriveSync.isPending || driveJob?.status === 'running';
  const driveResult =
    driveJob?.status === 'completed' ? driveJob.result : undefined;
  const driveFailureCount = driveResult?.failures.length ?? 0;

  useEffect(() => {
    if (driveJob?.status !== 'completed') return;
    if (lastCompletedJob.current === driveJob.jobId) return;
    lastCompletedJob.current = driveJob.jobId;
    void queryClient.invalidateQueries({
      queryKey: ['admin', 'employees'],
    });
    void queryClient.invalidateQueries({
      queryKey: ['admin', 'stats'],
    });
  }, [driveJob, queryClient]);

  const exportCsv = useMutation({
    mutationFn: () => {
      const exportQuery = new URLSearchParams();
      if (search) exportQuery.set('search', search);
      if (department) exportQuery.set('department', department);
      const suffix = exportQuery.toString();
      return apiFetchBlob(
        `/api/admin/export.csv${suffix ? `?${suffix}` : ''}`,
      );
    },
    onSuccess: (blob) => {
      const url = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = url;
      link.download = `blaupunkt-employee-records-${new Date()
        .toISOString()
        .slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.setTimeout(() => URL.revokeObjectURL(url), 1000);
    },
  });

  const hasFilters = Boolean(search || department);
  const total = employeesQuery.data?.total ?? 0;

  function updateParam(key: string, value: string) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (value) next.set(key, value);
        else next.delete(key);
        if (key !== 'page') next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  function clearFilters() {
    setSearchInput('');
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        next.delete('search');
        next.delete('department');
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  function handleSort(field: AdminSortField) {
    setParams(
      (current) => {
        const next = new URLSearchParams(current);
        if (sort === field) {
          next.set('order', order === 'asc' ? 'desc' : 'asc');
        } else {
          next.set('sort', field);
          next.set('order', 'asc');
        }
        next.set('page', '1');
        return next;
      },
      { replace: true },
    );
  }

  const exportError =
    exportCsv.error instanceof ApiError
      ? exportCsv.error.message
      : exportCsv.error
        ? 'The CSV could not be generated.'
        : undefined;

  const driveError =
    startDriveSync.error instanceof ApiError
      ? startDriveSync.error.message
      : startDriveSync.error
        ? 'The Google Drive upload could not be started.'
        : driveSyncQuery.error instanceof ApiError
          ? driveSyncQuery.error.message
          : driveSyncQuery.error
            ? 'The Google Drive upload status could not be loaded.'
            : driveJob?.status === 'failed'
              ? driveJob.error || 'The Google Drive upload failed.'
              : undefined;

  return (
    <div className="admin-page">
      <header className="admin-page-head">
        <div>
          <span className="eyebrow">Employee records</span>
          <h1>Master record</h1>
          <p>
            {statsQuery.data
              ? `${statsQuery.data.total} employee records across Sales, HO, and Service.`
              : 'Loading employee counts.'}
          </p>
        </div>
        <div className="admin-page-head__actions">
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => startDriveSync.mutate()}
            disabled={
              driveRunning ||
              (!employeesQuery.isLoading && total === 0)
            }
          >
            {driveRunning ? (
              <span className="btn__spinner" aria-hidden="true" />
            ) : (
              <CloudUpload size={16} aria-hidden="true" />
            )}
            {driveRunning
              ? 'Uploading to Google Drive'
              : 'Upload to Google Drive'}
          </button>
          <button
            type="button"
            className="btn btn--secondary"
            onClick={() => exportCsv.mutate()}
            disabled={
              exportCsv.isPending ||
              driveRunning ||
              (!employeesQuery.isLoading && total === 0)
            }
          >
            {exportCsv.isPending ? (
              <span className="btn__spinner" aria-hidden="true" />
            ) : (
              <Download size={16} aria-hidden="true" />
            )}
            {exportCsv.isPending ? 'Preparing CSV' : 'Export CSV'}
          </button>
        </div>
      </header>

      <StatsStrip stats={statsQuery.data} loading={statsQuery.isLoading} />

      {statsQuery.error ? (
        <div className="admin-notice">
          <Banner variant="warning" title="Counts unavailable">
            The summary could not be loaded. The employee table below is still
            available.
          </Banner>
        </div>
      ) : null}

      {exportError ? (
        <div className="admin-notice">
          <Banner variant="danger" title="Export failed">
            {exportError}
          </Banner>
        </div>
      ) : null}

      {driveRunning ? (
        <div className="admin-notice">
          <Banner variant="info" title="Google Drive upload in progress">
            {driveJob?.status === 'running'
              ? `Checked ${driveJob.processed} of ${driveJob.total} employees. ${driveJob.skipped} already-synced employees and ${driveJob.filesSkipped} files skipped; ${driveJob.filesUploaded} files uploaded so far.`
              : 'Starting the upload and checking which employee records are already up to date.'}
          </Banner>
        </div>
      ) : null}

      {driveError ? (
        <div className="admin-notice">
          <Banner variant="danger" title="Google Drive upload failed">
            {driveError}
          </Banner>
        </div>
      ) : null}

      {driveResult && !driveRunning ? (
        <div className="admin-notice">
          <Banner
            variant={driveFailureCount ? 'warning' : 'success'}
            title={
              driveFailureCount
                ? 'Google Drive upload completed with issues'
                : 'Google Drive upload complete'
            }
            actions={
              <>
                <a
                  className="btn btn--secondary btn--sm"
                  href={driveResult.rootFolderWebViewLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open EMP records folder
                </a>
                <a
                  className="btn btn--ghost btn--sm"
                  href={driveResult.csvWebViewLink}
                  target="_blank"
                  rel="noreferrer"
                >
                  Open CSV in Drive
                </a>
              </>
            }
          >
            Scanned {driveResult.employees}{' '}
            {driveResult.employees === 1 ? 'employee' : 'employees'}.
            {' '}Uploaded {driveResult.files}{' '}
            {driveResult.files === 1 ? 'file' : 'files'}.
            {driveResult.skippedEmployees > 0 ||
            driveResult.skippedFiles > 0
              ? ` Skipped ${driveResult.skippedEmployees} already-synced ${
                  driveResult.skippedEmployees === 1
                    ? 'employee'
                    : 'employees'
                } and ${driveResult.skippedFiles} already-synced ${
                  driveResult.skippedFiles === 1 ? 'file' : 'files'
                }.`
              : ''}
            {driveFailureCount
              ? ` ${driveFailureCount} ${
                  driveFailureCount === 1 ? 'item' : 'items'
                } could not be uploaded; run the sync again to retry.`
              : ' The exported CSV will use the Google Drive links.'}
          </Banner>
        </div>
      ) : null}

      <div className="admin-toolbar">
        <div className="search-field">
          <Search size={16} aria-hidden="true" />
          <input
            className="input"
            type="search"
            value={searchInput}
            onChange={(event) => setSearchInput(event.target.value)}
            placeholder="Search records"
            aria-label="Search employee records by code, name, email, or mobile"
          />
        </div>

        <div className="admin-toolbar__right">
          <select
            className="select admin-department-filter"
            value={department}
            onChange={(event) =>
              updateParam('department', event.target.value)
            }
            aria-label="Filter by department"
          >
            <option value="">All departments</option>
            {DEPARTMENTS.map((value) => (
              <option key={value} value={value}>
                {value}
              </option>
            ))}
          </select>

          {hasFilters ? (
            <button
              type="button"
              className="btn btn--ghost btn--sm"
              onClick={clearFilters}
            >
              <X size={15} aria-hidden="true" />
              Clear filters
            </button>
          ) : null}
        </div>
      </div>

      <div className="admin-results-bar">
        <span>
          {employeesQuery.isLoading
            ? 'Loading records'
            : `${total} ${total === 1 ? 'record' : 'records'}`}
        </span>
        {hasFilters ? <span>Filtered view</span> : null}
      </div>

      {employeesQuery.isLoading ? (
        <EmployeeTable
          employees={[]}
          loading
          sort={sort}
          order={order}
          onSort={handleSort}
        />
      ) : employeesQuery.isError ? (
        <ErrorState
          title="Employee records could not be loaded"
          description={
            employeesQuery.error instanceof ApiError
              ? employeesQuery.error.message
              : 'Check your connection and try again.'
          }
          action={
            <button
              type="button"
              className="btn btn--secondary"
              onClick={() => void employeesQuery.refetch()}
            >
              Try again
            </button>
          }
        />
      ) : employeesQuery.data && employeesQuery.data.items.length === 0 ? (
        hasFilters ? (
          <EmptyState
            title="No records match these filters"
            description="Try a different search term or clear the department filter."
            action={
              <button
                type="button"
                className="btn btn--secondary"
                onClick={clearFilters}
              >
                Clear filters
              </button>
            }
          />
        ) : (
          <EmptyState
            title="No employee records yet"
            description="Share the employee form with the team. Submitted records will appear here with their documents."
            action={
              <a
                className="btn btn--primary"
                href="/"
                target="_blank"
                rel="noreferrer"
              >
                Open employee form
              </a>
            }
          />
        )
      ) : (
        <>
          <EmployeeTable
            employees={employeesQuery.data?.items ?? []}
            loading={false}
            sort={sort}
            order={order}
            onSort={handleSort}
          />
          <Pagination
            page={employeesQuery.data?.page ?? 1}
            pages={employeesQuery.data?.pages ?? 1}
            total={total}
            limit={employeesQuery.data?.limit ?? 20}
            onPageChange={(nextPage) =>
              updateParam('page', String(nextPage))
            }
          />
        </>
      )}
    </div>
  );
}
