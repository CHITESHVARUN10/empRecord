import {
  DOCUMENT_VERIFICATION_STATUS_LABELS,
  VERIFICATION_STATUS_LABELS,
  type DocumentVerificationStatus,
  type VerificationStatus,
} from '@bpi/shared';

type VerificationBadgeProps = {
  status: VerificationStatus | DocumentVerificationStatus;
  compact?: boolean;
};

function toneFor(status: VerificationBadgeProps['status']) {
  if (status === 'verified' || status === 'done') return 'success';
  if (status === 'review') return 'warning';
  return 'neutral';
}

export function VerificationBadge({
  status,
  compact = false,
}: VerificationBadgeProps) {
  const label =
    status === 'done' || status === 'pending' || status === 'review'
      ? VERIFICATION_STATUS_LABELS[status]
      : DOCUMENT_VERIFICATION_STATUS_LABELS[status];

  return (
    <span
      className={`badge verification-badge verification-badge--${toneFor(status)}`.trim()}
      title={label}
    >
      {compact && status === 'done' ? 'Verified' : label}
    </span>
  );
}
