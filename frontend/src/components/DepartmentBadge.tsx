import type { Department } from '@bpi/shared';

const classes: Record<Department, string> = {
  Sales: 'badge--sales',
  HO: 'badge--ho',
  Service: 'badge--service',
};

export function DepartmentBadge({ department }: { department: Department }) {
  return (
    <span className={`badge ${classes[department]}`}>{department}</span>
  );
}
