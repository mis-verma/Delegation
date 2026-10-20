import { useMemo } from 'react';
import { X } from 'lucide-react';
import { useAssignableUsersQuery, useDepartmentsQuery } from '../../hook';

interface SelectedPeopleChipsProps {
  ids: string[];
  onRemove?: (id: string) => void;
  label: string;
  groupByDepartment?: boolean;
}

const fullName = (u: { firstName: string; lastName: string | null }) => `${u.firstName} ${u.lastName ?? ''}`.trim();

export const SelectedPeopleChips = ({ ids, onRemove, label, groupByDepartment = false }: SelectedPeopleChipsProps) => {
  const everyone = useAssignableUsersQuery();
  const { data: departments = [] } = useDepartmentsQuery();

  const groups = useMemo(() => {
    const byId = new Map((everyone.data ?? []).map((u) => [u.id, u]));
    const deptName = new Map(departments.map((d) => [d.id, d.name]));
    const map = new Map<string, { id: string; name: string; role?: string }[]>();
    for (const id of ids) {
      const person = byId.get(id);
      const group = groupByDepartment ? (person?.departmentId ? deptName.get(person.departmentId) ?? 'Other' : 'No department') : '';
      const list = map.get(group) ?? [];
      list.push({ id, name: person ? fullName(person) : 'Person', role: person?.role });
      map.set(group, list);
    }
    return [...map.entries()];
  }, [ids, everyone.data, departments, groupByDepartment]);

  if (ids.length === 0) return null;

  return (
    <div aria-label={label} className="flex flex-col gap-2">
      {groups.map(([group, people]) => (
        <div key={group || 'all'} className="flex flex-col gap-1.5">
          {groupByDepartment && (
            <span className="flex items-center gap-1.5 t-meta font-display font-semibold text-text-muted">
              {group}
              <span className="rounded-full bg-surface-hover px-1.5 text-[10px] font-bold leading-4 tabular-nums text-text-secondary">{people.length}</span>
            </span>
          )}
          <ul className="flex flex-wrap gap-1.5">
            {people.map((p) => (
              <li
                key={p.id}
                className="inline-flex h-8 items-center gap-1.5 rounded-full border border-primary-500/30 bg-primary-500/10 pl-3 pr-1 t-meta font-display font-semibold text-primary-700 dark:text-primary-300"
              >
                {p.name}
                {p.role === 'PC' && <span className="rounded-full bg-primary-600 px-1.5 py-px text-[10px] font-bold leading-4 text-white">PC</span>}
                {onRemove && <button
                  type="button"
                  onClick={() => onRemove(p.id)}
                  aria-label={`Remove ${p.name}`}
                  className="relative flex size-6 cursor-pointer items-center justify-center rounded-full text-primary-700/70 outline-none transition-colors duration-150 hover:bg-primary-500/20 hover:text-primary-700 focus-visible:ring-2 focus-visible:ring-primary-500/40 pointer-coarse:after:absolute pointer-coarse:after:-inset-2.5 dark:text-primary-300"
                >
                  <X size={13} aria-hidden />
                </button>}
              </li>
            ))}
          </ul>
        </div>
      ))}
    </div>
  );
};
