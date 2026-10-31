import type { Ticket } from '../../api/ticket';
import type { Task } from '../../api/task';

export const LATE_AFTER_MS = 24 * 3_600_000;

export interface SectionStats {
  count: number;
  late: number;
  oldest: number | null;
}

export const EMPTY_STATS: SectionStats = { count: 0, late: 0, oldest: null };

export const summarize = (waitingSince: number[], now: number): SectionStats => {
  let late = 0;
  let oldest: number | null = null;
  for (const since of waitingSince) {
    if (now - since >= LATE_AFTER_MS) late += 1;
    if (oldest === null || since < oldest) oldest = since;
  }
  return { count: waitingSince.length, late, oldest };
};

export const ticketWaitingSince = (ticket: Ticket): number => {
  let latest: number | null = null;
  for (const update of ticket.statusUpdates) {
    if (update.toStatus !== 'PENDING_APPROVAL') continue;
    const at = new Date(update.createdAt).getTime();
    if (latest === null || at > latest) latest = at;
  }
  return latest ?? new Date(ticket.updatedAt).getTime();
};

export const taskWaitingSince = (task: Task): number => new Date(task.submittedAt ?? task.updatedAt).getTime();
