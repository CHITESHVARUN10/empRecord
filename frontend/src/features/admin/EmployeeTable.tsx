import { Link } from 'react-router-dom';
import {
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  ChevronRight,
  FileText,
} from 'lucide-react';
import type { AdminSortField } from '@bpi/shared';
import { DepartmentBadge } from '../../components/DepartmentBadge';
import { TableSkeleton } from '../../components/PageStates';
import {
  formatDateOnly,
  formatTimestampDate,
  initials,
} from '../../lib/format';
import type { EmployeeSummary } from './types';

type EmployeeTableProps = {
  employees: EmployeeSummary[];
  loading: boolean;
  sort: AdminSortField;
  order: 'asc' | 'desc';
  onSort: (field: AdminSortField) => void;
};

function SortIcon({
  field,
  sort,
  order,
}: {
  field: AdminSortField;
  sort: AdminSortField;
  order: 'asc' | 'desc';
}) {
  if (field !== sort) {
    return <ArrowUpDown size={12} aria-hidden="true" opacity={0.45} />;
  }
  return order === 'asc' ? (
    <ArrowUp size={12} aria-hidden="true" />
  ) : (
    <ArrowDown size={12} aria-hidden="true" />
  );
}

function DocumentFlag({
  label,
  present,
}: {
  label: string;
  present: boolean;
}) {
  return (
    <span
      className={`documents__item ${
        present ? 'documents__item--present' : ''
      }`.trim()}
      title={`${label}: ${present ? 'uploaded' : 'not uploaded'}`}
      aria-label={`${label}: ${present ? 'uploaded' : 'not uploaded'}`}
    >
      <FileText size={14} aria-hidden="true" />
    </span>
  );
}

export function EmployeeTable({
  employees,
  loading,
  sort,
  order,
  onSort,
}: EmployeeTableProps) {
  if (loading) return <TableSkeleton rows={6} />;

  const sortableHeader = (field: AdminSortField, label: string) => (
    <th scope="col" aria-sort={sort === field ? (order === 'asc' ? 'ascending' : 'descending') : 'none'}>
      <button type="button" onClick={() => onSort(field)}>
        {label}
        <SortIcon field={field} sort={sort} order={order} />
      </button>
    </th>
  );

  return (
    <div className="table-wrap">
      <table className="data-table">
        <thead>
          <tr>
            {sortableHeader('fullName', 'Employee')}
            {sortableHeader('department', 'Department')}
            {sortableHeader('joiningDate', 'Joining date')}
            <th scope="col">Contact</th>
            <th scope="col">Documents</th>
            {sortableHeader('updatedAt', 'Updated')}
            <th scope="col">
              <span className="sr-only">View record</span>
            </th>
          </tr>
        </thead>
        <tbody>
          {employees.map((employee) => (
            <tr key={employee.id}>
              <td data-label="Employee">
                <Link
                  to={`/admin/employees/${employee.id}`}
                  className="table-person"
                  title={employee.fullName}
                >
                  <span className="avatar" aria-hidden="true">
                    {initials(employee.fullName)}
                  </span>
                  <span className="table-person__copy">
                    <span className="table-person__name">
                      {employee.fullName}
                    </span>
                    <span className="table-person__code">
                      {employee.organization || employee.employeeCode || '—'}
                    </span>
                  </span>
                </Link>
              </td>
              <td data-label="Department">
                <DepartmentBadge department={employee.department} />
              </td>
              <td data-label="Joining date" className="numeric">
                {formatDateOnly(employee.joiningDate)}
              </td>
              <td data-label="Contact">
                <span className="table-contact">
                  <span>{employee.personalMobile}</span>
                  <span>{employee.personalEmail}</span>
                </span>
              </td>
              <td data-label="Documents">
                <span className="documents">
                  <DocumentFlag
                    label="Aadhaar"
                    present={employee.documents.aadhaar}
                  />
                  <DocumentFlag label="PAN" present={employee.documents.pan} />
                  <DocumentFlag
                    label="Passport"
                    present={employee.documents.passport}
                  />
                </span>
              </td>
              <td data-label="Updated" className="numeric">
                {formatTimestampDate(employee.updatedAt)}
              </td>
              <td data-label="Record">
                <Link
                  to={`/admin/employees/${employee.id}`}
                  className="btn btn--ghost btn--sm"
                  aria-label={`View ${employee.fullName}'s record`}
                >
                  View
                  <ChevronRight size={15} aria-hidden="true" />
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
