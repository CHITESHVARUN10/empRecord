import {
  useEffect,
  useId,
  useRef,
  type ReactNode,
} from 'react';
import { X } from 'lucide-react';

type DialogProps = {
  open: boolean;
  onClose: () => void;
  title: string;
  children: ReactNode;
  footer?: ReactNode;
};

export function Dialog({ open, onClose, title, children, footer }: DialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (open && !dialog.open) {
      dialog.showModal();
    } else if (!open && dialog.open) {
      dialog.close();
    }
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className="dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onClick={(event) => {
        if (event.target === dialogRef.current) onClose();
      }}
    >
      <div className="dialog__header">
        <h2 className="dialog__title" id={titleId}>
          {title}
        </h2>
        <button
          type="button"
          className="btn btn--ghost btn--icon"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={18} aria-hidden="true" />
        </button>
      </div>
      <div className="dialog__body">{children}</div>
      {footer ? <div className="dialog__footer">{footer}</div> : null}
    </dialog>
  );
}
