import { BadgeCheck, ClipboardCheck, Crown, Headset, ShieldCheck, Star, User, Users, type LucideIcon } from 'lucide-react';
import type { Role } from '../../api/auth';

export const ROLE_LOOK: Record<Role, { icon: LucideIcon; tone: string }> = {
  ADMIN: { icon: ShieldCheck, tone: 'bg-danger' },
  APPROVAL_MANAGER: { icon: BadgeCheck, tone: 'bg-coral-500' },
  PC: { icon: ClipboardCheck, tone: 'bg-success' },
  SENIOR: { icon: Star, tone: 'bg-primary-800' },
  MANAGER: { icon: Users, tone: 'bg-primary-600' },
  AGENT: { icon: Headset, tone: 'bg-warning' },
  USER: { icon: User, tone: 'bg-text-muted' },
  OWNER: { icon: Crown, tone: 'bg-primary-700' },
};
