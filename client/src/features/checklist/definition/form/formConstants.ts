import { Building2, UserRound, Users, type LucideIcon } from 'lucide-react';
import type { ChecklistResponseMode } from '../../../../api/checklistDefinitions';

export const LABEL_CLASS =
  'text-xs font-display font-medium text-text-secondary flex items-center gap-1.5 select-none';

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
