import { AlertTriangle, CheckCircle2, Info, XCircle } from 'lucide-react';
import type { ReactNode } from 'react';

export type BannerVariant = 'info' | 'success' | 'warning' | 'danger';

const icons = {
  info: Info,
  success: CheckCircle2,
  warning: AlertTriangle,
  danger: XCircle,
};

export function Banner({
  variant = 'info',
  title,
  children,
  actions,
}: {
  variant?: BannerVariant;
  title?: string;
  children: ReactNode;
  actions?: ReactNode;
}) {
  const Icon = icons[variant];
  const isAlert = variant === 'danger' || variant === 'warning';

  return (
    <div
      className={`banner banner--${variant}`}
      role={isAlert ? 'alert' : 'status'}
      aria-live={isAlert ? 'assertive' : 'polite'}
    >
      <Icon className="banner__icon" size={18} aria-hidden="true" />
      <div className="banner__content">
        {title ? <div className="banner__title">{title}</div> : null}
        <div className="banner__body">{children}</div>
        {actions ? <div className="banner__actions">{actions}</div> : null}
      </div>
    </div>
  );
}
