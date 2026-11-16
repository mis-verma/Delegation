import { useNavigate } from 'react-router';
import { Copy, FileClock, MoreVertical, Pencil, Trash2, UserPlus } from 'lucide-react';
import { Dropdown, IconChip, Loader, StateChip, Switch } from '../../../components';
import { useAuth } from '../../../context/AuthContext';
import { useSetChecklistDefinitionActiveMutation } from '../hook';
import { addPeoplePath, definitionState, STATE_LABEL } from './definitionState';
import type { ChecklistDefinition } from '../../../api/checklistDefinitions';

interface DefinitionActionsProps {
  definition: ChecklistDefinition;
  onDelete: () => void;
  deleting: boolean;
}

export const DefinitionActions = ({ definition, onDelete, deleting }: DefinitionActionsProps) => {
  const navigate = useNavigate();
  const { user } = useAuth();
  const setActive = useSetChecklistDefinitionActiveMutation();
  const state = definitionState(definition);
  const { id, name } = definition;

  if (user?.role !== 'ADMIN' && user?.role !== 'PC') {
    return state === 'draft'
      ? <IconChip icon={FileClock} tone="bg-warning" label="Draft" labelClassName="text-warning" />
      : <StateChip active={definition.isActive} label={STATE_LABEL[state]} />;
  }

  return (
    <div className="relative z-10 flex min-w-0 items-center justify-end gap-1">
      {state === 'draft' ? (
        <div className="flex min-h-11 items-center gap-2 sm:min-h-9">
          <button
            type="button"
            onClick={() => navigate(addPeoplePath(id))}
            className="inline-flex h-9 shrink-0 cursor-pointer items-center gap-1.5 whitespace-nowrap rounded-lg border border-border bg-surface px-3 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-primary-300 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:h-11 dark:hover:text-primary-300"
          >
            <UserPlus className="size-3.5" aria-hidden />
            Add people
          </button>
        </div>
      ) : (
        <label className="flex min-h-11 cursor-pointer items-center gap-2 pl-1 pr-1 sm:min-h-9">
          <StateChip active={definition.isActive} label={STATE_LABEL[state]} className="max-sm:hidden" />
          {setActive.isPending ? (
            <span className="flex h-6 w-11 items-center justify-center"><Loader size="sm" variant="slate" className="size-4" /></span>
          ) : (
            <Switch checked={definition.isActive} onChange={(next) => setActive.mutate({ id, isActive: next })} />
          )}
          <span className="sr-only">{definition.isActive ? 'Pause' : 'Resume'} {name}</span>
        </label>
      )}
      <Dropdown
        align="end"
        items={[
          { label: 'Edit in builder', icon: Pencil, onClick: () => navigate(`/admin/scheduled-checklists/builder/${id}`) },
          { label: 'Duplicate', icon: Copy, onClick: () => navigate(`/admin/scheduled-checklists/builder?copyFrom=${id}`) },
          ...(user?.role === 'ADMIN' ? [{ label: 'Delete', icon: Trash2, variant: 'destructive' as const, separatorBefore: true, onClick: onDelete }] : []),
        ]}
        trigger={
          <button
            type="button"
            aria-label={`More actions for ${name}`}
            disabled={deleting}
            className="flex size-11 shrink-0 cursor-pointer items-center justify-center rounded-lg text-text-muted outline-none transition-colors duration-150 hover:bg-surface-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 disabled:opacity-50 sm:size-9"
          >
            <MoreVertical className="size-4" strokeWidth={2.25} aria-hidden />
          </button>
        }
      />
    </div>
  );
};
