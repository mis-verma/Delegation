import type { Ticket, TicketStatusUpdate } from '../api/ticket';

type ProgressSource = Pick<Ticket, 'status' | 'statusUpdates'>;

export const isProgressUpdate = (update: Pick<TicketStatusUpdate, 'fromStatus' | 'toStatus'>): boolean =>
  update.fromStatus === 'IN_PROGRESS' && update.toStatus === 'IN_PROGRESS';

const byNewest = (a: TicketStatusUpdate, b: TicketStatusUpdate) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();

export const progressUpdatesOf = (ticket: ProgressSource): TicketStatusUpdate[] =>
  (ticket.statusUpdates ?? []).filter(isProgressUpdate).sort(byNewest);

export const lastWorkTouchOf = (ticket: ProgressSource): string | null => {
  const touches = (ticket.statusUpdates ?? []).filter((u) => u.toStatus === 'IN_PROGRESS').sort(byNewest);
  return touches[0]?.createdAt ?? null;
};

export type Freshness = 'fresh' | 'aging' | 'stale';

const HOUR = 3_600_000;

export const freshnessOf = (iso: string, now: number): Freshness => {
  const hours = (now - new Date(iso).getTime()) / HOUR;
  if (hours < 24) return 'fresh';
  if (hours < 72) return 'aging';
  return 'stale';
};

export const timeAgo = (iso: string, now: number): string => {
  const minutes = Math.max(0, Math.floor((now - new Date(iso).getTime()) / 60_000));
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days === 1) return 'yesterday';
  if (days < 7) return `${days}d ago`;
  return new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'short' });
};

export const FRESHNESS_LOOK: Record<Freshness, { tone: string; chip: string; text: string }> = {
  fresh: { tone: 'bg-success', chip: 'border-success/30 bg-success/10', text: 'text-success' },
  aging: { tone: 'bg-warning', chip: 'border-warning/30 bg-warning/10', text: 'text-warning' },
  stale: { tone: 'bg-danger', chip: 'border-danger/30 bg-danger/10', text: 'text-danger' },
};
