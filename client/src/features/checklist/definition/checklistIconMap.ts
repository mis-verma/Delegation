import {
  Store, Clock, Star, CheckCircle2, Shield, AlertTriangle, Hash, ShieldCheck, Calendar,
  type LucideIcon,
} from 'lucide-react';
import type { ChecklistIcon } from '../../../api/checklistDefinitions';

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
