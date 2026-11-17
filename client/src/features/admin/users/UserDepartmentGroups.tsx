import { useMemo, useState, type ReactNode } from 'react';
import { Building2, ChevronDown, Crown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { avatarColorClass } from '../../../lib/avatarColors';
import { isDepartmentHead } from '../roleBadge';
import { fullName } from './userDisplay';
import type { AdminUser } from '../../../api/admin';

const PREVIEW = 8;
const NO_DEPARTMENT = '__none__';

interface Group {
  key: string;
  name: string;
  people: AdminUser[];
  heads: AdminUser[];
}

interface UserDepartmentGroupsProps {
  users: AdminUser[];
  departmentNames: Map<string, string>;
  renderCard: (user: AdminUser) => ReactNode;
}

const buildGroups = (users: AdminUser[], departmentNames: Map<string, string>): Group[] => {
  const byKey = new Map<string, Group>();
  for (const person of users) {
    const key = person.departmentId ?? NO_DEPARTMENT;
    let group = byKey.get(key);
    if (!group) {
      group = {
        key,
        name: person.departmentId ? departmentNames.get(person.departmentId) ?? 'Unknown department' : 'No department',
        people: [],
        heads: [],
      };
      byKey.set(key, group);
    }
    group.people.push(person);
    if (isDepartmentHead(person.role) && person.isActive) group.heads.push(person);
  }
  return [...byKey.values()].sort((a, b) =>
    (a.key === NO_DEPARTMENT ? 1 : 0) - (b.key === NO_DEPARTMENT ? 1 : 0) || a.name.localeCompare(b.name));
};

const headLine = (group: Group): string => {
  if (group.key === NO_DEPARTMENT) return 'Give these people a department so their work is counted with a team.';
  if (group.heads.length === 0) return 'No head yet';
  return `Head: ${group.heads.map(fullName).join(', ')}`;
};

const GroupSection = ({ group, renderCard }: { group: Group; renderCard: (user: AdminUser) => ReactNode }) => {
  const [open, setOpen] = useState(false);
  const shown = open ? group.people : group.people.slice(0, PREVIEW);
  const rest = group.people.length - shown.length;
  const active = group.people.filter((p) => p.isActive).length;

  return (
    <section aria-label={group.name} className="flex flex-col gap-2.5">
      <div className="flex min-w-0 items-center gap-2.5">
        <span
          aria-hidden="true"
          className={cn(
            'flex size-8 shrink-0 items-center justify-center rounded-lg text-white',
            group.key === NO_DEPARTMENT ? 'bg-text-muted' : avatarColorClass(group.name),
          )}
        >
          <Building2 className="size-4" strokeWidth={2.25} />
        </span>
        <span className="flex min-w-0 flex-col">
          <span className="truncate t-card font-display font-bold text-text">{group.name}</span>
          <span className="flex min-w-0 items-center gap-1.5">
            {group.heads.length > 0 && <Crown className="size-3 shrink-0 text-warning" aria-hidden="true" />}
            <span className="truncate t-meta text-text-muted">{headLine(group)}</span>
          </span>
        </span>
        <span className="ml-auto shrink-0 rounded-full bg-surface px-2 py-0.5 t-meta font-display font-semibold tabular-nums text-text-secondary ring-1 ring-inset ring-border/60">
          {active === group.people.length ? group.people.length : `${active} of ${group.people.length}`}
        </span>
      </div>

      <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2 lg:grid-cols-3">
        {shown.map((person) => renderCard(person))}
      </div>

      {(rest > 0 || open) && (
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          className="inline-flex min-h-11 w-full cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-border/60 t-meta font-display font-semibold text-text-secondary outline-none transition-colors duration-150 hover:border-border-hover hover:text-text focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-fine:min-h-9"
        >
          {open ? 'Show fewer' : `Show ${rest} more`}
          <ChevronDown className={cn('size-3.5 transition-transform duration-200', open && 'rotate-180')} aria-hidden="true" />
        </button>
      )}
    </section>
  );
};

export const UserDepartmentGroups = ({ users, departmentNames, renderCard }: UserDepartmentGroupsProps) => {
  const groups = useMemo(() => buildGroups(users, departmentNames), [users, departmentNames]);
  return (
    <div className="flex flex-col gap-5">
      {groups.map((group) => <GroupSection key={group.key} group={group} renderCard={renderCard} />)}
    </div>
  );
};
