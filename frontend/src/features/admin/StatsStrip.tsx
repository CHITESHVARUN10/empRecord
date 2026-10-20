import { formatDateTime } from '../../lib/format';
import type { AdminStats } from './types';

export function StatsStrip({
  stats,
  loading,
}: {
  stats?: AdminStats;
  loading: boolean;
}) {
  if (loading || !stats) {
    return (
      <div className="stats" aria-hidden="true">
        {Array.from({ length: 5 }).map((_, index) => (
          <div className="stat" key={index}>
            <span className="skeleton" style={{ width: '55%', height: 10 }} />
            <span className="skeleton" style={{ width: '35%', height: 28 }} />
            <span className="skeleton" style={{ width: '48%', height: 10 }} />
          </div>
        ))}
      </div>
    );
  }

  return (
    <div className="stats">
      <div className="stat">
        <span className="stat__label">Total records</span>
        <span className="stat__value">{stats.total}</span>
        <span className="stat__meta">Across three departments</span>
      </div>
      <div className="stat">
        <span className="stat__label">Sales</span>
        <span className="stat__value">{stats.byDepartment.Sales}</span>
        <span className="stat__meta">records</span>
      </div>
      <div className="stat">
        <span className="stat__label">HO</span>
        <span className="stat__value">{stats.byDepartment.HO}</span>
        <span className="stat__meta">records</span>
      </div>
      <div className="stat">
        <span className="stat__label">Service</span>
        <span className="stat__value">{stats.byDepartment.Service}</span>
        <span className="stat__meta">records</span>
      </div>
      <div className="stat">
        <span className="stat__label">Last submission</span>
        <span className="stat__value stat__value--date">
          {stats.lastSubmissionAt
            ? formatDateTime(stats.lastSubmissionAt)
            : 'No submissions'}
        </span>
        <span className="stat__meta">
          {stats.withPassport} passports on file
        </span>
      </div>
    </div>
  );
}
