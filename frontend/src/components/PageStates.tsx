import { AlertCircle, Inbox } from 'lucide-react';
import type { ReactNode } from 'react';

export function PageLoading({ label = 'Loading' }: { label?: string }) {
  return (
    <div className="page-loading" role="status" aria-live="polite">
      <span className="spinner" aria-hidden="true" />
      <span>{label}</span>
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
  icon,
}: {
  title: string;
  description: string;
  action?: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <div className="empty-state">
      <div className="empty-state__icon" aria-hidden="true">
        {icon ?? <Inbox size={20} />}
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="empty-state__actions">{action}</div> : null}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  description = 'The data could not be loaded. Check your connection and try again.',
  action,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="error-state" role="alert">
      <div className="error-state__icon" aria-hidden="true">
        <AlertCircle size={20} />
      </div>
      <h3>{title}</h3>
      <p>{description}</p>
      {action ? <div className="error-state__actions">{action}</div> : null}
    </div>
  );
}

export function TableSkeleton({ rows = 5 }: { rows?: number }) {
  return (
    <div className="table-wrap" aria-hidden="true">
      <div className="skeleton-row" style={{ background: 'var(--surface-2)' }}>
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
        <span className="skeleton" />
      </div>
      {Array.from({ length: rows }).map((_, index) => (
        <div className="skeleton-row" key={index}>
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
          <span className="skeleton" />
        </div>
      ))}
    </div>
  );
}
