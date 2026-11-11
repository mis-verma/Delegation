import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';

export type PillTone = 'neutral' | 'primary' | 'info' | 'success' | 'danger' | 'violet';

const TONE: Record<PillTone, { box: string; dot: string }> = {
  neutral: { box: 'bg-surface-hover/70 text-text-secondary ring-border/70', dot: 'bg-text-muted' },
  primary: { box: 'bg-primary-500/10 text-primary-700 ring-primary-500/20 dark:text-primary-300', dot: 'bg-primary-600 dark:bg-primary-400' },
  info: { box: 'bg-vivid-sky/10 text-vivid-sky-text ring-vivid-sky/25', dot: 'bg-vivid-sky' },
  success: { box: 'bg-vivid-green/10 text-vivid-green-text ring-vivid-green/25', dot: 'bg-vivid-green' },
  danger: { box: 'bg-vivid-red/10 text-vivid-red-text ring-vivid-red/25', dot: 'bg-vivid-red' },
  violet: { box: 'bg-coral-500/10 text-coral-600 ring-coral-500/25 dark:text-coral-300', dot: 'bg-coral-500' },
};

interface PillProps {
  tone?: PillTone;
  icon?: LucideIcon;
  dot?: boolean;
  solid?: boolean;
  children: ReactNode;
  className?: string;
  title?: string;
}

export const Pill = ({ tone = 'neutral', icon: Icon, dot = false, solid = false, children, className, title }: PillProps) => {
  const look = TONE[tone];
  return (
    <span
      title={title}
      className={cn(
        'inline-flex h-6 max-w-full min-w-0 shrink-0 items-center gap-1.5 rounded-full px-2.5 t-meta font-display font-semibold leading-none tabular-nums ring-1 ring-inset',
        look.box,
        solid && 'ring-0',
        className,
      )}
    >
      {dot && !Icon && <span className={cn('size-1.5 shrink-0 rounded-full', look.dot)} aria-hidden="true" />}
      {Icon && <Icon className="size-3 shrink-0" strokeWidth={2.5} aria-hidden="true" />}
      <span className="min-w-0 truncate">{children}</span>
    </span>
  );
};
