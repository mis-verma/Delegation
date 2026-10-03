import { useMemo } from 'react';
import { Sparkles } from 'lucide-react';
import { Combobox, type ComboboxOption } from '../../../../components';
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
  const options = useMemo<ComboboxOption[]>(
    () =>
      (templates ?? [])
        .filter((t) => t.items.length > 0)
        .map((t) => ({
          value: t.id,
          label: `${t.name} (${t.items.length} step${t.items.length !== 1 ? 's' : ''}, ${TARGET_LABEL[t.appliesTo]})`,
        })),
    [templates],
  );
  if (options.length === 0) return null;

  return (
    <div className={`flex flex-col sm:flex-row sm:items-center gap-2 sm:gap-3 ${className}`}>
      <label htmlFor="import-from-template" className="flex items-center gap-2 text-sm font-display font-medium text-text-secondary shrink-0">
        <span className="flex items-center justify-center size-7 rounded-lg bg-primary-500/10 text-primary-700 dark:text-primary-300">
          <Sparkles size={14} />
        </span>
        Start from a template
      </label>
      {/* Always shows its placeholder (value stays empty): picking one is an action that copies the
          steps in, not a setting that stays selected. */}
      <div className="w-full sm:max-w-sm">
        <Combobox
          id="import-from-template"
          value=""
          onChange={onImport}
          options={options}
          placeholder="Copy steps from a template…"
        />
      </div>
    </div>
  );
};
