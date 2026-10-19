import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';

interface SettingsCardProps {
  icon: LucideIcon;
  title: string;
  aside?: ReactNode;
  hint?: string;
  tone?: 'primary' | 'warning';
  children: ReactNode;
}

export const SettingsCard = ({ icon: Icon, title, aside, hint, tone = 'primary', children }: SettingsCardProps) => (
  <section aria-label={title} className="flex flex-col gap-3.5 p-3.5 sm:p-5 rounded-2xl border border-border/60 bg-surface">
    <div className="flex items-center gap-2.5">
      <span className={`flex items-center justify-center size-8 rounded-lg shrink-0 text-white bg-linear-to-br ${tone === 'warning' ? 'from-warning to-warning/70' : 'from-primary-500 to-primary-700'}`}>
        <Icon size={15} strokeWidth={2.25} aria-hidden />
      </span>
      <h2 className="flex-1 min-w-0 t-card font-display font-bold text-text">{title}</h2>
      {aside}
    </div>
    {children}
    {hint && <p className="t-meta font-display text-text-muted leading-relaxed">{hint}</p>}
  </section>
);
