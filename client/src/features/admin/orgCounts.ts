import type { AdminUser } from '../../api/admin';

export interface PeopleCount {
  active: number;
  inactive: number;
}

export const countPeopleBy = (users: AdminUser[], key: 'departmentId' | 'storeId'): Map<string, PeopleCount> => {
  const counts = new Map<string, PeopleCount>();
  users.forEach((u) => {
    const id = u[key];
    if (!id) return;
    const entry = counts.get(id) ?? { active: 0, inactive: 0 };
    if (u.isActive) entry.active += 1;
    else entry.inactive += 1;
    counts.set(id, entry);
  });
  return counts;
};

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

export const peopleText = ({ active, inactive }: PeopleCount): string => {
  if (inactive === 0) return plural(active, 'person', 'people');
  if (active === 0) return plural(inactive, 'deactivated person', 'deactivated people');
  return `${plural(active, 'person', 'people')} and ${inactive} deactivated`;
};

export const hasPeople = ({ active, inactive }: PeopleCount): boolean => active + inactive > 0;

export const isDuplicateName = (
  items: ReadonlyArray<{ id: string; name: string }> | undefined,
  name: string,
  ignoreId?: string,
): boolean => {
  const wanted = name.trim().toLowerCase();
  if (!wanted) return false;
  return (items ?? []).some((i) => i.id !== ignoreId && i.name.trim().toLowerCase() === wanted);
};
