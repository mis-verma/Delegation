import { Combobox, DateRangePicker, type ComboboxOption, type DateRangeValue } from '../../../components';
import { AUDIT_ENTITY_TYPES, AUDIT_ACTIONS, type AuditLogFilter } from '../../../api/auditLogs';
import { ENTITY_TYPE_CONFIG, ACTION_CONFIG } from './auditLogDisplay';
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

interface AuditLogFiltersProps {
  filter: AuditLogFilter;
  onChange: (patch: Partial<AuditLogFilter>) => void;
  users?: AdminUser[];
}

export const AuditLogFilters = ({ filter, onChange, users }: AuditLogFiltersProps) => {
  const actorOptions: ComboboxOption[] = (users ?? []).map((u) => ({
    value: u.id,
    label: u.lastName ? `${u.firstName} ${u.lastName}` : u.firstName,
  }));

  // The picker works in Date objects; the filter (and the API) works in ISO date strings — this
  // component is the one place that converts between the two, same as ReportExportPanel does for
  // its own DateRangePicker.
  const dateRange: DateRangeValue = {
    from: filter.from ? new Date(filter.from) : null,
    to: filter.to ? new Date(filter.to) : null,
  };

  const onDateRangeChange = (range: DateRangeValue) =>
    onChange({
      from: range.from ? range.from.toISOString() : undefined,
      // endOfDay: the picker returns a plain calendar date at local midnight (no showTime), so a
      // "to" bound serialized as-is would silently exclude almost the entire last day.
      to: range.to ? endOfDay(range.to).toISOString() : undefined,
    });

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 p-4 rounded-2xl border border-border bg-surface">
      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-display font-medium text-text-secondary">Section</label>
        <Combobox
          value={filter.entityType ?? ''}
          onChange={(v) => onChange({ entityType: v || undefined })}
          options={ENTITY_TYPE_OPTIONS}
          emptyOptionLabel="All sections"
          placeholder="Search sections..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-display font-medium text-text-secondary">Action</label>
        <Combobox
          value={filter.action ?? ''}
          onChange={(v) => onChange({ action: v || undefined })}
          options={ACTION_OPTIONS}
          emptyOptionLabel="All actions"
          placeholder="Search actions..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-display font-medium text-text-secondary">Changed by</label>
        <Combobox
          value={filter.actorId ?? ''}
          onChange={(v) => onChange({ actorId: v || undefined })}
          options={actorOptions}
          emptyOptionLabel="Everyone"
          placeholder="Search people..."
        />
      </div>

      <div className="flex flex-col gap-1.5">
        <label className="text-xs font-display font-medium text-text-secondary">Date range</label>
        <DateRangePicker value={dateRange} onChange={onDateRangeChange} placeholder="All time" placeholderIsValue />
      </div>
    </div>
  );
};
