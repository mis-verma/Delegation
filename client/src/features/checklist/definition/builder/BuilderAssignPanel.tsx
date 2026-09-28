import { ChecklistAssigneesField } from '../form/ChecklistAssigneesField';
import { ChecklistRolesField } from '../form/ChecklistRolesField';
import type { ChecklistAssigneeRole } from '../../../../api/checklistDefinitions';

interface BuilderAssignPanelProps {
  storeIds: string[];
  assigneeIds: string[];
  onAssigneeIdsChange: (ids: string[]) => void;
  assigneeRoles: ChecklistAssigneeRole[];
  onAssigneeRolesChange: (roles: ChecklistAssigneeRole[]) => void;
}

// Reviewers used to live here too — split into its own step (BuilderReviewersPanel) since who
// fills a checklist in and who reviews/approves it are two separate decisions worth their own
// visible step, not one buried under a third field in this one.
export const BuilderAssignPanel = ({
  storeIds, assigneeIds, onAssigneeIdsChange, assigneeRoles, onAssigneeRolesChange,
}: BuilderAssignPanelProps) => (
  <div className="flex flex-col gap-5">
    <div className="flex flex-col gap-4">
      <ChecklistRolesField selected={assigneeRoles} onChange={onAssigneeRolesChange} />

      <hr className="border-border/50" />

      <ChecklistAssigneesField storeIds={storeIds} selected={assigneeIds} onChange={onAssigneeIdsChange} />
    </div>
  </div>
)