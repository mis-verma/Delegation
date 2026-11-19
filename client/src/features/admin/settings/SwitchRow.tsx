import type { LucideIcon } from 'lucide-react';
import { cn } from '@/lib/utils';
import { StateChip, Switch } from '../../../components';

interface SwitchRowProps {
  icon: LucideIcon;
  tone?: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  disabled?: boolean;
}

export const SwitchRow = ({ icon: Icon, tone = 'bg-primary-700 dark:bg-primary-400', label, description, checked, onChange, id, disabled }: SwitchRowProps) => (
  <div className="flex items-start justify-between gap-3 sm:gap-4">
    <div className="flex min-w-0 items-start gap-3">
      <span aria-hidden className={cn('mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-lg text-white', tone)}>
        <Icon size={16} strokeWidth={2.25} />
      </span>
      <div className="flex min-w-0 flex-col gap-1">
        <span className="flex flex-wrap items-center gap-2">
          <label htmlFor={id} className="text-sm font-display font-semibold text-text cursor-pointer">{label}</label>
          <StateChip active={checked} label={checked ? 'On' : 'Off'} />
        </span>
        <span className="t-meta text-text-muted">{description}</span>
      </div>
    </div>
    <Switch checked={checked} onChange={onChange} id={id} disabled={disabled} className="mt-1 shrink-0" />
  </div>
);
