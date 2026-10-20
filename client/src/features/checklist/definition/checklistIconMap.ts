import {
  Store, Clock, Star, CheckCircle2, Shield, AlertTriangle, Hash, ShieldCheck, Calendar,
  Gem, Sparkles, KeyRound, Lock, Sun, Moon, Brush, Package, Truck, Wrench, Camera, Banknote,
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
  gem: Gem,
  sparkles: Sparkles,
  key: KeyRound,
  lock: Lock,
  sun: Sun,
  moon: Moon,
  brush: Brush,
  package: Package,
  truck: Truck,
  wrench: Wrench,
  camera: Camera,
  banknote: Banknote,
};

export const CHECKLIST_ICON_KEYS = Object.keys(CHECKLIST_ICON_MAP) as ChecklistIcon[];
