import type { LeaveEntry, LeaveStatus } from '../../api/leave';

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

export type Phase = 'now' | 'coming' | 'recent';
export type StatusKey = Phase | 'pending' | 'declined';
export type GroupKey = 'decide' | 'mine' | Phase;
export type Show = 'all' | Phase;
export type StatusFilter = 'all' | 'pending' | 'approved' | 'declined';
export type LeaveView = 'cards' | 'list' | 'table';

export interface LeaveGroup {
  key: GroupKey;
  entries: LeaveEntry[];
}

export interface LeaveActions {
  onApprove?: (entry: LeaveEntry) => void;
  onDecline?: (entry: LeaveEntry) => void;
  onRemove?: (entry: LeaveEntry) => void;
}

export const WEEK = 7;

export const STATUS_FILTERS: readonly StatusFilter[] = ['all', 'pending', 'approved', 'declined'];
export const STATUS_FILTER_LABEL: Record<StatusFilter, string> = { all: 'All', pending: 'Pending', approved: 'Approved', declined: 'Declined' };
export const STATUS_FILTER_OF: Record<LeaveStatus, Exclude<StatusFilter, 'all'>> = { PENDING: 'pending', APPROVED: 'approved', DECLINED: 'declined' };

export const VIEW_KEYS: readonly LeaveView[] = ['cards', 'list', 'table'];

export const GROUP_ORDER: readonly GroupKey[] = ['decide', 'mine', 'now', 'coming', 'recent'];
export const GROUP_META: Record<GroupKey, { title: string; hint?: string }> = {
  decide: { title: 'Waiting for your decision', hint: 'Approving skips their checklists on those days.' },
  mine: { title: 'Your requests' },
  now: { title: 'On leave now' },
  coming: { title: 'Coming up' },
  recent: { title: 'Last 30 days' },
};

export const phaseOf = (entry: Span, today: string): Phase =>
  entry.startDate > today ? 'coming' : entry.endDate < today ? 'recent' : 'now';

const REQUEST_KEY: Record<Exclude<LeaveStatus, 'APPROVED'>, StatusKey> = { PENDING: 'pending', DECLINED: 'declined' };

export const statusKeyOf = (entry: LeaveEntry, today: string): StatusKey =>
  entry.status === 'APPROVED' ? phaseOf(entry, today) : REQUEST_KEY[entry.status];

export const groupOf = (entry: LeaveEntry, today: string): GroupKey | null => {
  if (entry.status === 'APPROVED') return phaseOf(entry, today);
  if (entry.mine) return 'mine';
  return entry.status === 'PENDING' ? 'decide' : null;
};

const QUIET_KEYS: ReadonlySet<StatusKey> = new Set<StatusKey>(['recent', 'declined']);

export const stillOpenText = (entry: LeaveEntry, today: string) => (QUIET_KEYS.has(statusKeyOf(entry, today)) ? '' : openWorkText(entry));

const MINE_REMOVE_LABEL: Record<LeaveStatus, string> = {
  PENDING: 'Withdraw your request',
  DECLINED: 'Dismiss this request',
  APPROVED: 'Cancel your leave',
};

export const removeLabel = (entry: LeaveEntry) => (entry.mine ? MINE_REMOVE_LABEL[entry.status] : `Remove leave for ${entry.userName}`);

interface RemoveCopy {
  title: string;
  description: string;
  confirmLabel: string;
  toast: string;
}

const MINE_COPY: Record<LeaveStatus, (entry: LeaveEntry) => RemoveCopy> = {
  PENDING: (entry) => ({ title: 'Withdraw this request?', description: `${leaveRange(entry)}. Your manager will no longer see it.`, confirmLabel: 'Withdraw', toast: 'Request withdrawn.' }),
  DECLINED: () => ({ title: 'Dismiss this request?', description: 'It is removed from your list.', confirmLabel: 'Dismiss', toast: 'Request dismissed.' }),
  APPROVED: () => ({ title: 'Cancel your leave?', description: 'Your checklists run on these days again.', confirmLabel: 'Cancel leave', toast: 'Leave cancelled. Your checklists come back.' }),
};

const approvedRemoveCopy = (entry: LeaveEntry, today: string): RemoveCopy => ({
  title: `Remove leave for ${entry.userName}?`,
  description: entry.startDate <= today ? 'Their checklists come back for the days still ahead. Days already passed stay as they are.' : 'Their checklists will run on these days again.',
  confirmLabel: 'Remove leave',
  toast: 'Leave removed. Their checklists come back.',
});

const OTHER_COPY: Record<LeaveStatus, (entry: LeaveEntry, today: string) => RemoveCopy> = {
  PENDING: (entry) => ({ title: `Remove the request from ${entry.userName}?`, description: 'It is deleted without a decision. Decline it instead if they should be told why.', confirmLabel: 'Remove', toast: 'Request removed.' }),
  DECLINED: approvedRemoveCopy,
  APPROVED: approvedRemoveCopy,
};

export const removeCopy = (entry: LeaveEntry, today: string): RemoveCopy =>
  (entry.mine ? MINE_COPY[entry.status](entry) : OTHER_COPY[entry.status](entry, today));

export interface LeaveViewProps {
  groups: LeaveGroup[];
  today: string;
  isBusy: (id: string) => boolean;
  actionsFor: (entry: LeaveEntry) => LeaveActions;
}
