import { useRef } from 'react';
import {
  Check,
  UserCheck,
  Trash2,
  Image as ImageIcon,
  Lock,
  ChevronDown
} from 'lucide-react';
import { useUpdateChecklistTemplateItemMutation, useDeleteChecklistTemplateItemMutation } from '../hook';
import { useConfirm } from '../../../components';
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

  const minRef = useRef<HTMLInputElement>(null);
  const maxRef = useRef<HTMLInputElement>(null);

  const handleMinBlur = () => {
    if (!minRef.current) return;
    const value = Number(minRef.current.value) || 0;
    if (value !== item.requiredImageCount) {
      updateItem.mutate({ id: item.id, payload: { requiredImageCount: value } });
    }
  };

  const handleMaxBlur = () => {
    if (!maxRef.current) return;
    const value = maxRef.current.value ? Number(maxRef.current.value) : null;
    if (value !== item.maxImageCount) {
      updateItem.mutate({ id: item.id, payload: { maxImageCount: value } });
    }
  };

  const handleDelete = async () => {
    const ok = await confirm({
      title: `Delete "${item.label}"?`,
      description: 'This permanently removes this step from the template. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteItem.mutate(item.id);
  };

  return (
    <article className="group flex flex-col xl:flex-row xl:items-center justify-between gap-4 p-4 sm:p-5 bg-surface border-b border-border/60 last:border-b-0 transition-colors duration-300 ease-in-out hover:bg-surface-hover/40">
      {/* Step Index & Label */}
      <div className="flex items-start sm:items-center gap-3.5 flex-1 min-w-0">
        <span className="flex items-center justify-center w-6 h-6 rounded-lg bg-surface-hover text-text-muted text-xs font-display font-bold shrink-0 mt-0.5 sm:mt-0 select-none">
          {index + 1}
        </span>
        <span className="text-sm sm:text-base font-display font-medium text-text leading-snug truncate whitespace-normal sm:whitespace-nowrap">
          {item.label}
        </span>
      </div>

      {/* Controls Bar */}
      <div className="flex flex-wrap items-center gap-3 self-start xl:self-auto shrink-0">

        {/* Photo Requirements Group */}
        <div className="flex items-center gap-2 p-1.5 bg-surface-hover border border-border rounded-xl transition-colors focus-within:border-primary-300 dark:focus-within:border-primary-500/50">
          <div className="px-1.5 text-text-muted border-r border-border">
            <ImageIcon className="w-4 h-4" />
          </div>

          <label className="flex items-center gap-1.5 px-1" title="Minimum photos required">
            <span className="text-[10px] font-display font-bold text-text-muted tracking-wider">Min</span>
            <input
              ref={minRef}
              type="number"
              min={0}
              defaultValue={item.requiredImageCount}
              onBlur={handleMinBlur}
              className="w-10 h-7 px-1 text-xs font-display font-medium text-center transition-all bg-surface border border-border rounded-lg text-text focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </label>

          <span className="text-border select-none">•</span>

          <label className="flex items-center gap-1.5 pr-1.5" title="Maximum photos allowed">
            <span className="text-[10px] font-display font-bold text-text-muted tracking-wider">Max</span>
            <input
              ref={maxRef}
              type="number"
              min={0}
              defaultValue={item.maxImageCount ?? ''}
              placeholder="∞"
              onBlur={handleMaxBlur}
              className="w-10 h-7 px-1 text-xs font-display font-medium text-center transition-all bg-surface border border-border rounded-lg text-text placeholder:text-text-muted focus:outline-none focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500"
            />
          </label>
        </div>

        {/* Live Photo Toggle */}
        <button
          type="button"
          onClick={() => updateItem.mutate({ id: item.id, payload: { requiresLivePhoto: !item.requiresLivePhoto } })}
          disabled={updateItem.isPending}
          className={`flex items-center gap-2 px-3 py-2 rounded-xl border text-xs font-display font-medium transition-all duration-200 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 disabled:opacity-50 disabled:pointer-events-none ${
            item.requiresLivePhoto
              ? 'bg-primary-500/10 border-primary-500/30 text-primary-700 dark:text-primary-400'
              : 'bg-surface border-border text-text-secondary hover:text-text hover:bg-surface-hover'
          }`}
        >
          <div className={`flex items-center justify-center w-3.5 h-3.5 rounded-[4px] transition-colors ${
            item.requiresLivePhoto ? 'bg-primary-600 text-white' : 'border border-border'
          }`}>
            {item.requiresLivePhoto && <Check className="w-2.5 h-2.5" strokeWidth={3} />}
          </div>
          Live only
        </button>

        {/* Assignee Selector */}
        <div className="relative group/select">
          <div className="absolute inset-y-0 left-0 flex items-center pl-2.5 pointer-events-none text-text-muted group-hover/select:text-primary-500 transition-colors">
            {!departmentId ? <Lock className="w-3.5 h-3.5" /> : <UserCheck className="w-3.5 h-3.5" />}
          </div>

          <select
            value={item.defaultAssigneeId ?? UNASSIGNED}
            onChange={e => updateItem.mutate({ id: item.id, payload: { defaultAssigneeId: e.target.value === UNASSIGNED ? null : e.target.value } })}
            disabled={!departmentId}
            title={departmentId ? 'Default assignee' : 'Set a department on this template first'}
            className={`h-9 pl-8 pr-8 text-xs font-display font-medium appearance-none transition-all outline-none min-w-[130px] bg-surface-hover border rounded-xl ${
              !departmentId
                ? 'border-border/60 text-text-muted cursor-not-allowed'
                : 'border-border text-text-secondary hover:border-border-hover focus:ring-2 focus:ring-primary-500/20 focus:border-primary-500 cursor-pointer'
            }`}
          >
            <option value={UNASSIGNED}>Unassigned</option>
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

        {/* Delete Button */}
        <button
          type="button"
          onClick={handleDelete}
          disabled={deleteItem.isPending}
          className="p-2 rounded-xl transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-danger text-text-muted hover:text-danger hover:bg-danger/10 disabled:opacity-50 disabled:pointer-events-none"
          aria-label="Delete item"
        >
          <Trash2 className="w-4 h-4" />
        </button>

      </div>
    </article>
  );
};
