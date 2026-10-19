
export type Completion = 'done' | 'not_done' | 'not_counted';
export type Compliance = 'on_time' | 'late' | 'missed' | 'reopened' | 'not_counted';

export interface ItemScore {
  scored: boolean;
  completion: Completion;
  compliance: Compliance;
  dueAt: Date | null;
  finishedAt: Date | null;
  reopenCount: number;
}

const toDate = (iso: string | null | undefined) => {
  if (!iso) return null;
  const d = new Date(iso);
  return isNaN(d.getTime()) ? null : d;
};

const judge = (dueAt: Date, finishedAt: Date | null, done: boolean, now: number, reopened: boolean): Pick<ItemScore, 'completion' | 'compliance'> => {
  const isDue = done || reopened || dueAt.getTime() < now;
  if (!isDue) return { completion: 'not_counted', compliance: 'not_counted' };
  const completion: Completion = done ? 'done' : 'not_done';
  if (reopened) return { completion, compliance: 'reopened' };
  if (!done) return { completion, compliance: 'missed' };
  return { completion, compliance: !finishedAt || finishedAt <= dueAt ? 'on_time' : 'late' };
};

export const ticketScore = (
  t: { status: string; tatDueAt: string | null; submittedAt?: string | null; closedAt: string | null; reopenCount?: number },
  now: number,
): ItemScore => {
  const dueAt = toDate(t.tatDueAt);
  const finishedAt = toDate(t.submittedAt) ?? toDate(t.closedAt);
  const reopenCount = t.reopenCount ?? 0;
  if (!dueAt) return { scored: false, completion: 'not_counted', compliance: 'not_counted', dueAt, finishedAt, reopenCount };
  const done = t.status === 'CLOSED' || t.status === 'PENDING_APPROVAL';
  return { scored: true, dueAt, finishedAt, reopenCount, ...judge(dueAt, finishedAt, done, now, reopenCount > 0) };
};

export const taskScore = (
  t: { status: string; dueDate: string | null; submittedAt?: string | null; verifiedAt: string | null; updatedAt: string },
  now: number,
): ItemScore => {
  const dueAt = toDate(t.dueDate);
  const finishedAt = toDate(t.submittedAt) ?? toDate(t.verifiedAt) ?? toDate(t.updatedAt);
  if (!dueAt || t.status === 'draft') return { scored: false, completion: 'not_counted', compliance: 'not_counted', dueAt, finishedAt, reopenCount: 0 };
  const done = t.status === 'done' || t.status === 'pending_approval';
  return { scored: true, dueAt, finishedAt: done ? finishedAt : null, reopenCount: 0, ...judge(dueAt, done ? finishedAt : null, done, now, false) };
};

export const formatSpan = (ms: number) => {
  const mins = Math.max(0, Math.round(Math.abs(ms) / 60_000));
  if (mins < 60) return `${mins}m`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ${mins % 60}m`;
  const days = Math.floor(hours / 24);
  return `${days}d ${hours % 24}h`;
};
