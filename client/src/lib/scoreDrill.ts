import { useCallback, useMemo } from 'react';
import { useSearchParams } from 'react-router';
import { useDueRange, type CreatedRange } from './createdRange';
import type { Ticket } from '../api/ticket';
import type { Task } from '../api/task';

// The filters a score link puts on a list page (see features/dashboard/scoreDrill.ts): the items that
// came DUE in a window, optionally only the ones finished late or not finished, for one department or
// store. Read from the address, applied on top of the list the page already loaded, and cleared in one tap.

export type ScoreDrillSla = 'closed_late' | 'closed_on_time' | 'done_late' | 'not_done';
const SLA_VALUES: readonly ScoreDrillSla[] = ['closed_late', 'closed_on_time', 'done_late', 'not_done'];

const SLA_WORDS: Record<ScoreDrillSla, string> = {
  closed_late: 'closed late',
  closed_on_time: 'closed on time',
  done_late: 'finished late',
  not_done: 'not done yet',
};

export interface ScoreDrill {
  /** True when the address carries at least one of these filters. */
  active: boolean;
  due: CreatedRange | null;
  sla: ScoreDrillSla | null;
  /** Tickets only: a department or store taken from the address. */
  departmentId: string | null;
  storeId: string | null;
  /** The window and the late or not-done part in words, for the banner. */
  description: string;
  clear: () => void;
}

/** `scope: true` also reads departmentId and storeId from the address (the ticket list has no filter of its own for them). */
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

/** A ticket counts when it was due in the window. Late means closed after its due time (the list has no hand-in time). */
export const ticketMatchesDrill = (drill: ScoreDrill, t: Ticket): boolean => {
  if (!inDue(drill, t.tatDueAt)) return false;
  if (drill.departmentId && t.departmentId !== drill.departmentId) return false;
  if (drill.storeId && t.storeId !== drill.storeId) return false;
  if (drill.sla === 'not_done') return t.status !== 'CLOSED';
  if (drill.sla === 'closed_late') return t.status === 'CLOSED' && !!t.closedAt && !!t.tatDueAt && new Date(t.closedAt).getTime() > new Date(t.tatDueAt).getTime();
  if (drill.sla === 'closed_on_time') return t.status === 'CLOSED' && !!t.closedAt && !!t.tatDueAt && new Date(t.closedAt).getTime() <= new Date(t.tatDueAt).getTime();
  return true;
};

/** A delegation counts when it was due in the window. Late means handed in (or approved) after the due time. */
export const taskMatchesDrill = (drill: ScoreDrill, t: Task): boolean => {
  if (!inDue(drill, t.dueDate)) return false;
  if (drill.sla === 'not_done') return t.status !== 'done';
  if (drill.sla === 'done_late') {
    const doneAt = t.submittedAt ?? t.verifiedAt;
    return t.status === 'done' && !!doneAt && !!t.dueDate && new Date(doneAt).getTime() > new Date(t.dueDate).getTime();
  }
  return true;
};
