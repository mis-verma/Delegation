import type { ReactNode } from 'react';
import { DETAIL_HEADING_CLASS } from '../../tasks/taskFormFieldStyles';

interface FormFieldProps {
  label: string;
  icon?: ReactNode;
  /** Red star after the label. Leave off for optional fields and pass `optional` instead. */
  required?: boolean;
  optional?: boolean;
  /** One plain sentence on what to put here. Hidden while an error is showing. */
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}

/**
 * One labelled field: label (with a required star or an "optional" tag), the control, then either
 * the error or a short how-to hint. A visible label and hint replace the old unlabelled chips,
 * whose only explanation was a hover tooltip that a phone never shows.
 */
export const FormField = ({ label, icon, required, optional, hint, error, htmlFor, children }: FormFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className={DETAIL_HEADING_CLASS}>
      {icon}
      {label}
      {required && <span className="text-danger" aria-hidden>*</span>}
      {optional && <span className="font-normal text-text-light">(optional)</span>}
    </label>
    {children}
    {error ? (
      <p className="text-xs text-danger font-display" role="alert">{error}</p>
    ) : hint ? (
      <p className="text-xs text-text-muted font-display">{hint}</p>
    ) : null}
  </div>
);

/** Numbered group heading ("1  What happened"), so the order to fill the form in reads at a glance. */
export const StepHeading = ({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) => (
  <div className="flex items-center gap-2.5">
    <span className="flex items-center justify-center size-6 shrink-0 rounded-full bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 text-xs font-display font-bold">
      {step}
    </span>
    <div className="flex flex-col min-w-0">
      <h3 className="t-card font-display font-semibold text-text leading-tight">{title}</h3>
      {subtitle && <p className="text-xs font-display text-text-muted leading-snug">{subtitle}</p>}
    </div>
  </div>
);
