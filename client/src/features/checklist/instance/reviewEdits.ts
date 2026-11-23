import { createContext, useContext } from 'react';
import type { ChecklistInstanceItem } from '../../../api/checklistInstances';

export interface AnswerSnapshot {
  itemId: string;
  label: string;
  isDone: boolean;
  booleanAnswer: 'YES' | 'NO' | null;
  conditionalReasonValue: string | null;
  isNotApplicable: boolean;
  remarks: string | null;
}

export interface ReviewEdits {
  /** Called with the item as it still stands, right before a changed answer is saved. */
  record: (item: ChecklistInstanceItem) => void;
  /** The newest recorded answer that can be put back, or null when there is nothing to undo. */
  undoable: AnswerSnapshot | null;
  undo: () => void;
  /** What the question held the first time this run was opened, when that differs from now. */
  original: (item: ChecklistInstanceItem) => AnswerSnapshot | null;
  reset: (item: ChecklistInstanceItem) => void;
  saving: boolean;
}

export const snapshotOf = (item: ChecklistInstanceItem): AnswerSnapshot => ({
  itemId: item.id,
  label: item.label,
  isDone: item.isDone,
  booleanAnswer: item.booleanAnswer ?? null,
  conditionalReasonValue: item.conditionalReasonValue ?? null,
  isNotApplicable: item.isNotApplicable,
  remarks: item.remarks ?? null,
});

/** How an answer reads on an Undo or Reset button, so both say the same thing. */
export const describeAnswer = (snap: AnswerSnapshot, itemType?: string): string => {
  if (!snap.isDone) return 'unanswered';
  if (snap.isNotApplicable) return 'N/A';
  if (snap.booleanAnswer === 'YES') return itemType === 'PASS_FAIL' ? 'Pass' : 'Yes';
  if (snap.booleanAnswer === 'NO') return itemType === 'PASS_FAIL' ? 'Fail' : 'No';
  return 'the earlier answer';
};

export const sameAnswer = (a: AnswerSnapshot, b: AnswerSnapshot): boolean =>
  a.isDone === b.isDone
  && a.booleanAnswer === b.booleanAnswer
  && a.isNotApplicable === b.isNotApplicable
  && (a.conditionalReasonValue ?? '') === (b.conditionalReasonValue ?? '');

export const NO_EDITS: ReviewEdits = {
  record: () => undefined,
  undoable: null,
  undo: () => undefined,
  original: () => null,
  reset: () => undefined,
  saving: false,
};

export const ReviewEditsContext = createContext<ReviewEdits>(NO_EDITS);

export const useReviewEdits = (): ReviewEdits => useContext(ReviewEditsContext);
