import type { LucideIcon } from 'lucide-react';
import { Switch } from '../../../components';

interface SwitchRowProps {
  icon: LucideIcon;
  iconClassName?: string;
  label: string;
  description: string;
  checked: boolean;
  onChange: (checked: boolean) => void;
  id: string;
  disabled?: boolean;
}

export const SwitchRow = ({ icon: Icon, iconClassName = 'text-primary-500', label, description, checked, onChange, id, disabled }: SwitchRowProps) => (
  <div className="flex items-center justify-between gap-4">
    <div className="flex items-center gap-2.5">
      <Icon size={16} className={`${iconClassName} shrink-0`} />
      <div className="flex flex-col">
        <span className="text-sm font-display font-semibold text-text">{label}</span>
        <span className="t-meta text-text-muted">{description}</span>
      </div>
    </div>
    <Switch checked={checked} onChange={onChange} id={id} disabled={disabled} />
  </div>
);
