import { useState } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Plus, Trash2, ChevronDown, ChevronRight, Loader2, Building2, Layers, Sparkles } from 'lucide-react';
import { Button, useConfirm } from '../../../components';
import {
  useDeleteChecklistTemplateMutation,
  useAddChecklistTemplateItemMutation,
} from '../hook';
import { useAssignableUsersQuery } from '../../tickets/hook';
import { ItemRow } from './ItemRow';
import type { ChecklistTemplate } from '../../../api/checklistTemplates';

interface TemplateBlockProps {
  template: ChecklistTemplate;
  departmentName: string | null;
}

export const TemplateBlock = ({ template, departmentName }: TemplateBlockProps) => {
  const [open, setOpen] = useState(false);
  const [newLabel, setNewLabel] = useState('');
  const deleteTemplate = useDeleteChecklistTemplateMutation();
  const addItem = useAddChecklistTemplateItemMutation();
  const confirm = useConfirm();
  // Gated on `open` — this list is only ever read by ItemRow's assignee picker inside the
  // collapsed panel below, so fetching it eagerly for every template on the page fired one
  // `/users/assignable` request per row on load, almost all of them for templates never expanded.
  const { data: assignableUsers } = useAssignableUsersQuery(template.departmentId ?? undefined, undefined, undefined, open);

  const handleAddItem = () => {
    if (!newLabel.trim()) return;
    addItem.mutate(
      { templateId: template.id, payload: { label: newLabel.trim(), order: template.items.length } },
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
      <div className="flex items-center justify-between gap-3 px-4 py-3 bg-surface hover:bg-surface-hover/30 transition-colors">
        <button
          onClick={() => setOpen(v => !v)}
          className="flex items-center gap-3 flex-1 min-w-0 cursor-pointer text-left"
        >
          <div className="p-1.5 rounded-lg bg-surface-hover border border-border/60 text-text-muted shrink-0">
            {open ? <ChevronDown size={15} /> : <ChevronRight size={15} />}
          </div>

          <div className="flex items-center gap-2 min-w-0 flex-wrap">
            <span className="text-sm font-display font-medium text-text truncate">{template.name}</span>

            <div className="flex items-center gap-1.5 shrink-0">
              <span className={`text-[11px] font-display font-medium px-2 py-0.5 rounded-md flex items-center gap-1 ${
                template.appliesTo === 'TASK'
                  ? 'bg-primary-500/10 text-primary-600 dark:text-primary-300 ring-1 ring-primary-500/20'
                  : 'bg-warning/10 text-warning ring-1 ring-warning/20'
              }`}>
                <Layers size={11} />
                {template.appliesTo === 'TASK' ? 'Tasks' : 'Tickets'}
              </span>

              {departmentName && (
                <span className="text-[11px] font-display font-medium px-2 py-0.5 rounded-md bg-surface-hover text-text-secondary border border-border/60 flex items-center gap-1">
                  <Building2 size={11} />
                  {departmentName}
                </span>
              )}
            </div>
          </div>

          <span className="text-xs text-text-muted font-mono tabular-nums shrink-0 ml-auto mr-2">
            {template.items.length} {template.items.length === 1 ? 'step' : 'steps'}
          </span>
        </button>

        <button
          onClick={handleDeleteTemplate}
          disabled={deleteTemplate.isPending}
          className="shrink-0 p-1.5 text-text-muted hover:text-danger hover:bg-danger/10 rounded-lg transition-colors cursor-pointer disabled:opacity-50"
          aria-label="Delete template"
        >
          {deleteTemplate.isPending ? <Loader2 size={14} className="animate-spin" /> : <Trash2 size={14} />}
        </button>
      </div>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ height: 0, opacity: 0 }}
            animate={{ height: 'auto', opacity: 1 }}
            exit={{ height: 0, opacity: 0 }}
            transition={{ duration: 0.2 }}
            className="border-t border-border bg-surface-subtle/20"
          >
            {template.items.length === 0 && (
              <div className="px-6 py-6 text-center text-xs text-text-muted font-display flex flex-col items-center gap-1">
                <Sparkles size={16} className="text-text-muted/60" />
                <span>No checklist steps added yet. Add your first step below!</span>
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
              <input
                value={newLabel}
                onChange={e => setNewLabel(e.target.value)}
                onKeyDown={e => { if (e.key === 'Enter') handleAddItem(); }}
                placeholder="Add next step label…"
                className="flex-1 px-3 py-1.5 text-xs font-display bg-background text-text rounded-lg border border-border/70 focus:outline-none focus:ring-2 focus:ring-primary-500/20 placeholder:text-text-muted transition-all"
              />
              <Button
                size="sm"
                variant="outline"
                onClick={handleAddItem}
                isLoading={addItem.isPending}
                className="font-display text-xs h-8 gap-1.5"
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
