import { useCallback } from 'react';
import { useDeferredDecisions, type DecisionRequest } from '../verification/useDeferredDecisions';
import { useRefreshAfterDecision } from '../verification/useRefreshAfterDecision';
import { approveTaskRun, approveTicketRun, rejectTaskRun, rejectTicketRun } from '../verification/decisionRequests';
import type { ApprovalRow } from './NeedsApprovalCard';

export const rowKey = (row: Pick<ApprovalRow, 'category' | 'id'>) => `${row.category}-${row.id}`;

export const canDecideInline = (row: Pick<ApprovalRow, 'category'>) => row.category !== 'checklist';

const requestFor = (row: ApprovalRow, verb: string, run: DecisionRequest['run']): DecisionRequest => ({
  id: rowKey(row),
  verb,
  label: row.title.length > 48 ? `${row.title.slice(0, 47)}…` : row.title,
  run,
});

export const useInlineDecisions = () => {
  const refresh = useRefreshAfterDecision();
  const { heldIds, schedule } = useDeferredDecisions({ afterSaved: refresh });

  const approve = useCallback((row: ApprovalRow) => {
    if (!canDecideInline(row)) return;
    schedule(requestFor(row, 'Approved', row.category === 'ticket' ? approveTicketRun(row.id) : approveTaskRun(row.id)));
  }, [schedule]);

  const sendBack = useCallback((row: ApprovalRow, note: string) => {
    if (!canDecideInline(row) || !note.trim()) return;
    schedule(requestFor(row, 'Sent back', row.category === 'ticket' ? rejectTicketRun(row.id, note.trim()) : rejectTaskRun(row.id, note.trim())));
  }, [schedule]);

  return { heldIds, approve, sendBack };
};
