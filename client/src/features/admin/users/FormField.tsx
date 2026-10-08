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

// A titled group of fields inside a long form: its own soft panel with a tinted icon tile, a
// sentence-case heading and one line saying what the group is for. Border only, no shadow.
export const FormSection = ({ title, icon: Icon, description, children }: { title: string; icon?: LucideIcon; description?: ReactNode; children: ReactNode }) => (
  <section className="flex flex-col gap-3.5 rounded-xl border border-border/60 bg-surface-hover/30 dark:bg-surface-hover/20 p-3.5 sm:p-4">
    <div className="flex items-center gap-2.5">
      {Icon && (
        <span className="flex items-center justify-center size-8 rounded-lg shrink-0 bg-gradient-to-br from-primary-500/15 to-primary-700/10 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/15">
          <Icon className="size-4" aria-hidden />
        </span>
      )}
      <div className="min-w-0">
        <h3 className="text-sm font-display font-bold text-text leading-tight">{title}</h3>
        {description && <p className="text-xs font-display text-text-muted leading-snug">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);
