import { useState } from 'react';
import { Plus, CheckSquare, ListChecks } from 'lucide-react';
import { Button } from '../../components';
import type { TaskChecklist } from '../../api/taskChecklist';
import { NewChecklistForm } from './NewChecklistForm';
import { ChecklistBlock } from './ChecklistBlock';

interface TaskChecklistPanelProps {
  taskId:         string;
  checklists:     TaskChecklist[];
  isAdmin:        boolean;
  currentUserId?: string;
}

export const TaskChecklistPanel = ({ taskId, checklists, isAdmin, currentUserId }: TaskChecklistPanelProps) => {
  const [adding, setAdding] = useState(false);

  return (
    <div className="flex flex-col gap-6">

      {/* Header Section */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-4 border-b border-border">
        <div>
          <h3 className="flex items-center gap-2 text-lg font-bold text-text tracking-tight">
            <ListChecks size={18} className="text-primary-600 dark:text-primary-400" strokeWidth={2.25} />
            Checklists
          </h3>
          <p className="text-sm text-text-muted mt-0.5">Track sub-tasks and required evidence</p>
        </div>
        {isAdmin && !adding && (
          <Button
            size="sm"
            variant="outline"
            onClick={() => setAdding(true)}
            className="gap-2 font-medium"
          >
            <Plus size={16} strokeWidth={2.5} />
            New Checklist
          </Button>
        )}
      </div>

      {/* Add Form Container (Fast Fade) */}
      {adding && (
        <div className="animate-in fade-in duration-150 ease-out">
          <NewChecklistForm taskId={taskId} onDone={() => setAdding(false)} />
        </div>
      )}

      {/* Empty State */}
      {checklists.length === 0 && !adding && (
        <div className="flex flex-col items-center justify-center gap-4 p-8 sm:p-10 text-center bg-surface-hover/40 rounded-2xl border-2 border-border">
          <div className="flex items-center justify-center text-text-light">
             <CheckSquare size={24} />
          </div>
          <div className="flex flex-col gap-1">
            <h4 className="text-base font-medium text-text">No Checklists Active</h4>
            <p className="text-sm text-text-muted max-w-sm">
              Break down this task into smaller, trackable items. Add a checklist to get started.
            </p>
          </div>
          {isAdmin && (
            <Button size="sm" variant="primary" onClick={() => setAdding(true)} className="gap-2 shadow-sm">
              <Plus size={14} strokeWidth={2.5} />
              Create Checklist
            </Button>
          )}
        </div>
      )}

      {/* Checklist Blocks */}
      {checklists.length > 0 && (
        <div className="flex flex-col gap-4">
          {checklists.map(checklist => (
            <ChecklistBlock
              key={checklist.id}
              checklist={checklist}
              taskId={taskId}
              isAdmin={isAdmin}
              currentUserId={currentUserId}
            />
          ))}
        </div>
      )}
    </div>
  );
};