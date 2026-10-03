import { Building2, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { ChecklistResponseMode } from '../../../../api/checklistDefinitions';

export const LABEL_CLASS =
  'text-xs font-display font-medium text-text-secondary flex items-center gap-1.5 select-none';

export const SELECT_TRIGGER_CLASS =
  'w-full h-10 px-3 sm:px-3.5 text-sm font-display bg-surface/60 text-text rounded-lg border border-border/70 focus:outline-none focus:ring-2 focus:ring-primary-500/40 focus:border-primary-500/60 transition-all cursor-pointer hover:border-border';

// Who a run belongs to. Shown as a chip on the Templates card (only when not SHARED) and on the
// definition detail header (always), so both read the same.
export const RESPONSE_MODE_LABEL: Record<ChecklistResponseMode, string> = {
  SHARED: 'One shared checklist',
  PER_DEPARTMENT: 'One per department',
  PER_USER: 'One per person',
};

export const RESPONSE_MODE_ICON: Record<ChecklistResponseMode, LucideIcon> = {
  SHARED: Users,
  PER_DEPARTMENT: Building2,
  PER_USER: UserRound,
};
