import { useId, useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2, Building2, Layers, Sparkles, Pencil } from 'lucide-react';
import { Button, useConfirm } from '../../../components';
import {
  useDeleteChecklistTemplateMutation,
  useAddChecklistTemplateItemMutation,
  useUpdateChecklistTemplateMutation,
} from '../hook';
import { useAssignableUsersQuery } from '../../tickets/hook';
import { plural } from '../../checklist/checklistDisplay';
import { ItemRow } from './ItemRow';
import { InlineRenameInput } from './InlineRenameInput';
import type { ChecklistTemplate } from '../../../api/checklistTemplates';

interface TemplateBlockProps {
  template: ChecklistTemplate;
  departmentName: string | null;
}

const ICON_BTN_CLASS =
  'shrink-0 flex items-center justify-center size-11 sm:size-8 text-text-muted rounded-lg transition-colors cursor-pointer disabled:opacity-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50';

export const TemplateBlock = ({ template, departmentName }: TemplateBlockProps) => {
  const [open, setOpen] = useState(false);
  const [renaming, setRenaming] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const panelId = useId();
  const addInputId = useId();
  const deleteTemplate = useDeleteChecklistTemplateMutation();
  const updateTemplate = useUpdateChecklistTemplateMutation();
  const addItem = useAddChecklistTemplateItemMutation();
  const confirm = useConfirm();
  const { data: assignableUsers } = useAssignableUsersQuery(template.departmentId ?? undefined, undefined, undefined, open);

  const handleAddItem = () => {
    if (!newLabel.trim() || addItem.isPending) return;
    addItem.mutate(
      { templateId: template.id, payload: { label: newLabel.trim(), order: template.items.reduce((max, it) => Math.max(max, it.order), -1) + 1 } },
      { onSuccess: () => setNewLabel('') },
    );
  };

  const handleDeleteTemplate = async () => {
    const ok = await confirm({
      title: `Delete "${template.name}"?`,
      description: 'This permanently removes the template and all of its steps. This cannot be undone.',
      confirmLabel: 'Delete',
      variant: 'danger',
    });
    if (ok) deleteTemplate.mutate(template.id);
  };

  return (
    <div className="rounded-xl border border-border/80 bg-surface hover:border-primary-300 transition-colors overflow-hidden">
      <div className="flex items-center justify-between gap-2 px-4 py-2 bg-surface hover:bg-surface-hover/30 transition-colors">
        {renaming ? (
          <div className="flex-1 min-w-0">
            <InlineRenameInput
              value={template.name}
              label="Template name"
              onSave={(name) => { setRenaming(false); updateTemplate.mutate({ id: template.id, payload: { name } }); }}
              onCancel={() => setRenaming(false)}
            />
          </div>
        ) : (
          <button
            type="button"
            onClick={() => setOpen(v => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className="flex items-center gap-3 flex-1 min-w-0 min-h-11 cursor-pointer text-left rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
          >
            <div className="p-1.5 rounded-lg bg-surface-hover border border-border/60 text-text-muted shrink-0">
              {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
            </div>

            <div className="flex items-center gap-2 min-w-0 flex-wrap">
              <span className="text-sm font-display font-medium text-text break-words">{template.name}</span>

              <div className="flex items-center gap-1.5 shrink-0">
                <span className={`t-meta font-display font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                  template.appliesTo === 'TASK'
                    ? 'bg-primary-500/10 text-primary-700 dark:text-primary-300 ring-1 ring-primary-500/20'
                    : 'bg-warning/10 text-text-secondary ring-1 ring-warning/30'
                }`}>
                  <Layers size={11} />
                  {template.appliesTo === 'TASK' ? 'Tasks' : 'Tickets'}
                </span>

                {departmentName && (
                  <span className="t-meta font-display font-medium px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary border border-border/60 flex items-center gap-1">
                    <Building2 size={11} />
                    {departmentName}
                  </span>
                )}
              </div>
            </div>

            <span className="t-meta text-text-muted font-mono tabular-nums shrink-0 ml-auto">
              {plural(template.items.length, 'step')}
            </span>
          </button>
        )}

        {!renaming && (
          <button
            type="button"
            onClick={() => setRenaming(true)}
            className={`${ICON_BTN_CLASS} hover:text-primary-600 dark:hover:text-primary-400 hover:bg-primary-500/10`}
            aria-label={`Rename ${template.name}`}
            title="Rename template"
          >
            <Pencil size={14} />
          </button>
        )}

        <button
          type="button"
          onClick={handleDeleteTemplate}
          disabled={deleteTemplate.isPending}
          className={`${ICON_BTN_CLASS} hover:text-danger hover:bg-danger/10`}
          aria-label={`Delete ${template.name}`}
        >
          {deleteTemplate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            id={panelId}
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border bg-surface-hover/20"
          >
            {template.items.length === 0 && (
              <div className="px-6 py-6 text-center t-meta text-text-muted font-display flex flex-col items-center gap-1">
                <Sparkles size={16} className="text-text-muted/60" />
                <span>No steps yet. Add the first one below.</span>
              </div>
            )}

            {template.items.map((item, idx) => (
              <ItemRow
                key={item.id}
                item={item}
                index={idx}
                departmentId={template.departmentId}
                assignableUsers={assignableUsers}
              />
            ))}

            <div className="flex items-center gap-2 p-3 border-t border-border/60 bg-surface-hover/20">
              <label htmlFor={addInputId} className="sr-only">New step label</label>
              <input
                id={addInputId}
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                maxLength={191}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); }}
                placeholder="Add next step label…"
                className="flex-1 min-w-0 min-h-11 sm:min-h-8 px-3 py-1.5 text-base sm:text-xs font-display bg-background text-text rounded-lg border border-border/70 focus:outline-none focus:ring-2 focus:ring-primary-500/20 placeholder:text-text-muted transition-all"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddItem}
                isLoading={addItem.isPending}
                className="font-display t-meta gap-1.5"
              >
                <Plus size={13} />
                Add Step
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
};
