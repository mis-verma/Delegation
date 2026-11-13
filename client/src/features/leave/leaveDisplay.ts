import type { LeaveEntry } from '../../api/leave';

export const DAY = new Intl.DateTimeFormat(undefined, { weekday: 'short', day: 'numeric', month: 'short', timeZone: 'UTC' });
const DAY_MS = 86_400_000;

export const asUtc = (date: string) => new Date(`${date}T00:00:00Z`);
export const addDays = (date: string, n: number) => new Date(asUtc(date).getTime() + n * DAY_MS).toISOString().slice(0, 10);
export const daysBetween = (from: string, to: string) => Math.round((asUtc(to).getTime() - asUtc(from).getTime()) / DAY_MS);
export const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

type Span = Pick<LeaveEntry, 'startDate' | 'endDate'>;

export const leaveRange = (entry: Span) =>
  entry.startDate === entry.endDate ? DAY.format(asUtc(entry.startDate)) : `${DAY.format(asUtc(entry.startDate))} to ${DAY.format(asUtc(entry.endDate))}`;

export const leaveDays = (entry: Span) => plural(daysBetween(entry.startDate, entry.endDate) + 1, 'day', 'days');

export const openWorkText = (entry: Pick<LeaveEntry, 'openTickets' | 'openDelegations'>) =>
  [entry.openTickets > 0 && plural(entry.openTickets, 'ticket', 'tickets'), entry.openDelegations > 0 && plural(entry.openDelegations, 'delegation', 'delegations')]
    .filter(Boolean)
    .join(' and ');
