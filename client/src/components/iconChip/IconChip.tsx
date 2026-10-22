import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const SOFT_LOOK: { match: RegExp; box: string; text: string }[] = [
  { match: /bg-danger/, box: 'border-danger/30 bg-danger/10', text: 'text-danger' },
  { match: /bg-warning/, box: 'border-warning/30 bg-warning/10', text: 'text-warning' },
  { match: /bg-success/, box: 'border-success/30 bg-success/10', text: 'text-success' },
  { match: /bg-info/, box: 'border-info/30 bg-info/10', text: 'text-info' },
  { match: /bg-coral/, box: 'border-coral-500/30 bg-coral-500/10', text: 'text-coral-600 dark:text-coral-300' },
  { match: /bg-primary/, box: 'border-primary-500/25 bg-primary-500/10', text: 'text-primary-700 dark:text-primary-300' },
];

export interface IconChipProps {
  icon?: LucideIcon | false;
  label: ReactNode;
  tone?: string;
  toneStyle?: CSSProperties;
  className?: string;
  labelClassName?: string;
  title?: string;
  iconOnlyOnMobile?: boolean;
  soft?: boolean;
  children?: ReactNode;
}

export const IconChip = ({ icon: Icon, label, tone = 'bg-primary-600 dark:bg-primary-400', toneStyle, className, title, labelClassName, iconOnlyOnMobile = false, soft = false, children }: IconChipProps) => {
  const iconOnly = iconOnlyOnMobile && !!Icon;
  const look = soft ? SOFT_LOOK.find((l) => l.match.test(tone)) : undefined;
  return (
  <span
    title={title ?? (iconOnly && typeof label === 'string' ? label : undefined)}
    className={cn(
      'inline-flex items-center gap-1 sm:gap-1.5 h-6 sm:h-7 pr-2 sm:pr-2.5 py-0 max-w-full min-w-0 rounded-full border border-border/60 bg-surface',
      Icon ? 'pl-1' : 'pl-2.5',
      look?.box,
      iconOnly && 'max-sm:size-6 max-sm:justify-center max-sm:gap-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0',
      className,
    )}
  >
    {Icon && (
      <span
        className={cn('flex items-center justify-center size-4 sm:size-5 rounded-full shrink-0 text-white', iconOnly && 'max-sm:size-6', !toneStyle && tone)}
        style={toneStyle}
      >
        <Icon className={cn('size-2.5 sm:size-3', iconOnly && 'max-sm:size-3.5')} strokeWidth={2.75} />
      </span>
    )}
    <span className={cn('min-w-0 truncate t-meta font-display font-semibold text-text-secondary', iconOnly && 'max-sm:sr-only', look?.text, labelClassName)}>{label}</span>
    {iconOnly ? <span className="contents max-sm:hidden">{children}</span> : children}
  </span>
  );
};
