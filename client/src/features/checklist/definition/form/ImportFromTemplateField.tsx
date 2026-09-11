import { Sparkles, ArrowDownToLine, Info } from 'lucide-react';
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from '@/components/ui/select';
import { SELECT_TRIGGER_CLASS } from './formConstants';
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

export const ImportFromTemplateField = ({
  templates,
  onImport,
  className = '',
}: ImportFromTemplateFieldProps) => {
  const usable = (templates ?? []).filter((t) => t.items.length > 0);
  if (usable.length === 0) return null;

  return (
    <div
      className={`flex flex-col gap-3 p-4 rounded-xl border border-primary-200/80 dark:border-primary-800/40 bg-primary-50/40 dark:bg-primary-950/20 shadow-2xs transition-all ${className}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <span className="flex items-center justify-center p-1 rounded-md bg-primary-100 dark:bg-primary-900/60 text-primary-700 dark:text-primary-300 shrink-0">
            <Sparkles size={13} />
          </span>
          <span className="text-xs font-display font-bold text-primary-900 dark:text-primary-300">
            Start From a Template
          </span>
        </div>
        <span className="text-[11px] font-display font-normal text-text-muted">
          Optional
        </span>
      </div>

      {/* Select Dropdown */}
      <Select value="" onValueChange={onImport}>
        <SelectTrigger
          className={`${SELECT_TRIGGER_CLASS} bg-surface text-xs font-display border-border hover:border-primary-300 dark:hover:border-primary-700 shadow-2xs`}
        >
          <div className="flex items-center gap-2 text-text-secondary truncate">
            <ArrowDownToLine size={13} className="text-text-muted shrink-0" />
            <SelectValue placeholder="Import pre-configured steps from an existing template…" />
          </div>
        </SelectTrigger>

        <SelectContent className="bg-surface/95 backdrop-blur-md border border-border shadow-md max-h-72">
          {usable.map((t) => (
            <SelectItem
              key={t.id}
              value={t.id}
              className="font-display text-xs py-2 px-3 focus:bg-primary-50 dark:focus:bg-primary-950/40 cursor-pointer"
            >
              <div className="flex items-center justify-between gap-3 w-full">
                <span className="font-medium text-text truncate">{t.name}</span>
                <span className="text-[11px] text-text-muted shrink-0 font-mono">
                  {t.items.length} step{t.items.length !== 1 ? 's' : ''} ({TARGET_LABEL[t.appliesTo]})
                </span>
              </div>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      {/* Helper Note */}
      <p className="text-[11px] font-display text-text-muted leading-relaxed flex items-start gap-1.5 pl-0.5">
        <Info size={13} className="shrink-0 mt-0.5 text-text-muted" />
        <span>
          Copies the template's question steps into this checklist. You can freely edit, reorder, or remove steps afterward.
        </span>
      </p>
    </div>
  );
};