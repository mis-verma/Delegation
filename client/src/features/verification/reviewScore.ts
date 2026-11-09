import { runScores, type RunScores } from '../checklist/checklistCompliance';
import type { ChecklistInstanceItem } from '../../api/checklistInstances';

export interface ReviewScores {
  now: RunScores;
  ifSentBack: RunScores | null;
}

export const projectReviewScores = (items: readonly ChecklistInstanceItem[], picked: ReadonlySet<string>): ReviewScores => {
  const now = runScores([...items]);
  if (picked.size === 0) return { now, ifSentBack: null };
  const projected = items.map((item) => (
    picked.has(item.id) ? { ...item, isNotApplicable: false, sendBackCount: item.sendBackCount + 1 } : item
  ));
  return { now, ifSentBack: runScores(projected) };
};
