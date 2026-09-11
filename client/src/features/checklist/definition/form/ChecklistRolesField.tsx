import { Briefcase, Check, UserCheck } from 'lucide-react';
import { LABEL_CLASS } from './formConstants';
import type { ChecklistAssigneeRole } from '../../../../api/checklistDefinitions';

// Colocated with the component like ui/badge.tsx's own badgeVariants export — only affects Fast
// Refresh granularity (a full reload instead of a hot-swap when this file changes), not runtime
// correctness.
// eslint-disable-next-line react-refresh/only-export-components
export const ROLE_OPTIONS: { value: ChecklistAssigneeRole; label: string }[] = [
  { value: 'STORE_MANAGER', label: 'Store Manager' },
  { value: 'FLOOR_MANAGER', label: 'Floor Manager' },
  { value: 'CASHIER', label: 'Cashier' },
  { value: 'SECURITY', label: 'Security' },
  { value: 'HOUSEKEEPING', label: 'Housekeeping' },
  { value: 'OPERATIONS', label: 'Operations' },
];

interface ChecklistRolesFieldProps {
  selected: ChecklistAssigneeRole[];
  onChange: (roles: ChecklistAssigneeRole[]) => void;
  className?: string;
}

export const ChecklistRolesField = ({
  selected,
  onChange,
  className = '',
}: ChecklistRolesFieldProps) => {
  const toggle = (role: ChecklistAssigneeRole) => {
    onChange(
      selected.includes(role)
        ? selected.filter((r) => r !== role)
        : [...selected, role]
    );
  };

  const handleToggleAll = () => {
    if (selected.length === ROLE_OPTIONS.length) {
      onChange([]);
    } else {
      onChange(ROLE_OPTIONS.map((r) => r.value));
    }
  };

  return (
    <div
      role="group"
      aria-labelledby="checklist-roles-heading"
      className={`flex flex-col gap-2 w-full ${className}`}
    >
      {/* Header with Title and Quick Actions */}
      <div className="flex items-center justify-between gap-2">
        <label
          id="checklist-roles-heading"
          className={`${LABEL_CLASS} flex items-center gap-1.5 cursor-pointer`}
        >
          <Briefcase size={14} className="text-text-muted shrink-0" />
          <span>Assign by Role</span>
        </label>

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={handleToggleAll}
            className="text-[11px] font-display font-medium text-text-muted hover:text-text underline cursor-pointer transition-colors rounded-sm focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500/50"
          >
            {selected.length === ROLE_OPTIONS.length ? 'Clear all' : 'Select all'}
          </button>

          {selected.length > 0 && (
            <span className="text-[11px] font-display font-medium text-text-muted flex items-center gap-1">
              <UserCheck size={12} className="text-primary-700 dark:text-primary-400" />
              <span>{selected.length} selected</span>
            </span>
          )}
        </div>
      </div>

      {/* Role Option Chips */}
      <div className="flex flex-wrap gap-2 pt-0.5">
        {ROLE_OPTIONS.map((opt) => {
          const checked = selected.includes(opt.value);

          return (
            <label
              key={opt.value}
              className={[
                'group flex items-center gap-2 px-3 py-1.5 rounded-lg border text-xs font-display font-medium cursor-pointer select-none transition-all duration-150',
                'focus-within:ring-2 focus-within:ring-primary-500/50',
                checked
                  ? 'border-primary-500/60 bg-primary-50 dark:bg-primary-950/40 text-primary-800 dark:text-primary-300 shadow-2xs font-semibold'
                  : 'border-border bg-surface text-text-secondary hover:bg-surface-hover hover:border-border/80 hover:text-text',
              ].join(' ')}
            >
              <input
                type="checkbox"
                checked={checked}
                onChange={() => toggle(opt.value)}
                className="sr-only"
              />
              <span
                className={[
                  'flex size-3.5 items-center justify-center rounded-sm border transition-all duration-150',
                  checked
                    ? 'border-primary-600 bg-primary-600 text-white'
                    : 'border-border bg-surface group-hover:border-text-muted',
                ].join(' ')}
              >
                {checked && <Check size={10} strokeWidth={3.5} />}
              </span>
              <span>{opt.label}</span>
            </label>
          );
        })}
      </div>

      {/* Helper Subtext */}
      <p className="text-[11px] font-display text-text-muted">
        Tag for reference only — shown on the checklist card, doesn't assign or grant access to anyone. Use Assigned Users below for that.
      </p>
    </div>
  );
};