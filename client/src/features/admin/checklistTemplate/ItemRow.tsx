import { useState } from 'react';
import {
  UserCheck,
  Trash2,
  Image as ImageIcon,
  Lock,
  ChevronDown,
  Pencil,
} from 'lucide-react';
import { useUpdateChecklistTemplateItemMutation, useDeleteChecklistTemplateItemMutation } from '../hook';
import { ToggleChip, useConfirm } from '../../../components';
import { CountStepper } from '../../checklist/definition/builder/CountStepper';
import { PhotoSourceChips } from '../../checklist/definition/builder/PhotoRulesPanel';
import { InlineRenameInput } from './InlineRenameInput';
import type { ChecklistTemplateItem } from '../../../api/checklistTemplates';
import type { AssignableUser } from '../../../api/users';

const UNASSIGNED = '__unassigned__';

interface ItemRowProps {
  item: ChecklistTemplateItem;
  departmentId: string | null;
  assignableUsers?: AssignableUser[];
  index: number;
}

export const ItemRow = ({ item, departmentId, assignableUsers, index }: ItemRowProps) => {
  const updateItem = useUpdateChecklistTemplateItemMutation();
  const deleteItem = useDeleteChecklistTemplateItemMutation();
  const confirm = useConfirm();
  const [renaming, setRenaming] = useState(false);

  const minPhotos = item.requiredImageCount;
  const maxPhotos = item.maxImageCount;

  const setMin = (value: number) => {
    const payload: { requiredImageCount: number; maxImageCount?: number } = { requiredImageCount: value };
    if (maxPhotos != null && maxPhotos < value) payload.maxImageCount = value;
    updateItem.mutate({ id: item.id, payload });
  };

  const setMax = (value: number | null) => updateItem.mutate({ id: item.id, payload: { maxImageCount: value } });

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${item.label}"?`,
      description: 'This permanently removes this step from the template. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteItem.mutate(item.id);
  };

  const assigneeLoaded = !item.defaultAssigneeId || !!assignableUsers?.some(u => u.id === item.defaultAssigneeId);

  return (
    <article className="group flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 sm:p-5 bg-surface border-b border-border/60 last:border-b-0 transition-colors duration-300 ease-in-out hover:bg-surface-hover/40">
      <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-surface-hover text-text-muted t-meta font-display font-bold shrink-0 mt-0.5 sm:mt-0 select-none">
          {index + 1}
        </span>
        {renaming ? (
          <InlineRenameInput
            value={item.label}
            label={`Step ${index + 1} label`}
            onSave={(label) => { setRenaming(false); updateItem.mutate({ id: item.id, payload: { label } }); }}
            onCancel={() => setRenaming(false)}
          />
        ) : (
          <>
            <span title={item.label} className="min-w-0 text-sm sm:text-base font-display font-medium text-text leading-snug break-words">
              {item.label}
            </span>
            <button
              type="button"
              onClick={() => setRenaming(true)}
              className="shrink-0 flex items-center justify-center size-11 sm:size-8 rounded-lg text-text-muted hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/10 transition-colors cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
              aria-label={`Rename step ${index + 1}`}
              title="Rename step"
            >
              <Pencil size={14} />
            </button>
          </>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-3 self-start xl:self-auto shrink-0">

        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-border bg-surface-hover p-1.5">
          <span className="flex items-center gap-1.5 px-1.5 t-meta font-display font-bold text-text-muted">
            <ImageIcon className="size-4" aria-hidden /> Photos
          </span>
          <CountStepper value={minPhotos} min={0} max={20} label="Minimum photos" onChange={setMin} />
          <ToggleChip on={maxPhotos == null} onClick={() => setMax(null)} disabled={updateItem.isPending}>No limit</ToggleChip>
          {maxPhotos == null ? (
            <ToggleChip on={false} onClick={() => setMax(Math.max(minPhotos, 1))} disabled={updateItem.isPending}>Set a limit</ToggleChip>
          ) : (
            <CountStepper value={maxPhotos} min={Math.max(1, minPhotos)} max={30} label="Maximum photos" onChange={setMax} />
          )}
          <PhotoSourceChips live={item.requiresLivePhoto} onChange={(live) => updateItem.mutate({ id: item.id, payload: { requiresLivePhoto: live } })} />
        </div>

        <div className="relative group/select">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-text-muted group-hover/select:text-primary-500 transition-colors">
            {!departmentId ? <Lock className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </div>

          <select
            value={item.defaultAssigneeId ?? UNASSIGNED}
            onChange={e => updateItem.mutate({ id: item.id, payload: { defaultAssigneeId: e.target.value === UNASSIGNED ? null : e.target.value } })}
            disabled={!departmentId}
            aria-label={`Default assignee for step ${index + 1}`}
            title={departmentId ? 'Default assignee' : 'Set a department on this template first'}
            className={`h-11 sm:h-9 pl-8 pr-8 text-base sm:text-xs font-display font-medium appearance-none transition-all outline-none min-w-32 bg-surface-hover border rounded-xl ${
              !departmentId
                ? 'border-border/60 text-text-muted cursor-not-allowed'
                : 'border-border text-text-secondary hover:border-border-hover focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 cursor-pointer'
            }`}
          >
            <option value={UNASSIGNED}>Unassigned</option>
            {!assigneeLoaded && item.defaultAssigneeId && (
              <option value={item.defaultAssigneeId} hidden>Assigned person</option>
            )}
            {assignableUsers?.map(u => (
              <option key={u.id} value={u.id}>
                {u.firstName} {u.lastName ?? ''}
              </option>
            ))}
          </select>

          <div className="absolute inset-y-0 right-0 flex items-center pr-2.5 pointer-events-none text-text-muted group-hover/select:text-text-secondary">
            <ChevronDown className="w-3.5 h-3.5" />
          </div>
        </div>

        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          className="flex items-center justify-center size-11 sm:size-9 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 disabled:pointer-events-none"
          aria-label={`Delete step ${index + 1}`}
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>
    </article>
  );
};
