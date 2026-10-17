import { CalendarClock, Megaphone, Radio } from 'lucide-react';
import { QUICK_FILTER_TONE, type QuickFilterTile } from '../../components';
import type { EventType } from '../../api/events';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  DEADLINE: 'Deadline',
  ANNOUNCEMENT: 'Announcement',
  BROADCAST: 'Broadcast',
};

// Solid bg-* class per type, for IconChip's icon circle (see components/iconChip) — the same
// {label, tone, icon} shape Task/Ticket priority and Status chips already carry.
export const EVENT_TYPE_SOLID: Record<EventType, string> = {
  DEADLINE: 'bg-danger',
  ANNOUNCEMENT: 'bg-primary-600',
  BROADCAST: 'bg-warning',
};

export const EVENT_TYPE_ICONS: Record<EventType, typeof CalendarClock> = {
  DEADLINE: CalendarClock,
  ANNOUNCEMENT: Megaphone,
  BROADCAST: Radio,
};

// Feeds EventList's quick-stat/filter row (QuickFilterStats) — same tinted-tile tone palette
// every other list page's stat row already uses (Tickets/Delegation/Checklists), reusing
// QUICK_FILTER_TONE directly rather than a second copy of the same class strings that could
// drift from it. Danger/neutral(primary)/warning mirror EVENT_TYPE_COLORS' own tone choice for
// each type exactly, just expressed in the tinted-tile shape QuickFilterStats reads.
export const EVENT_TYPE_TILES: QuickFilterTile<EventType>[] = [
  { key: 'DEADLINE', label: EVENT_TYPE_LABELS.DEADLINE, icon: EVENT_TYPE_ICONS.DEADLINE, ...QUICK_FILTER_TONE.danger },
  { key: 'ANNOUNCEMENT', label: EVENT_TYPE_LABELS.ANNOUNCEMENT, shortLabel: 'Notice', icon: EVENT_TYPE_ICONS.ANNOUNCEMENT, ...QUICK_FILTER_TONE.neutral },
  { key: 'BROADCAST', label: EVENT_TYPE_LABELS.BROADCAST, icon: EVENT_TYPE_ICONS.BROADCAST, ...QUICK_FILTER_TONE.warning },
];

// Per-type gradient for EventList's leading icon tile — the same `color-mix(...black)` recipe the
// overdue checklist interstitial uses for its single-color danger tile, extended to all three event
// colors here since a flat `bg-danger` tile reads noticeably flatter next to the rest of the app's
// gradient icon tiles (EntityIconTile, GradientIconTile).
export const EVENT_TYPE_GRADIENT: Record<EventType, string> = {
  DEADLINE: 'linear-gradient(135deg, var(--color-danger) 0%, color-mix(in srgb, var(--color-danger) 70%, black) 100%)',
  ANNOUNCEMENT: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-700) 100%)',
  BROADCAST: 'linear-gradient(135deg, var(--color-warning) 0%, color-mix(in srgb, var(--color-warning) 70%, black) 100%)',
};
