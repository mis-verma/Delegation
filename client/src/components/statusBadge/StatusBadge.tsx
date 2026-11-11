import type { LucideIcon } from 'lucide-react';
import { Pill, type PillTone } from '../pill';
import { cn } from '@/lib/utils';

export type StatusVariant = 'success' | 'warning' | 'critical' | 'neutral';

const VARIANT_TONE: Record<StatusVariant, PillTone> = {
  success: 'success',
  warning: 'info',
  critical: 'danger',
  neutral: 'neutral',
};

interface StatusBadgeProps {
  variant: StatusVariant;
  icon?: LucideIcon | false;
  label: string | number;
  title?: string;
  className?: string;
  labelClassName?: string;
}

export const StatusBadge = ({ variant, icon, label, title, className, labelClassName }: StatusBadgeProps) => (
  <Pill tone={VARIANT_TONE[variant]} icon={icon || undefined} dot={icon === false} title={title} className={cn(className, labelClassName)}>
    {label}
  </Pill>
);
