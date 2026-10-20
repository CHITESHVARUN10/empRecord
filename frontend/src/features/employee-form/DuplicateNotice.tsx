import { RotateCcw } from 'lucide-react';
import type { Conflict } from '../../lib/api';
import { DUPLICATE_FIELD_LABELS, type DuplicateField } from '@bpi/shared';

type DuplicateNoticeProps = {
  conflicts: Conflict[];
  onDiscard: () => void;
};

export function DuplicateNotice({
  conflicts,
  onDiscard,
}: DuplicateNoticeProps) {
  const adminContact = import.meta.env.VITE_ADMIN_CONTACT;

  return (
    <div className="duplicate-notice" role="alert">
      <div className="duplicate-notice__head">
        <span className="duplicate-notice__mark" aria-hidden="true">
          !
        </span>
        <div>
          <h2>This entry was not submitted</h2>
          <p>
            Your details are saved on this device, and any uploaded documents
            are linked to this draft. An existing record already uses the
            fields below.
          </p>
        </div>
      </div>

      <ul className="duplicate-notice__list">
        {conflicts.map((conflict) => (
          <li key={conflict.field}>
            <span className="duplicate-notice__field">
              {DUPLICATE_FIELD_LABELS[conflict.field as DuplicateField] ??
                conflict.field}
            </span>
            <span>{conflict.message}</span>
          </li>
        ))}
      </ul>

      <div className="duplicate-notice__foot">
        <p>
          Contact the HR administrator so they can check the existing entry.
          After it is resolved, submit this saved entry again without
          re-uploading the documents.
          {adminContact ? (
            <>
              {' '}
              Administrator contact:{' '}
              <strong>{adminContact}</strong>.
            </>
          ) : null}
        </p>
        <button
          type="button"
          className="btn btn--secondary btn--sm"
          onClick={onDiscard}
        >
          <RotateCcw size={15} aria-hidden="true" />
          Discard saved entry
        </button>
      </div>
    </div>
  );
}
