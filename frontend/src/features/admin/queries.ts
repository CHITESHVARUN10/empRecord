import { useQuery } from '@tanstack/react-query';
import { apiFetch } from '../../lib/api';
import type { EmployeeDetail } from './types';

export const adminKeys = {
  stats: ['admin', 'stats'] as const,
  employees: (filters: Record<string, string | number>) =>
    ['admin', 'employees', filters] as const,
  employee: (id: string) => ['admin', 'employee', id] as const,
};

export function useEmployeeDetail(id: string | undefined) {
  return useQuery({
    queryKey: adminKeys.employee(id ?? ''),
    queryFn: () =>
      apiFetch<EmployeeDetail>(`/api/admin/employees/${id ?? ''}`),
    enabled: Boolean(id),
  });
}
