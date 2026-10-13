import type { ReactNode } from 'react';
import { Button, PANEL_CLASS } from '../../components';
import { cn } from '@/lib/utils';
import type { ExplorerModule, ExplorerRecurrence } from '../../api/scores';
import { CARD_PAD, FIELD_LABEL_CLASS, SELECT_CLASS } from './controlStyles';
import { MODULE_OPTIONS, RECURRENCE_OPTIONS } from './scoresDisplay';

interface Option { value: string; label: string }

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <label className="flex min-w-0 flex-col gap-1.5">
    <span className={FIELD_LABEL_CLASS}>{label}</span>
    {children}
  </label>
);

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
            <select value={storeId} onChange={(e) => onChange({ store: e.target.value })} className={SELECT_CLASS}>
              <option value="">All stores</option>
              {stores.map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
            </select>
          </Field>
        )}
        {departments && (
          <Field label="Department">
            <select value={departmentId} onChange={(e) => onChange({ dept: e.target.value })} className={SELECT_CLASS}>
              <option value="">All departments</option>
              {departments.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
            </select>
          </Field>
        )}
        <Field label="Module">
          <select value={module ?? ''} onChange={(e) => onChange({ module: e.target.value as ExplorerModule | '' })} className={SELECT_CLASS}>
            {MODULE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </Field>
        {showRecurrence && (
          <Field label="Checklist kind">
            <select value={recurrence} onChange={(e) => onChange({ rec: e.target.value as ExplorerRecurrence })} className={SELECT_CLASS}>
              {RECURRENCE_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
            </select>
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
