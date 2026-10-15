import type { ReactNode } from 'react';
import { Button, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import type { ExplorerModule, ExplorerRecurrence } from '../../api/scores';
import { SelectDropdown } from '../../components/dropdown';
import { CARD_PAD, FIELD_LABEL_CLASS } from './controlStyles';
import { MODULE_OPTIONS, RECURRENCE_OPTIONS } from './scoresDisplay';

interface Option { value: string; label: string }

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="flex min-w-0 flex-col gap-1.5" role="group" aria-label={label}>
    <span className={FIELD_LABEL_CLASS}>{label}</span>
    {children}
  </div>
);

const FIELD_TRIGGER = 'min-h-11 sm:h-9 sm:min-h-9 rounded-lg font-display';

interface ScoresFilterBarProps {
  stores?: Option[];
  departments?: Option[];
  storeId: string;
  departmentId: string;
  module: ExplorerModule | undefined;
  recurrence: ExplorerRecurrence;
  /** Shown as a plain line when the server holds the viewer to one department. */
  departmentLockedNote: boolean;
  onChange: (patch: { store?: string; dept?: string; module?: ExplorerModule | ''; rec?: ExplorerRecurrence }) => void;
  onClear: () => void;
  filtered: boolean;
}

/** ONE filter bar: store, department, module and checklist kind. A control that cannot apply to what you are looking at is left out, not greyed. */
export const ScoresFilterBar = ({ stores, departments, storeId, departmentId, module, recurrence, departmentLockedNote, onChange, onClear, filtered }: ScoresFilterBarProps) => {
  const showRecurrence = !module || module === 'checklist';
  const fieldCount = [!!stores, !!departments, true, showRecurrence].filter(Boolean).length;
  return (
    <section aria-label="Filters" className={cn(PANEL_CLASS, 'flex flex-col gap-3', CARD_PAD)}>
      <div className={cn('grid grid-cols-2 gap-3', fieldCount >= 4 ? 'lg:grid-cols-4' : fieldCount === 3 ? 'lg:grid-cols-3' : 'lg:grid-cols-2')}>
        {stores && (
          <Field label="Store">
            <SelectDropdown label="Store" aria-label="Store" triggerClassName={FIELD_TRIGGER} value={storeId} onChange={(v) => onChange({ store: v })} options={[{ value: '', label: 'All stores' }, ...stores.map((o) => ({ value: o.value, label: o.label }))]} />
          </Field>
        )}
        {departments && (
          <Field label="Department">
            <SelectDropdown label="Department" aria-label="Department" triggerClassName={FIELD_TRIGGER} value={departmentId} onChange={(v) => onChange({ dept: v })} options={[{ value: '', label: 'All departments' }, ...departments.map((o) => ({ value: o.value, label: o.label }))]} />
          </Field>
        )}
        <Field label="Module">
          <SelectDropdown label="Module" aria-label="Module" triggerClassName={FIELD_TRIGGER} value={(module ?? '') as ExplorerModule | ''} onChange={(v) => onChange({ module: v })} options={MODULE_OPTIONS.map((o) => ({ value: o.value as ExplorerModule | '', label: o.label }))} />
        </Field>
        {showRecurrence && (
          <Field label="Checklist kind">
            <SelectDropdown label="Checklist kind" aria-label="Checklist kind" triggerClassName={FIELD_TRIGGER} value={recurrence} onChange={(v) => onChange({ rec: v })} options={RECURRENCE_OPTIONS.map((o) => ({ value: o.value as ExplorerRecurrence, label: o.label }))} />
          </Field>
        )}
      </div>
      {(filtered || departmentLockedNote) && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          {departmentLockedNote ? <p className="t-meta text-text-muted">You see your own department: its work, and the people on its record.</p> : <span />}
          {filtered && <Button type="button" variant="ghost" size="sm" onClick={onClear}>Clear filters</Button>}
        </div>
      )}
    </section>
  );
};
