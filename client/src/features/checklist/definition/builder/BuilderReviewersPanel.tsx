import { ChecklistReviewersField } from '../form/ChecklistReviewersField';

interface BuilderReviewersPanelProps {
  storeIds: string[];
  reviewerIds: string[];
  onReviewerIdsChange: (ids: string[]) => void;
}

// Its own step, split out of "Assign" — who fills a checklist in and who reviews/approves it once
// filled are two different decisions, and bundling them under one "Assign" step made the reviewer
// picker easy to miss entirely. PC/Admin (and the department head of anyone assigned) can always
// approve or reject a run regardless of what's picked here — see ChecklistReviewersField — so this
// step has nothing to validate and never blocks moving on, even with no one picked.
export const BuilderReviewersPanel = ({ storeIds, reviewerIds, onReviewerIdsChange }: BuilderReviewersPanelProps) => (
  <div className="flex flex-col gap-5">
    <ChecklistReviewersField storeIds={storeIds} selected={reviewerIds} onChange={onReviewerIdsChange} />
  </div>
);
