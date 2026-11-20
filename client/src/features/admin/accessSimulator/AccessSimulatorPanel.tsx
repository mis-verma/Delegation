import { useMemo, useState } from 'react';
import { Search, Info } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Input, RoleChip, StateChip } from '../../../components';
import { ROLE_META, ROLE_ORDER } from '../roleBadge';
import { useCustomRolesQuery } from '../hook';
import { CAPABILITY_MATRIX, roleIsReadOnly, lookupRoleFor } from './rolePermissionMatrix';
import type { Role } from '../../../api/admin';

const PILL_CLASS = 'flex items-center gap-2 min-h-11 sm:min-h-9 px-2.5 rounded-xl border text-left transition-colors duration-150 cursor-pointer outline-none focus-visible:ring-2 focus-visible:ring-primary-500/40';
const pillState = (on: boolean) => (on ? 'border-primary-500 bg-primary-500/8 dark:bg-primary-500/15' : 'border-border bg-surface hover:border-primary-300');

export const AccessSimulatorPanel = () => {
  const [role, setRole] = useState<Role>('USER');
  const [customRoleId, setCustomRoleId] = useState<string>('');
  const { data: customRoles } = useCustomRolesQuery();
  const [search, setSearch] = useState('');

  const pickedCustomRole = customRoleId ? customRoles?.find((r) => r.id === customRoleId) : undefined;
  const effectiveRole = pickedCustomRole?.baseRole ?? role;
  const readOnly = roleIsReadOnly(effectiveRole);
  const lookupRole = lookupRoleFor(effectiveRole);

  const q = search.trim().toLowerCase();
  const groups = useMemo(() => CAPABILITY_MATRIX
    .map((g) => ({ ...g, capabilities: g.capabilities.filter((c) => !q || c.label.toLowerCase().includes(q) || g.group.toLowerCase().includes(q)) }))
    .filter((g) => g.capabilities.length > 0), [q]);

  return (
    <div className="flex flex-col gap-4">
      <p className="t-meta font-display text-text-muted">
        Pick a role, or one of your custom roles, to see what someone with it can actually do. This mirrors the rules built into the app today.
      </p>

      <div className="flex flex-col gap-2">
        <div role="radiogroup" aria-label="Role" className="grid grid-cols-2 gap-2 sm:grid-cols-4">
          {ROLE_ORDER.map((r) => {
            const on = r === role && !pickedCustomRole;
            return (
              <button
                key={r}
                type="button"
                role="radio"
                aria-checked={on}
                onClick={() => { setRole(r); setCustomRoleId(''); }}
                className={cn(PILL_CLASS, pillState(on))}
              >
                <span className={cn('t-meta font-display font-semibold', on ? 'text-text' : 'text-text-secondary')}>{ROLE_META[r].label}</span>
              </button>
            );
          })}
        </div>

        {customRoles && customRoles.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {customRoles.filter((r) => r.isActive).map((r) => (
              <button
                key={r.id}
                type="button"
                onClick={() => setCustomRoleId(r.id)}
                className={cn(PILL_CLASS, 'min-h-9 px-2.5', pillState(customRoleId === r.id))}
              >
                <span className="t-meta font-display font-semibold text-text-secondary">{r.name}</span>
                <span className="t-meta text-text-light">· {ROLE_META[r.baseRole].label}</span>
              </button>
            ))}
          </div>
        )}
      </div>

      <div className="flex items-center gap-2 rounded-xl border border-border bg-surface-hover/40 px-3 py-2.5">
        <RoleChip role={effectiveRole} label={pickedCustomRole?.name} />
        <span className="t-meta font-display text-text-muted">{ROLE_META[effectiveRole].description}</span>
        {readOnly && (
          <span className="ml-auto flex items-center gap-1 t-meta font-display font-semibold text-warning">
            <Info size={13} aria-hidden />
            Read only, can&apos;t change anything
          </span>
        )}
      </div>

      <Input
        id="capability-search"
        placeholder="Search capabilities"
        icon={Search}
        value={search}
        onChange={(e) => setSearch(e.target.value)}
      />

      <div className="flex flex-col gap-4">
        {groups.map((g) => (
          <div key={g.group} className="flex flex-col gap-1.5">
            <h4 className="t-meta font-display font-bold text-text-secondary">{g.group}</h4>
            <ul className="flex flex-col divide-y divide-border/60 rounded-xl border border-border/60 bg-surface overflow-hidden">
              {g.capabilities.map((c) => {
                const allowed = c.roles.includes(lookupRole) && (!readOnly || c.kind === 'view');
                return (
                  <li key={c.label} className="flex items-center justify-between gap-3 px-3 py-2.5">
                    <span className="min-w-0 flex-1 t-meta font-display text-text" title={c.note}>
                      {c.label}
                      {c.note && <span className="block t-meta text-text-light">{c.note}</span>}
                    </span>
                    <StateChip active={allowed} label={allowed ? 'Allowed' : 'Not allowed'} />
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
        {groups.length === 0 && (
          <p className="t-meta font-display text-text-muted text-center py-6">No capability matches "{search}".</p>
        )}
      </div>
    </div>
  );
};
