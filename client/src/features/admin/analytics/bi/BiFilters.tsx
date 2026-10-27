import { Button } from '../../../../components';
import { SelectDropdown } from '../../../../components/dropdown';

interface Option { value: string; label: string }

const TRIGGER = 'min-h-11 sm:h-9 sm:min-h-9 rounded-lg font-display';

interface BiFiltersProps {
  stores?: Option[];
  departments?: Option[];
  storeId: string;
  departmentId: string;
  onChange: (patch: { store?: string; dept?: string }) => void;
  onClear: () => void;
}

export const BiFilters = ({ stores, departments, storeId, departmentId, onChange, onClear }: BiFiltersProps) => {
  if (!stores && !departments) return null;
  const filtered = !!storeId || !!departmentId;
  return (
    <div className="flex flex-wrap items-end gap-2" role="group" aria-label="Filters">
      {stores && (
        <div className="min-w-40 flex-1 sm:flex-none">
          <SelectDropdown
            label="Store"
            aria-label="Store"
            triggerClassName={TRIGGER}
            value={storeId}
            onChange={(v) => onChange({ store: v })}
            options={[{ value: '', label: 'All stores' }, ...stores]}
          />
        </div>
      )}
      {departments && (
        <div className="min-w-40 flex-1 sm:flex-none">
          <SelectDropdown
            label="Department"
            aria-label="Department"
            triggerClassName={TRIGGER}
            value={departmentId}
            onChange={(v) => onChange({ dept: v })}
            options={[{ value: '', label: 'All departments' }, ...departments]}
          />
        </div>
      )}
      {filtered && (
        <Button type="button" variant="ghost" size="sm" onClick={onClear} className="pointer-coarse:min-h-11">
          Clear filters
        </Button>
      )}
    </div>
  );
};
