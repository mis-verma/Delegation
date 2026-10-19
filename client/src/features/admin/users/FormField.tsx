import type { ReactNode } from 'react';
import { AlertCircle, type LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { EntityIconTile } from '../../../components';

interface FormFieldProps {
  htmlFor?: string;
  label: ReactNode;
  icon?: LucideIcon;
  hint?: ReactNode;
  warning?: ReactNode;
  error?: string;
  children: ReactNode;
  className?: string;
}

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

export const FormSection = ({ title, icon: Icon, description, tone = 'primary', children }: { title: string; icon?: LucideIcon; description?: ReactNode; tone?: 'primary' | 'coral'; children: ReactNode }) => (
  <section className="flex flex-col gap-3.5 rounded-xl border border-border/60 bg-surface-hover/30 dark:bg-surface-hover/20 p-3.5 sm:p-4">
    <div className="flex items-center gap-2.5">
      {Icon && <EntityIconTile icon={Icon} tone={tone} className="size-8 rounded-lg group-hover:scale-100" iconClassName="size-4" />}
      <div className="min-w-0">
        <h3 className="t-card font-display font-bold text-text leading-tight">{title}</h3>
        {description && <p className="t-meta font-display text-text-muted leading-snug">{description}</p>}
      </div>
    </div>
    {children}
  </section>
);

export const FormPreview = ({ lead, title, subtitle, chips }: { lead: ReactNode; title: ReactNode; subtitle?: ReactNode; chips?: ReactNode }) => (
  <div aria-label="Card preview" className="flex items-center gap-3 rounded-xl border border-primary-500/20 bg-linear-to-br from-primary-500/8 to-transparent p-3 sm:p-3.5">
    {lead}
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <div className="min-w-0">
        <p className="t-card font-display font-bold text-text leading-tight truncate">{title}</p>
        {subtitle && <p className="t-meta font-display text-text-muted truncate">{subtitle}</p>}
      </div>
      {chips && <div className="flex flex-wrap gap-1.5">{chips}</div>}
    </div>
  </div>
);
