import { useState } from 'react';
import { Plus, ListChecks } from 'lucide-react';
import { Button } from '../../components';
import type { TaskChecklist } from '../../api/taskChecklist';
import { NewChecklistForm } from './NewChecklistForm';
import { ChecklistBlock } from './ChecklistBlock';
import { getChecklistProgress } from '../../lib/checklistProgress';
import { DETAIL_SECTION_HEADING, DETAIL_SECTION_TILE } from '../tickets/detail/detailConstants';

interface TaskChecklistPanelProps {
  taskId:         string;
  checklists:     TaskChecklist[];
  isAdmin:        boolean;
  currentUserId?: string;
  workerIds?: string[];
}

export const TaskChecklistPanel = ({ taskId, checklists, isAdmin, currentUserId, workerIds }: TaskChecklistPanelProps) => {
  const [adding, setAdding] = useState(false);
  const { doneItems, totalItems } = getChecklistProgress(checklists);
  const open = totalItems - doneItems;

  return (
    <section aria-label="Checklists" className="flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex flex-col gap-0.5 min-w-0">
          <h3 className={DETAIL_SECTION_HEADING}>
            <span className={DETAIL_SECTION_TILE} aria-hidden="true"><ListChecks size={14} strokeWidth={2.25} /></span>
            Checklists
          </h3>
          <p className="t-meta font-display text-text-muted">
            {totalItems === 0
              ? 'No items yet.'
              : open === 0
                ? `All ${totalItems} items done.`
                : `${open} of ${totalItems} open. Finish each, or add a remark why not, before marking completed.`}
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

      <div className="flex flex-col gap-2">
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
