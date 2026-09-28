import { ChecklistAssigneesField } from '../form/ChecklistAssigneesField';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
}

// Who fills this checklist in — real people only. The "Assign by role" chips that used to sit
// above this were a fixed list of made-up roles (Store Manager, Cashier…) that assigned nobody —
// just a label on the card — so they're gone. Reviewers are their own step (BuilderReviewersPanel).
export const BuilderAssignPanel = ({ storeIds, assigneeIds, onAssigneeIdsChange }: BuilderAssignPanelProps) => (
  <ChecklistAssigneesField storeIds={storeIds} selected={assigneeIds} onChange={onAssigneeIdsChange} />
);
