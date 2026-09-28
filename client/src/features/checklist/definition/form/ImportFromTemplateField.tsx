import { Sparkles } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import type { ChecklistTemplate } from '../../../../api/checklistTemplates';

interface ImportFromTemplateFieldProps {
  templates: ChecklistTemplate[] | undefined;
  onImport: (templateId: string) => void;
  className?: string;
}

const TARGET_LABEL: Record<ChecklistTemplate['appliesTo'], string> = {
  TASK: 'Tasks',
  TICKET: 'Tickets',
};

// Optional shortcut, so one quiet row rather than a tinted card competing with the questions:
// picking a template copies its steps in as questions (each still editable afterwards).
export const ImportFromTemplateField = ({ templates, onImport, className = '' }: ImportFromTemplateFieldProps) => {
  const usable = (templates ?? []).filter((t) => t.items.length > 0);
  if (usable.length === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${className}`}>
      <span className="flex items-center gap-2 text-sm font-display font-medium text-text-secondary shrink-0">
        <span className="flex items-center justify-center size-7 rounded-lg bg-coral-500/15 text-coral-700 dark:text-coral-300">
          <Sparkles size={14} />
        </span>
        Start from a template
      </span>
      <Select value="" onValueChange={onImport}>
        <SelectTrigger className="h-10 w-full sm:max-w-sm rounded-xl bg-surface text-sm font-display">
          <SelectValue placeholder="Copy steps from a template…" />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          {usable.map((t) => (
            <SelectItem key={t.id} value={t.id} className="font-display text-sm py-2 cursor-pointer">
              <span className="flex items-center justify-between gap-3 w-full">
                <span className="font-medium text-text truncate">{t.name}</span>
                <span className="text-[11px] text-text-muted shrink-0 tabular-nums">
                  {t.items.length} step{t.items.length !== 1 ? 's' : ''} · {TARGET_LABEL[t.appliesTo]}
                </span>
              </span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>
    </div>
  );
};
