import { Plus, X } from 'lucide-react';
import { Combobox } from '../../components';
import { FIELD_TRIGGER_CLASS } from '../tickets/form/formConstants';
import type { Department } from '../../api/departments';

interface ExtraDepartmentsFieldProps {
  departments?: Department[];
  isLoading: boolean;
  primaryId: string;
  extraIds: string[];
  peopleCount: (departmentId: string) => number;
  onAdd: (departmentId: string) => void;
  onRemove: (departmentId: string) => void;
}

export const ExtraDepartmentsField = ({ departments, isLoading, primaryId, extraIds, peopleCount, onAdd, onRemove }: ExtraDepartmentsFieldProps) => {
  const nameOf = (id: string) => departments?.find((d) => d.id === id)?.name ?? 'Department';
  const available = (departments ?? []).filter((d) => d.id !== primaryId && !extraIds.includes(d.id));

  return (
    <div className="flex flex-col gap-2 min-w-0">
      {extraIds.length > 0 && (
        <ul className="flex flex-wrap gap-1.5" aria-label="Other departments on this delegation">
          {extraIds.map((id) => {
            const count = peopleCount(id);
            return (
              <li key={id} className="inline-flex max-w-full items-center gap-1.5 h-8 pl-3 pr-1 rounded-full border border-border/60 bg-surface-hover/50">
                <span className="min-w-0 truncate t-meta font-display font-semibold text-text">{nameOf(id)}</span>
                <span className="shrink-0 t-meta text-text-muted">{count === 0 ? 'no one yet' : `${count} ${count === 1 ? 'person' : 'people'}`}</span>
                <button
                  type="button"
                  onClick={() => onRemove(id)}
                  aria-label={`Remove ${nameOf(id)}`}
                  className="flex size-6 shrink-0 items-center justify-center rounded-full text-text-muted transition-colors duration-150 hover:bg-surface-active hover:text-text cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40"
                >
                  <X size={13} strokeWidth={2.5} aria-hidden="true" />
                </button>
              </li>
            );
          })}
        </ul>
      )}
      {available.length > 0 && (
        <div className="flex items-center gap-2 min-w-0">
          <Plus size={14} className="shrink-0 text-text-light" aria-hidden="true" />
          <Combobox
            value=""
            onChange={(id) => { if (id) onAdd(id); }}
            isLoading={isLoading}
            placeholder="Add people from another department"
            options={available.map((d) => ({ value: d.id, label: d.name }))}
            className={`w-full ${FIELD_TRIGGER_CLASS}`}
          />
        </div>
      )}
    </div>
  );
};
