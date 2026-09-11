import { ChecklistAssigneesField } from '../form/ChecklistAssigneesField';
import { ChecklistReviewersField } from '../form/ChecklistReviewersField';
import { ChecklistRolesField } from '../form/ChecklistRolesField';
import type { ChecklistAssigneeRole } from '../../../../api/checklistDefinitions';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  assigneeRoles: ChecklistAssigneeRole[];
  onAssigneeRolesChange: (roles: ChecklistAssigneeRole[]) => void;
  reviewerIds: string[];
  onReviewerIdsChange: (ids: string[]) => void;
}

export const BuilderAssignPanel = ({
  storeIds, assigneeIds, onAssigneeIdsChange, assigneeRoles, onAssigneeRolesChange,
  reviewerIds, onReviewerIdsChange,
}: BuilderAssignPanelProps) => (
  <div className="flex flex-col gap-5 p-5 rounded-xl border border-border bg-surface shadow-xs transition-all duration-200">
    <h2 className="text-xs font-display font-bold text-text-muted">Assign To</h2>
    <div className="flex flex-col gap-4">
      <ChecklistRolesField selected={assigneeRoles} onChange={onAssigneeRolesChange} />

      <hr className="border-border/50" />

      <ChecklistAssigneesField storeIds={storeIds} selected={assigneeIds} onChange={onAssigneeIdsChange} />

      <hr className="border-border/50" />

      <ChecklistReviewersField storeIds={storeIds} selected={reviewerIds} onChange={onReviewerIdsChange} />
    </div>
  </div>
)