import { useState } from 'react';
import { ChevronDown, ListChecks } from 'lucide-react';
import { PickerShell } from '../../../components/dateTime/PickerShell';
import { OptionList } from '../../../components/dropdown/OptionList';
import { Button } from '../../../components';
import { useMediaQuery } from '../../../lib/useMediaQuery';
import type { CleanupChecklist } from '../../../api/checklistInstances';

interface ChecklistMultiPickerProps {
  checklists: CleanupChecklist[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  isLoading?: boolean;
}

export const ChecklistMultiPicker = ({ checklists, selectedIds, onChange, isLoading = false }: ChecklistMultiPickerProps) => {
  const [open, setOpen] = useState(false);
  const isPhone = useMediaQuery('(max-width: 639px)');
  const picked = checklists.filter((c) => selectedIds.includes(c.id));
  const toggle = (id: string) => onChange(selectedIds.includes(id) ? selectedIds.filter((x) => x !== id) : [...selectedIds, id]);

  const trigger = (
    <button
      type="button"
      className="flex w-full min-w-0 items-center gap-2 min-h-11 px-3 rounded-lg border border-border/60 bg-surface text-left cursor-pointer outline-none transition-colors duration-150 hover:border-primary-400 focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <ListChecks size={16} className="shrink-0 text-text-light" aria-hidden />
      <span className={`min-w-0 flex-1 truncate t-card font-display font-semibold ${picked.length ? 'text-text' : 'text-text-muted'}`}>
        {picked.length === 0 ? 'Every checklist' : picked.length === 1 ? picked[0].title : `${picked.length} checklists`}
      </span>
      <ChevronDown size={14} className="shrink-0 text-text-light" aria-hidden />
    </button>
  );

  return (
    <div className="flex flex-col gap-2">
      <PickerShell
        bare
        open={open}
        onOpenChange={setOpen}
        trigger={trigger}
        title="Pick checklists"
        popoverClassName="w-[min(26rem,calc(100vw-2rem))]"
        sheetFooter={isPhone && (
          <Button variant="primary" onClick={() => setOpen(false)} className="w-full h-11 font-display">
            {selectedIds.length ? `Done, ${selectedIds.length} picked` : 'Done'}
          </Button>
        )}
      >
        <OptionList
          multiple
          searchable
          searchPlaceholder="Search checklists…"
          isLoading={isLoading}
          emptyText="No checklist has any runs yet."
          options={checklists.map((c) => ({ value: c.id, label: c.title, hint: `${c.runs} ${c.runs === 1 ? 'run' : 'runs'} so far` }))}
          selected={selectedIds}
          onToggle={toggle}
          topActions={selectedIds.length ? [{ key: 'clear', label: 'Clear, use every checklist', onSelect: () => onChange([]) }] : undefined}
        />
      </PickerShell>
      {picked.length > 1 && (
        <p className="t-meta text-text-secondary">{picked.map((c) => c.title).join(', ')}</p>
      )}
    </div>
  );
};
