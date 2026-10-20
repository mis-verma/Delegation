import type { ReactNode } from 'react';

interface FormFieldProps {
  label: string;
  icon?: ReactNode;
  required?: boolean;
  optional?: boolean;
  hint?: ReactNode;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
}

export const FormField = ({ label, icon, required, optional, hint, error, htmlFor, children }: FormFieldProps) => (
  <div className="flex flex-col gap-1.5">
    <label htmlFor={htmlFor} className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-secondary [&_svg]:size-3.5">
      {icon}
      {label}
      {required && <span className="text-danger" aria-hidden>*</span>}
      {optional && <span className="font-normal text-text-light">(optional)</span>}
    </label>
    {children}
    {error ? (
      <p className="t-meta text-danger font-display" role="alert">{error}</p>
    ) : hint ? (
      <p className="hidden sm:block t-meta text-text-muted font-display">{hint}</p>
    ) : null}
  </div>
);

export const StepHeading = ({ step, title, subtitle }: { step: number; title: string; subtitle?: string }) => (
  <div className="flex items-center gap-2.5">
    <span className="flex items-center justify-center size-6 shrink-0 rounded-full bg-primary-500/10 dark:bg-primary-500/15 text-primary-700 dark:text-primary-300 t-meta font-display font-bold">
      {step}
    </span>
    <div className="flex flex-col min-w-0">
      <h3 className="t-card font-display font-semibold text-text leading-tight">{title}</h3>
      {subtitle && <p className="t-meta font-display text-text-muted leading-snug">{subtitle}</p>}
    </div>
  </div>
);
