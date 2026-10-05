import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  /** Points the label at a control that takes an id. Without it the label is plain text. */
  htmlFor?: string;
  required?: boolean;
  /** Small muted note on the label row's right edge, e.g. "From category". Never adds height. */
  aside?: ReactNode;
  /** Validation message, shown straight under the control it belongs to. */
  error?: string;
  className?: string;
  children: ReactNode;
}

const LABEL_CLASS = 'flex items-center gap-1 text-xs font-medium text-text-secondary leading-none';

/** One labelled control in the ticket form's routing grid: visible label on top, the control, and
 *  its own error underneath, so nothing is identified by a placeholder or a hover title alone. */
export const FormField = ({ label, htmlFor, required, aside, error, className = '', children }: FormFieldProps) => {
  const text = (
    <>
      {label}
      {required && <span className="text-danger" aria-hidden>*</span>}
    </>
  );
  return (
    <div className={`flex min-w-0 flex-col gap-1.5 ${className}`}>
      <div className="flex min-w-0 items-center justify-between gap-2">
        {htmlFor ? <label htmlFor={htmlFor} className={LABEL_CLASS}>{text}</label> : <span className={LABEL_CLASS}>{text}</span>}
        {aside && <span className="min-w-0 truncate text-[11px] text-text-light font-display">{aside}</span>}
      </div>
      {children}
      {error && (
        <p className="text-xs text-danger font-display" role="alert">{error}</p>
      )}
    </div>
  );
};
