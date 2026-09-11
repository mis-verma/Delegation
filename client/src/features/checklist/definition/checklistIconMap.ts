import {
  Store, Clock, Star, CheckCircle2, Shield, AlertTriangle, Hash, ShieldCheck, Calendar,
  type LucideIcon,
} from 'lucide-react';
import type { ChecklistIcon } from '../../../api/checklistDefinitions';

// Single source of truth for icon-key -> component, shared by the admin Templates card (which
// displays a definition's icon) and the builder's icon picker (which sets it) — was previously
// duplicated only in ChecklistDefinitionCard.tsx.
export const CHECKLIST_ICON_MAP: Record<ChecklistIcon, LucideIcon> = {
  store: Store,
  clock: Clock,
  star: Star,
  check: CheckCircle2,
  shield: Shield,
  'alert-triangle': AlertTriangle,
  hash: Hash,
  'shield-check': ShieldCheck,
  calendar: Calendar,
};

export const CHECKLIST_ICON_KEYS = Object.keys(CHECKLIST_ICON_MAP) as ChecklistIcon[];
