import {
  forwardRef,
  useId,
  useState,
  type InputHTMLAttributes,
  type ReactNode,
  type SelectHTMLAttributes,
  type TextareaHTMLAttributes,
} from 'react';
import { AlertCircle, Eye } from 'lucide-react';

type FieldShellProps = {
  id: string;
  label: string;
  hint?: string;
  error?: string;
  required?: boolean;
  infoText?: string;
  infoLabel?: string;
  children: ReactNode;
  className?: string;
  dataField?: string;
};

function InfoHint({ text, label }: { text: string; label: string }) {
  const [open, setOpen] = useState(false);
  const tooltipId = useId();

  return (
    <span
      className="hint"
      onMouseEnter={() => setOpen(true)}
      onMouseLeave={() => setOpen(false)}
    >
      <button
        type="button"
        className="hint__button"
        aria-label={label}
        aria-expanded={open}
        aria-describedby={open ? tooltipId : undefined}
        onFocus={() => setOpen(true)}
        onBlur={() => setOpen(false)}
        onClick={() => setOpen(true)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            setOpen(false);
            event.currentTarget.blur();
          }
        }}
      >
        <Eye size={13} aria-hidden="true" />
      </button>
      {open ? (
        <span className="hint__tooltip" id={tooltipId} role="tooltip">
          {text}
        </span>
      ) : null}
    </span>
  );
}

function FieldShell({
  id,
  label,
  hint,
  error,
  required,
  infoText,
  infoLabel,
  children,
  className = '',
  dataField,
}: FieldShellProps) {
  return (
    <div className={`field ${className}`.trim()} data-field={dataField}>
      <div className="field__label-row">
        <label className="field__label" htmlFor={id}>
          {label}
          {required ? (
            <span className="field__required" aria-hidden="true">
              *
            </span>
          ) : null}
        </label>
        {infoText ? (
          <InfoHint
            text={infoText}
            label={infoLabel ?? 'More information'}
          />
        ) : null}
      </div>
      {children}
      {error ? (
        <div className="field__error" id={`${id}-error`}>
          <AlertCircle size={13} aria-hidden="true" />
          <span>{error}</span>
        </div>
      ) : hint ? (
        <div className="field__hint" id={`${id}-hint`}>
          {hint}
        </div>
      ) : null}
    </div>
  );
}

function describedBy(
  id: string,
  hint: string | undefined,
  error: string | undefined,
): string | undefined {
  if (error) return `${id}-error`;
  if (hint) return `${id}-hint`;
  return undefined;
}

export type TextFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: string;
  hint?: string;
  error?: string;
  infoText?: string;
  infoLabel?: string;
  containerClassName?: string;
  dataField?: string;
};

export const TextField = forwardRef<HTMLInputElement, TextFieldProps>(
  function TextField(
    {
      label,
      hint,
      error,
      infoText,
      infoLabel,
      containerClassName,
      dataField,
      id,
      required,
      ...inputProps
    },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell
        id={fieldId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        infoText={infoText}
        infoLabel={infoLabel}
        className={containerClassName}
        dataField={dataField}
      >
        <input
          {...inputProps}
          ref={ref}
          id={fieldId}
          className={`input ${inputProps.className ?? ''}`.trim()}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
        />
      </FieldShell>
    );
  },
);

export type TextAreaFieldProps = TextareaHTMLAttributes<HTMLTextAreaElement> & {
  label: string;
  hint?: string;
  error?: string;
  containerClassName?: string;
  dataField?: string;
};

export const TextAreaField = forwardRef<HTMLTextAreaElement, TextAreaFieldProps>(
  function TextAreaField(
    {
      label,
      hint,
      error,
      containerClassName,
      dataField,
      id,
      required,
      ...inputProps
    },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell
        id={fieldId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={containerClassName}
        dataField={dataField}
      >
        <textarea
          {...inputProps}
          ref={ref}
          id={fieldId}
          className={`textarea ${inputProps.className ?? ''}`.trim()}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
        />
      </FieldShell>
    );
  },
);

export type SelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

export type SelectFieldProps = SelectHTMLAttributes<HTMLSelectElement> & {
  label: string;
  hint?: string;
  error?: string;
  options: SelectOption[];
  placeholder?: string;
  containerClassName?: string;
  dataField?: string;
};

export const SelectField = forwardRef<HTMLSelectElement, SelectFieldProps>(
  function SelectField(
    {
      label,
      hint,
      error,
      options,
      placeholder,
      containerClassName,
      dataField,
      id,
      required,
      ...selectProps
    },
    ref,
  ) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <FieldShell
        id={fieldId}
        label={label}
        hint={hint}
        error={error}
        required={required}
        className={containerClassName}
        dataField={dataField}
      >
        <select
          {...selectProps}
          ref={ref}
          id={fieldId}
          className={`select ${selectProps.className ?? ''}`.trim()}
          required={required}
          aria-required={required || undefined}
          aria-invalid={error ? true : undefined}
          aria-describedby={describedBy(fieldId, hint, error)}
        >
          {placeholder ? (
            <option value="" disabled>
              {placeholder}
            </option>
          ) : null}
          {options.map((option) => (
            <option
              key={option.value}
              value={option.value}
              disabled={option.disabled}
            >
              {option.label}
            </option>
          ))}
        </select>
      </FieldShell>
    );
  },
);

export type DateFieldProps = Omit<TextFieldProps, 'type'>;

export const DateField = forwardRef<HTMLInputElement, DateFieldProps>(
  function DateField(props, ref) {
    return <TextField {...props} ref={ref} type="date" />;
  },
);

export type CheckboxFieldProps = InputHTMLAttributes<HTMLInputElement> & {
  label: ReactNode;
  hint?: string;
};

export const CheckboxField = forwardRef<HTMLInputElement, CheckboxFieldProps>(
  function CheckboxField({ label, hint, id, ...inputProps }, ref) {
    const generatedId = useId();
    const fieldId = id ?? generatedId;
    return (
      <label className="checkbox" htmlFor={fieldId}>
        <input
          {...inputProps}
          ref={ref}
          id={fieldId}
          type="checkbox"
          aria-describedby={hint ? `${fieldId}-hint` : undefined}
        />
        <span className="checkbox__text">
          <span>{label}</span>
          {hint ? (
            <span className="checkbox__hint" id={`${fieldId}-hint`}>
              {hint}
            </span>
          ) : null}
        </span>
      </label>
    );
  },
);
