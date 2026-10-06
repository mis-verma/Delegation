import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

interface FormFieldProps {
  /** Id of the control inside, so clicking the label focuses it. */
  htmlFor?: string;
  label: ReactNode;
  icon?: LucideIcon;
  /** Quiet helper text under the control. */
  hint?: ReactNode;
  /** A heads-up about the choice made here. Not an error: the form can still be saved. */
  warning?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

// Same label look as Input's own, for the controls that have no label prop (Combobox, the weekday
// picker). Hint, warning and error all sit directly under the field they talk about.
export const FormField = ({ htmlFor, label, icon: Icon, hint, warning, error, children, className }: FormFieldProps) => (
  <div className={cn('group/field flex flex-col gap-1.5 w-full', className)}>
    <label
      htmlFor={htmlFor}
      className="flex items-center gap-1.5 px-1 text-xs font-bold tracking-wide text-text-muted transition-colors duration-150 group-focus-within/field:text-primary-600"
    >
      {Icon && <Icon className="size-3.5 text-text-light group-focus-within/field:text-primary-500 transition-colors" strokeWidth={2.5} aria-hidden />}
      {label}
    </label>
    {children}
    {error && (
      <p role="alert" className="flex items-center gap-1.5 px-1 text-xs font-semibold text-danger">
        <AlertCircle className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />
        {error}
      </p>
    )}
    {warning && (
      <p className="flex items-start gap-1.5 px-1 text-xs font-display text-warning">
        <AlertCircle className="size-3.5 shrink-0 mt-px" aria-hidden />
        <span>{warning}</span>
      </p>
    )}
    {hint && <p className="px-1 text-xs font-display text-text-muted">{hint}</p>}
  </div>
);

// A titled group of fields inside a long form. Sentence-case heading, hairline above all but the first.
export const FormSection = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="flex flex-col gap-3 pt-4 border-t border-border first:pt-0 first:border-t-0">
    <h3 className="text-sm font-display font-semibold text-text">{title}</h3>
    {children}
  </section>
);
