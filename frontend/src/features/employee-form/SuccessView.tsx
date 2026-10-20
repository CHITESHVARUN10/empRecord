import { ArrowRight, Check } from 'lucide-react';
import { formatDateTime } from '../../lib/format';

export type SubmissionReceipt = {
  employeeCode: string;
  submittedAt: string;
};

export function SuccessView({
  submission,
  onReset,
}: {
  submission: SubmissionReceipt;
  onReset: () => void;
}) {
  return (
    <section className="success-view" aria-live="polite">
      <div className="success-view__mark" aria-hidden="true">
        <Check size={26} />
      </div>
      <span className="eyebrow">Submission complete</span>
      <h1>Record submitted</h1>
      <p className="success-view__intro">
        Your employee details have been sent to the HR administrator. You can
        close this page.
      </p>

      <dl className="success-view__receipt">
        {submission.employeeCode ? (
          <div>
            <dt>Employee code</dt>
            <dd>{submission.employeeCode}</dd>
          </div>
        ) : null}
        <div>
          <dt>Submitted</dt>
          <dd>{formatDateTime(submission.submittedAt)}</dd>
        </div>
      </dl>

      <button type="button" className="btn btn--primary" onClick={onReset}>
        Submit another employee record
        <ArrowRight size={16} aria-hidden="true" />
      </button>
    </section>
  );
}
