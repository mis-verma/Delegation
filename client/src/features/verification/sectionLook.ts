import { ClipboardCheck, ClipboardList, Inbox, TicketCheck, type LucideIcon } from 'lucide-react';
import type { QueueTab } from './verificationModel';

export type QueueSection = Exclude<QueueTab, 'all'>;

export interface SectionLook {
  label: string;
  icon: LucideIcon;
  tile: string;
  soft: string;
  text: string;
  tone: string;
}

export const SECTION_LOOK: Record<QueueSection, SectionLook> = {
  checklists: {
    label: 'Checklists',
    icon: ClipboardCheck,
    tile: 'from-primary-500 to-primary-700',
    soft: 'border-primary-500/50 bg-primary-500/8',
    text: 'text-primary-700 dark:text-primary-300',
    tone: 'bg-primary-600',
  },
  tickets: {
    label: 'Tickets',
    icon: TicketCheck,
    tile: 'from-coral-500 to-coral-600',
    soft: 'border-coral-500/50 bg-coral-500/8',
    text: 'text-coral-600 dark:text-coral-300',
    tone: 'bg-coral-500',
  },
  delegations: {
    label: 'Delegations',
    icon: ClipboardList,
    tile: 'from-vivid-sky to-vivid-sky/70',
    soft: 'border-vivid-sky/50 bg-vivid-sky/8',
    text: 'text-vivid-sky-text',
    tone: 'bg-vivid-sky',
  },
};

export const ALL_LOOK = { label: 'All', icon: Inbox };
