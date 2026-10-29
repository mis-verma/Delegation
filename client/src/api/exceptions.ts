import { apiFetch } from './http';

export type ExceptionKind = 'TICKET_OVERDUE' | 'TICKET_STALE' | 'TASK_OVERDUE' | 'CHECKLIST_MISSED';

export interface ExceptionItem {
  id: string;
  kind: ExceptionKind;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  storeName: string | null;
  since: string;
  link: string;
  person: string | null;
  remindedAt: string | null;
}

export const exceptionApi = {
  list: (): Promise<ExceptionItem[]> =>
    apiFetch<{ success: boolean; data: ExceptionItem[] }>('/exceptions').then((r) => r.data),
};

export type AttentionLevel = 'red' | 'orange';
export type RunState = 'submitted' | 'missed' | 'not_started' | 'in_progress' | 'to_submit' | 'sent_back' | 'upcoming';
export type DayState = 'done' | 'partial' | 'missed' | 'open' | 'none';

export interface PersonStatus {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  departmentName: string | null;
  storeName: string | null;
  level: AttentionLevel;
  dueToday: number;
  submittedRuns: number;
  missedRuns: number;
  notStartedRuns: number;
  inProgressRuns: number;
  toSubmitRuns: number;
  sentBackRuns: number;
  closingSoon: number;
  overdueTickets: number;
  openTickets: number;
  overdueDelegations: number;
  openDelegations: number;
  missedStreak: number;
  lastRemindedAt: string | null;
}

export interface DayCell {
  date: string;
  state: DayState;
  total: number;
  missed: number;
  done: number;
}

export interface TodayRun {
  id: string;
  userId: string;
  title: string;
  storeName: string | null;
  state: RunState;
  deadline: string;
  opensTime: string | null;
  cutoffTime: string | null;
  doneItems: number;
  totalItems: number;
  closingSoon: boolean;
}

export interface PersonAttentionDetail {
  userId: string;
  name: string;
  avatarUrl: string | null;
  role: string;
  phone: string | null;
  isActive: boolean;
  departmentName: string | null;
  storeName: string | null;
  runs: TodayRun[];
  tickets: { id: string; title: string; status: string; priority: string; tatDueAt: string | null; isOverdue: boolean }[];
  delegations: { id: string; title: string; status: string; dueDate: string | null; overdue: boolean }[];
  week: DayCell[];
  missedStreak: number;
  lastRemindedAt: string | null;
  generatedAt: string;
}

export interface HeatmapRow {
  userId: string;
  name: string;
  avatarUrl: string | null;
  departmentName: string | null;
  cells: DayCell[];
  due: number;
  missed: number;
  fillRate: number | null;
  missedStreak: number;
}

export interface FillHeatmap {
  from: string;
  to: string;
  today: string;
  days: string[];
  people: HeatmapRow[];
}

export interface RemindResult {
  sent: number;
  skipped: number;
  notAllowed: number;
}

export interface TeamApprovals {
  met: number;
  breached: number;
  pending: number;
  rate: number | null;
  decided: number;
  avgDecisionHours: number | null;
  waiting: { total: { now: number; over24h: number } };
}

const withFilter = (path: string, filter: { departmentId?: string; storeId?: string } = {}) => {
  const q = new URLSearchParams();
  if (filter.departmentId) q.set('departmentId', filter.departmentId);
  if (filter.storeId) q.set('storeId', filter.storeId);
  const s = q.toString();
  return s ? `${path}?${s}` : path;
};

export const peopleApi = {
  list: (): Promise<PersonStatus[]> =>
    apiFetch<{ success: boolean; data: PersonStatus[] }>('/exceptions/people').then((r) => r.data),
  person: (userId: string): Promise<PersonAttentionDetail> =>
    apiFetch<{ success: boolean; data: PersonAttentionDetail }>(`/exceptions/people/${encodeURIComponent(userId)}`).then((r) => r.data),
  remind: (userIds: string[]): Promise<RemindResult> =>
    apiFetch<{ success: boolean; data: RemindResult }>('/exceptions/people/remind', { method: 'POST', body: JSON.stringify({ userIds }) }).then((r) => r.data),
  heatmap: (from: string, to: string, filter: { departmentId?: string; storeId?: string } = {}): Promise<FillHeatmap> => {
    const path = withFilter('/exceptions/heatmap', filter);
    const sep = path.includes('?') ? '&' : '?';
    return apiFetch<{ success: boolean; data: FillHeatmap }>(`${path}${sep}from=${from}&to=${to}`).then((r) => r.data);
  },
  approvals: (from: string, to: string): Promise<TeamApprovals> =>
    apiFetch<{ success: boolean; data: TeamApprovals }>(`/exceptions/approvals?from=${encodeURIComponent(from)}&to=${encodeURIComponent(to)}`).then((r) => r.data),
};
