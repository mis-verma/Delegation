import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsCardProps {
  icon: LucideIcon;
  title: string;
  /** A small control on the right of the title row, e.g. a role chip. */
  aside?: ReactNode;
  /** One quiet explanatory paragraph under the fields. */
  hint?: string;
  tone?: 'primary' | 'warning';
  children: ReactNode;
}

/**
 * One card per group of settings, shared by Admin settings and the personal Settings tabs: a tinted
 * icon tile and a readable title (not a tiny grey label), the fields, then the explanation in plain
 * text under them.
 */
export const SettingsCard = ({ icon: Icon, title, aside, hint, tone = 'primary', children }: SettingsCardProps) => (
  <section aria-label={title} className="flex flex-col gap-4 p-4 sm:p-5 rounded-2xl border border-border bg-surface">
    <div className="flex items-center gap-3">
      <span className={`flex items-center justify-center size-9 rounded-xl shrink-0 ${tone === 'warning' ? 'bg-warning/10 text-warning' : 'bg-primary-500/10 text-primary-600 dark:text-primary-300'}`}>
        <Icon size={17} aria-hidden />
      </span>
      <h2 className="flex-1 min-w-0 text-base font-display font-bold text-text tracking-tight">{title}</h2>
      {aside}
    </div>
    {children}
    {hint && <p className="text-xs font-display text-text-muted leading-relaxed">{hint}</p>}
  </section>
);
