import { useMemo } from 'react';
import { Building2, ChevronDown, ShieldCheck, Store, X } from 'lucide-react';
import { Button, Dropdown, PANEL_CLASS, type DropdownAction } from '../../../components';
import type { Role } from '../../../api/admin';
import { ROLE_META, ROLE_ORDER } from '../roleBadge';
import { useAuth } from '../../../context/AuthContext';
import { cn } from '@/lib/utils';

interface BulkBarProps {
  count: number;
  departments: { id: string; name: string }[];
  stores: { id: string; name: string }[];
  disabled: boolean;
  /** '' means "no department". */
  onMoveDepartment: (departmentId: string) => void;
  onMoveStore: (storeId: string) => void;
  onChangeRole: (role: Role) => void;
  onClear: () => void;
}

// Sticks to the bottom of the screen while people are ticked in the table, so the actions are in
// reach however far down the list you scrolled. Every action asks for a confirmation first.
export const BulkBar = ({ count, departments, stores, disabled, onMoveDepartment, onMoveStore, onChangeRole, onClear }: BulkBarProps) => {
  const departmentItems = useMemo<DropdownAction[]>(
    () => [
      { label: 'No department', onClick: () => onMoveDepartment('') },
      ...departments.map((d) => ({ label: d.name, onClick: () => onMoveDepartment(d.id) })),
    ],
    [departments, onMoveDepartment],
  );
  const storeItems = useMemo<DropdownAction[]>(
    () => [
      { label: 'No store', onClick: () => onMoveStore('') },
      ...stores.map((s) => ({ label: s.name, onClick: () => onMoveStore(s.id) })),
    ],
    [stores, onMoveStore],
  );
  // A PC cannot make anyone an admin (the server refuses it too).
  const { user: me } = useAuth();
  const roleItems = useMemo<DropdownAction[]>(
    () => ROLE_ORDER.filter((r) => !(me?.role === 'PC' && r === 'ADMIN')).map((r) => ({ label: ROLE_META[r].label, onClick: () => onChangeRole(r) })),
    [onChangeRole, me?.role],
  );

  return (
    <div
      role="region"
      aria-label="Actions for selected people"
      className={cn(PANEL_CLASS, 'sticky bottom-3 z-30 flex flex-wrap items-center gap-2 p-3')}
    >
      <span className="text-sm font-display font-semibold text-text pr-1" aria-live="polite">
        {count} selected
      </span>
      <Dropdown
        align="start"
        items={departmentItems}
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Building2 className="size-3.5" aria-hidden />
            Move to department
            <ChevronDown className="size-3.5 text-text-light" aria-hidden />
          </Button>
        }
      />
      <Dropdown
        align="start"
        items={storeItems}
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <Store className="size-3.5" aria-hidden />
            Move to store
            <ChevronDown className="size-3.5 text-text-light" aria-hidden />
          </Button>
        }
      />
      <Dropdown
        align="start"
        items={roleItems}
        trigger={
          <Button type="button" variant="outline" size="sm" disabled={disabled}>
            <ShieldCheck className="size-3.5" aria-hidden />
            Change role
            <ChevronDown className="size-3.5 text-text-light" aria-hidden />
          </Button>
        }
      />
      <Button type="button" variant="ghost" size="sm" onClick={onClear} disabled={disabled} className="sm:ml-auto">
        <X className="size-3.5" aria-hidden />
        Clear selection
      </Button>
    </div>
  );
};
