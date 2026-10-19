import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useDueRange, type CreatedRange } from './createdRange';
import type { Ticket } from '../api/ticket';
import type { Task } from '../api/task';
import { isTicketHandedIn, isTaskHandedIn } from './handedIn';

export type ScoreDrillSla = 'closed_late' | 'closed_on_time' | 'done_late' | 'not_done';
const SLA_VALUES: readonly ScoreDrillSla[] = ['closed_late', 'closed_on_time', 'done_late', 'not_done'];

const SLA_WORDS: Record<ScoreDrillSla, string> = {
  closed_late: 'closed late',
  closed_on_time: 'closed on time',
  done_late: 'finished late',
  not_done: 'not done yet',
};

export interface ScoreDrill {
  active: boolean;
  due: CreatedRange | null;
  sla: ScoreDrillSla | null;
  departmentId: string | null;
  storeId: string | null;
  description: string;
  clear: () => void;
}

export const useScoreDrill = (scope: boolean): ScoreDrill => {
  const [searchParams, setSearchParams] = useSearchParams();
  const dueRange = useDueRange();
  const rawSla = searchParams.get('sla');
  const sla = SLA_VALUES.find((v) => v === rawSla) ?? null;
  const departmentId = scope ? searchParams.get('departmentId') : null;
  const storeId = scope ? searchParams.get('storeId') : null;
  const due = dueRange.range;
  const { clear: clearDue } = dueRange;

  const clear = useCallback(() => {
    clearDue();
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('sla');
      if (scope) {
        next.delete('departmentId');
        next.delete('storeId');
      }
      return next;
    }, { replace: true });
  }, [clearDue, setSearchParams, scope]);

  return useMemo(() => ({
    active: !!due || !!sla || !!departmentId || !!storeId,
    due,
    sla,
    departmentId,
    storeId,
    description: [due ? `due ${due.label}` : '', sla ? SLA_WORDS[sla] : ''].filter(Boolean).join(', '),
    clear,
  }), [due, sla, departmentId, storeId, clear]);
};

const inDue = (drill: ScoreDrill, at: string | null | undefined) => {
  if (!drill.due) return true;
  if (!at) return false;
  const t = new Date(at).getTime();
  return t >= drill.due.from && t < drill.due.to;
};

export const ticketMatchesDrill = (drill: ScoreDrill, t: Ticket): boolean => {
  if (!inDue(drill, t.tatDueAt)) return false;
  if (drill.departmentId && t.departmentId !== drill.departmentId) return false;
  if (drill.storeId && t.storeId !== drill.storeId) return false;
  if (drill.sla === 'not_done') return !isTicketHandedIn(t);
  const finishedAt = t.submittedAt ?? t.closedAt;
  if (drill.sla === 'closed_late') return isTicketHandedIn(t) && !!finishedAt && !!t.tatDueAt && new Date(finishedAt).getTime() > new Date(t.tatDueAt).getTime();
  if (drill.sla === 'closed_on_time') return isTicketHandedIn(t) && !!finishedAt && !!t.tatDueAt && new Date(finishedAt).getTime() <= new Date(t.tatDueAt).getTime();
  return true;
};

export const taskMatchesDrill = (drill: ScoreDrill, t: Task): boolean => {
  if (!inDue(drill, t.dueDate)) return false;
  if (drill.sla === 'not_done') return !isTaskHandedIn(t);
  if (drill.sla === 'done_late') {
    const doneAt = t.submittedAt ?? t.verifiedAt;
    return isTaskHandedIn(t) && !!doneAt && !!t.dueDate && new Date(doneAt).getTime() > new Date(t.dueDate).getTime();
  }
  return true;
};
