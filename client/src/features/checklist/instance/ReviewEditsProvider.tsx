import { useCallback, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import { useSetChecklistInstanceItemDoneMutation } from '../hook';
import { NO_EDITS, ReviewEditsContext, sameAnswer, snapshotOf, type AnswerSnapshot, type ReviewEdits } from './reviewEdits';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

const UNDO_DEPTH = 20;

interface ReviewEditsProviderProps {
  instanceId: string;
  items: readonly ChecklistInstanceItem[];
  /** Off for everyone who answers their own run the ordinary way, so nothing is recorded. */
  enabled: boolean;
  /** Only an admin may put a question back to unanswered, so only an admin is offered it. */
  canUnanswer: boolean;
  children: ReactNode;
}

export const ReviewEditsProvider = ({ instanceId, items, enabled, canUnanswer, children }: ReviewEditsProviderProps) => {
  const { mutate, isPending } = useSetChecklistInstanceItemDoneMutation(instanceId);
  const [stack, setStack] = useState<AnswerSnapshot[]>([]);
  const originals = useRef(new Map<string, AnswerSnapshot>());

  // The first sight of each question is what Put it back restores, so a question changed during
  // this review is remembered as it arrived, not as it was left a moment ago.
  useEffect(() => {
    if (!enabled) return;
    for (const item of items) if (!originals.current.has(item.id)) originals.current.set(item.id, snapshotOf(item));
  }, [enabled, items]);

  const restorable = useCallback((snap: AnswerSnapshot) => canUnanswer || snap.isDone, [canUnanswer]);

  const apply = useCallback((snap: AnswerSnapshot) => {
    mutate({
      itemId: snap.itemId,
      isDone: snap.isDone,
      booleanAnswer: snap.booleanAnswer ?? undefined,
      conditionalReasonValue: snap.conditionalReasonValue ?? '',
      notApplicable: snap.isNotApplicable || undefined,
      remarks: snap.remarks,
    });
  }, [mutate]);

  const record = useCallback((item: ChecklistInstanceItem) => {
    if (!enabled) return;
    const snap = snapshotOf(item);
    if (!restorable(snap)) return;
    setStack((prev) => [...prev.slice(1 - UNDO_DEPTH), snap]);
  }, [enabled, restorable]);

  const undo = useCallback(() => {
    setStack((prev) => {
      const snap = prev[prev.length - 1];
      if (snap) apply(snap);
      return prev.slice(0, -1);
    });
  }, [apply]);

  const original = useCallback((item: ChecklistInstanceItem): AnswerSnapshot | null => {
    if (!enabled) return null;
    const first = originals.current.get(item.id);
    if (!first || !restorable(first)) return null;
    return sameAnswer(first, snapshotOf(item)) ? null : first;
  }, [enabled, restorable]);

  const reset = useCallback((item: ChecklistInstanceItem) => {
    const first = originals.current.get(item.id);
    if (!first) return;
    record(item);
    apply(first);
  }, [apply, record]);

  const value = useMemo<ReviewEdits>(
    () => (enabled
      ? { reviewing: true, record, undoable: stack[stack.length - 1] ?? null, undo, original, reset, saving: isPending }
      : NO_EDITS),
    [enabled, record, stack, undo, original, reset, isPending],
  );

  return <ReviewEditsContext.Provider value={value}>{children}</ReviewEditsContext.Provider>;
};
