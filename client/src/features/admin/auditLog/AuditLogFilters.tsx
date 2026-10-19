import { useMemo, useState } from 'react';
import { ChevronDown, SlidersHorizontal, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Button, CountBadge, Combobox, DateRangePicker, PANEL_CLASS, type ComboboxOption, type DateRangeValue } from '../../../components';
import { AUDIT_ENTITY_TYPES, AUDIT_ACTIONS, AUDIT_SOURCES, type AuditLogFilter } from '../../../api/auditLogs';
import { ENTITY_TYPE_CONFIG, ACTION_CONFIG, SOURCE_CONFIG, countActiveFilters } from './auditLogDisplay';
import { endOfDay } from '../../../lib/dateRange';
import type { AdminUser } from '../../../api/admin';

const ENTITY_TYPE_OPTIONS: ComboboxOption[] = AUDIT_ENTITY_TYPES.map((value) => ({
  value,
  label: ENTITY_TYPE_CONFIG[value].label,
}));

const ACTION_OPTIONS: ComboboxOption[] = AUDIT_ACTIONS.map((value) => ({
  value,
  label: ACTION_CONFIG[value].label,
}));

const SOURCE_OPTIONS: ComboboxOption[] = AUDIT_SOURCES.map((value) => ({
  value,
  label: value === 'APP' ? 'App' : SOURCE_CONFIG[value].label,
}));

const FIELD_LABEL = 'text-xs font-display font-medium text-text-secondary';
const CONTROL = 'h-11 rounded-xl';

const shortDay = (d: Date) => d.toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const personName = (u: { firstName: string; lastName: string | null }) =>
  u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName;

const ActiveFilterChip = ({ label, onRemove }: { label: string; onRemove: () => void }) => (
  <span className="flex items-center gap-1 h-8 pointer-coarse:h-11 pl-3 pr-1 rounded-full border border-primary-500/30 bg-primary-500/10 text-xs font-display font-medium text-primary-700 dark:text-primary-300">
    {label}
    <button
      type="button"
      onClick={onRemove}
      aria-label={`Remove filter: ${label}`}
      className="flex items-center justify-center size-6 pointer-coarse:size-9 rounded-full text-primary-700/70 dark:text-primary-300/70 hover:bg-primary-500/15 hover:text-primary-700 dark:hover:text-primary-200 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
    >
      <X size={13} aria-hidden />
    </button>
  </span>
);

interface AuditLogFiltersProps {
  filter: AuditLogFilter;
  onChange: (patch: Partial<AuditLogFilter>) => void;
  onClearAll: () => void;
  users?: AdminUser[];
}

export const AuditLogFilters = ({ filter, onChange, onClearAll, users }: AuditLogFiltersProps) => {
  const [open, setOpen] = useState(false);
  const count = countActiveFilters(filter);

  const actorOptions = useMemo<ComboboxOption[]>(
    () => (users ?? []).map((u) => ({ value: u.id, label: personName(u) })),
    [users],
  );

  const dateRange: DateRangeValue = {
    from: filter.from ? new Date(filter.from) : null,
    to: filter.to ? new Date(filter.to) : null,
  };

  const onDateRangeChange = (range: DateRangeValue) =>
    onChange({
      from: range.from ? range.from.toISOString() : undefined,
      to: range.to ? endOfDay(range.to).toISOString() : undefined,
    });

  const actor = filter.actorId ? (users ?? []).find((u) => u.id === filter.actorId) : undefined;
  const from = dateRange.from;
  const to = dateRange.to;

  return (
    <section aria-label="Filters" className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button
          variant="outline"
          size="lg"
          className="px-4 text-sm gap-2"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls="audit-filter-panel"
        >
          <SlidersHorizontal size={15} aria-hidden />
          Filters
          <CountBadge count={count} label={`${count} ${count === 1 ? 'filter' : 'filters'} on`} />
          <ChevronDown size={15} aria-hidden className={cn('transition-transform duration-200 motion-reduce:transition-none', open && 'rotate-180')} />
        </Button>

        {filter.entityType && (
          <ActiveFilterChip
            label={ENTITY_TYPE_CONFIG[filter.entityType as keyof typeof ENTITY_TYPE_CONFIG]?.label ?? filter.entityType}
            onRemove={() => onChange({ entityType: undefined })}
          />
        )}
        {filter.action && (
          <ActiveFilterChip
            label={ACTION_CONFIG[filter.action as keyof typeof ACTION_CONFIG]?.label ?? filter.action}
            onRemove={() => onChange({ action: undefined })}
          />
        )}
        {filter.actorId && (
          <ActiveFilterChip label={actor ? `By ${personName(actor)}` : 'By one person'} onRemove={() => onChange({ actorId: undefined })} />
        )}
        {filter.source && (
          <ActiveFilterChip
            label={`From ${SOURCE_OPTIONS.find((o) => o.value === filter.source)?.label ?? filter.source}`}
            onRemove={() => onChange({ source: undefined })}
          />
        )}
        {(from || to) && (
          <ActiveFilterChip
            label={from && to ? `${shortDay(from)} to ${shortDay(to)}` : from ? `From ${shortDay(from)}` : `Until ${shortDay(to!)}`}
            onRemove={() => onChange({ from: undefined, to: undefined })}
          />
        )}
        {count > 0 && (
          <button
            type="button"
            onClick={onClearAll}
            className="h-8 pointer-coarse:h-11 px-2.5 rounded-lg text-xs font-display font-medium text-text-muted hover:text-danger hover:bg-danger/10 transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
          >
            Clear all
          </button>
        )}
      </div>

      {open && (
        <div id="audit-filter-panel" className={cn(PANEL_CLASS, 'grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-3 p-4 sm:p-5')}>
          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-what" className={FIELD_LABEL}>What</label>
            <Combobox
              id="audit-what"
              value={filter.entityType ?? ''}
              onChange={(v) => onChange({ entityType: v || undefined })}
              options={ENTITY_TYPE_OPTIONS}
              emptyOptionLabel="Anything"
              placeholder="Search..."
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-action" className={FIELD_LABEL}>Action</label>
            <Combobox
              id="audit-action"
              value={filter.action ?? ''}
              onChange={(v) => onChange({ action: v || undefined })}
              options={ACTION_OPTIONS}
              emptyOptionLabel="Any action"
              placeholder="Search..."
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-who" className={FIELD_LABEL}>Who</label>
            <Combobox
              id="audit-who"
              value={filter.actorId ?? ''}
              onChange={(v) => onChange({ actorId: v || undefined })}
              options={actorOptions}
              emptyOptionLabel="Everyone"
              placeholder="Search people..."
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="audit-source" className={FIELD_LABEL}>Source</label>
            <Combobox
              id="audit-source"
              value={filter.source ?? ''}
              onChange={(v) => onChange({ source: v || undefined })}
              options={SOURCE_OPTIONS}
              emptyOptionLabel="Any source"
              placeholder="Search..."
              className={CONTROL}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <span className={FIELD_LABEL}>When</span>
            <DateRangePicker value={dateRange} onChange={onDateRangeChange} placeholder="Any time" placeholderIsValue />
          </div>
        </div>
      )}
    </section>
  );
};
