import { Building2, Store } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { Role } from '../../../api/admin';
import { ROLE_LABEL, ROLE_STYLES } from '../roleBadge';

const CHIP = 'inline-flex items-center gap-1 px-1.5 py-0.5 rounded-md border text-[11px] font-display font-semibold whitespace-nowrap';

export const RoleChip = ({ role }: { role: Role }) => (
  <span className={cn(CHIP, ROLE_STYLES[role])}>{ROLE_LABEL[role]}</span>
);

export const DepartmentHeadChip = () => (
  <span className={cn(CHIP, 'border-primary-500/25 bg-primary-500/10 text-primary-700 dark:text-primary-300')}>Department head</span>
);

// Deactivated is a plain neutral tag, not a dimmed card: the person's controls stay at full
// contrast so Reactivate is as easy to reach as any other action.
export const DeactivatedChip = ({ label }: { label: string }) => (
  <span className={cn(CHIP, 'border-border bg-surface-hover text-text-secondary')}>{label}</span>
);

const PLACE = 'inline-flex items-center gap-1 text-[11px] font-display font-medium text-text-muted min-w-0';

export const DepartmentLabel = ({ name }: { name?: string }) => (
  <span className={cn(PLACE, !name && 'italic text-text-light')}>
    <Building2 className="size-3 shrink-0 text-text-light" aria-hidden />
    <span className="truncate">{name ?? 'No department'}</span>
  </span>
);

export const StoreLabel = ({ name }: { name?: string }) => (
  <span className={cn(PLACE, !name && 'italic text-text-light')}>
    <Store className="size-3 shrink-0 text-text-light" aria-hidden />
    <span className="truncate">{name ?? 'No store'}</span>
  </span>
);
