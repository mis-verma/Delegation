import { useState } from 'react';
import { Plus, ListChecks } from 'lucide-react';
import { Button } from '../../components';
import type { TaskChecklist } from '../../api/taskChecklist';
import { NewChecklistForm } from './NewChecklistForm';
import { ChecklistBlock } from './ChecklistBlock';
import { getChecklistProgress } from '../../lib/checklistProgress';

interface TaskChecklistPanelProps {
  taskId:         string;
  checklists:     TaskChecklist[];
  isAdmin:        boolean;
  currentUserId?: string;
  /** The delegation's assignees, who work items that have nobody on them. */
  workerIds?: string[];
}

/**
 * The delegation's own checklists, inside the detail sheet. The server will not let a delegation be
 * marked completed while an item is neither done nor explained by a remark (assertChecklistsResolved),
 * so they have to be workable right here.
 */
export const TaskChecklistPanel = ({ taskId, checklists, isAdmin, currentUserId, workerIds }: TaskChecklistPanelProps) => {
  const [adding, setAdding] = useState(false);
  const { doneItems, totalItems } = getChecklistProgress(checklists);
  const open = totalItems - doneItems;

  return (
    <section aria-label="Checklists" className="flex flex-col gap-3">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className="flex items-center gap-1.5 t-section font-display font-bold text-text">
            <ListChecks size={16} className="text-text-light shrink-0" aria-hidden />
            Checklists
          </h3>
          <p className="t-meta font-display text-text-muted">
            {totalItems === 0
              ? 'No items yet.'
              : open === 0
                ? `All ${totalItems} items done.`
                : `${open} of ${totalItems} items still open. Finish them, or add a remark saying why not, before marking this completed.`}
          </p>
        </div>
        {isAdmin && !adding && (
          <Button size="sm" variant="outline" onClick={() => setAdding(true)} className="gap-1.5 font-display">
            <Plus size={14} strokeWidth={2.5} />
            New checklist
          </Button>
        )}
      </div>

      {adding && <NewChecklistForm taskId={taskId} onDone={() => setAdding(false)} />}

      <div className="flex flex-col gap-3">
        {checklists.map(checklist => (
          <ChecklistBlock
            key={checklist.id}
            checklist={checklist}
            taskId={taskId}
            isAdmin={isAdmin}
            currentUserId={currentUserId}
            workerIds={workerIds}
          />
        ))}
      </div>
    </section>
  );
};
