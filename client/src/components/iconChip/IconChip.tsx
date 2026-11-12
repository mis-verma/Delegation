import type { CSSProperties, ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const LOOKS: { match: RegExp; box: string; text: string }[] = [
  { match: /bg-vivid-red/, box: 'bg-vivid-red/10 ring-vivid-red/25', text: 'text-vivid-red-text' },
  { match: /bg-vivid-sky/, box: 'bg-vivid-sky/10 ring-vivid-sky/25', text: 'text-vivid-sky-text' },
  { match: /bg-vivid-green/, box: 'bg-vivid-green/10 ring-vivid-green/25', text: 'text-vivid-green-text' },
  { match: /bg-vivid-blue/, box: 'bg-vivid-blue/10 ring-vivid-blue/25', text: 'text-vivid-blue-text' },
  { match: /bg-danger/, box: 'bg-danger/10 ring-danger/25', text: 'text-danger' },
  { match: /bg-warning/, box: 'bg-warning/10 ring-warning/25', text: 'text-warning' },
  { match: /bg-success/, box: 'bg-success/10 ring-success/25', text: 'text-success' },
  { match: /bg-info/, box: 'bg-info/10 ring-info/25', text: 'text-info' },
  { match: /bg-coral/, box: 'bg-coral-500/10 ring-coral-500/25', text: 'text-coral-600 dark:text-coral-300' },
  { match: /bg-primary/, box: 'bg-primary-500/10 ring-primary-500/20', text: 'text-primary-700 dark:text-primary-300' },
];

const NEUTRAL = { box: 'bg-surface-hover/70 ring-border/70', text: 'text-text-secondary' };

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

const FAINT_TONE = /\/\d+/;

export const IconChip = ({ icon: Icon, label, tone = 'bg-primary-600 dark:bg-primary-400', toneStyle, className, title, labelClassName, iconOnlyOnMobile = false, children }: IconChipProps) => {
  const iconOnly = iconOnlyOnMobile && !!Icon;
  const faint = FAINT_TONE.test(tone) && !toneStyle;
  const look = LOOKS.find((l) => l.match.test(tone)) ?? NEUTRAL;
  return (
    <span
      title={title ?? (iconOnly && typeof label === 'string' ? label : undefined)}
      className={cn(
        'inline-flex h-7 min-w-0 max-w-full items-center gap-1.5 rounded-lg border border-border/60 bg-surface pr-2.5',
        Icon ? 'pl-1' : 'pl-2.5',
        iconOnly && 'max-sm:size-7 max-sm:justify-center max-sm:gap-0 max-sm:border-0 max-sm:bg-transparent max-sm:p-0',
        className,
      )}
    >
      {Icon && (
        <span
          className={cn('flex size-5 shrink-0 items-center justify-center rounded-md', faint ? cn(tone, look.text) : cn(tone, 'text-white'))}
          style={toneStyle}
          aria-hidden="true"
        >
          <Icon className="size-3" strokeWidth={2.5} />
        </span>
      )}
      <span className={cn('min-w-0 truncate t-meta font-display font-semibold leading-none text-text-secondary', iconOnly && 'max-sm:sr-only', labelClassName)}>{label}</span>
      {iconOnly ? <span className="contents max-sm:hidden">{children}</span> : children}
    </span>
  );
};
