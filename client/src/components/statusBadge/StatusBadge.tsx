import type { LucideIcon } from 'lucide-react';
import { IconChip } from '../iconChip';
import { cn } from '@/lib/utils';

export type StatusVariant = 'success' | 'warning' | 'critical' | 'neutral';

const STATUS_LOOK: Record<StatusVariant, { tone: string; text: string; box: string }> = {
  success: { tone: 'bg-vivid-green', text: 'text-vivid-green-text', box: 'border-vivid-green/40 bg-vivid-green/10' },
  warning: { tone: 'bg-vivid-sky', text: 'text-vivid-sky-text', box: 'border-vivid-sky/40 bg-vivid-sky/10' },
  critical: { tone: 'bg-vivid-red', text: 'text-vivid-red-text', box: 'border-vivid-red/40 bg-vivid-red/10' },
  neutral: { tone: 'bg-text-muted', text: 'text-text-secondary', box: 'border-border bg-surface-hover/60' },
};

interface StatusBadgeProps {
  variant: StatusVariant;
  icon?: LucideIcon | false;
  label: string | number;
  title?: string;
  className?: string;
  labelClassName?: string;
}

export const StatusBadge = ({ variant, icon, label, title, className, labelClassName }: StatusBadgeProps) => {
  const look = STATUS_LOOK[variant];
  return (
    <IconChip
      icon={icon}
      tone={look.tone}
      label={label}
      title={title}
      labelClassName={cn('tabular-nums', look.text, labelClassName)}
      className={cn('shrink-0', look.box, className)}
    />
  );
};
