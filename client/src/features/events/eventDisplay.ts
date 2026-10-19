import { CalendarClock, Megaphone, Radio } from 'lucide-react';
import { QUICK_FILTER_TONE, type QuickFilterTile } from '../../components';
import type { EventType } from '../../api/events';

export const EVENT_TYPE_LABELS: Record<EventType, string> = {
  DEADLINE: 'Deadline',
  ANNOUNCEMENT: 'Announcement',
  BROADCAST: 'Broadcast',
};

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

export const EVENT_TYPE_TILES: QuickFilterTile<EventType>[] = [
  { key: 'DEADLINE', label: EVENT_TYPE_LABELS.DEADLINE, icon: EVENT_TYPE_ICONS.DEADLINE, ...QUICK_FILTER_TONE.danger },
  { key: 'ANNOUNCEMENT', label: EVENT_TYPE_LABELS.ANNOUNCEMENT, shortLabel: 'Notice', icon: EVENT_TYPE_ICONS.ANNOUNCEMENT, ...QUICK_FILTER_TONE.neutral },
  { key: 'BROADCAST', label: EVENT_TYPE_LABELS.BROADCAST, icon: EVENT_TYPE_ICONS.BROADCAST, ...QUICK_FILTER_TONE.warning },
];

export const EVENT_TYPE_GRADIENT: Record<EventType, string> = {
  DEADLINE: 'linear-gradient(135deg, var(--color-danger) 0%, color-mix(in srgb, var(--color-danger) 70%, black) 100%)',
  ANNOUNCEMENT: 'linear-gradient(135deg, var(--color-primary-500) 0%, var(--color-primary-700) 100%)',
  BROADCAST: 'linear-gradient(135deg, var(--color-warning) 0%, color-mix(in srgb, var(--color-warning) 70%, black) 100%)',
};
