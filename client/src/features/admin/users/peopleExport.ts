import type { AdminUser } from '../../../api/admin';
import type { TableRows } from '../../../lib/exportTable';
import { formatWeekdays } from '../../../components/weekdayPicker/WeekdayPicker';
import { ROLE_LABEL } from '../roleBadge';
import { fullName } from './userDisplay';

export type PeopleExportOrder = 'department' | 'store';

type Lookups = {
  departmentNames: Map<string, string>;
  storeNames: Map<string, string>;
  peopleById: Map<string, AdminUser>;
};

const NO_DEPARTMENT = 'No department';
const NO_STORE = 'No store';

const byText = (a: string, b: string, last: string) => (a === b ? 0 : a === last ? 1 : b === last ? -1 : a.localeCompare(b));

export const peopleRosterRows = (people: readonly AdminUser[], order: PeopleExportOrder, { departmentNames, storeNames, peopleById }: Lookups): TableRows => {
  const rows = people.map((u) => {
    const head = u.reportsToId ? peopleById.get(u.reportsToId) : undefined;
    return {
      department: (u.departmentId && departmentNames.get(u.departmentId)) || NO_DEPARTMENT,
      store: (u.storeId && storeNames.get(u.storeId)) || NO_STORE,
      name: fullName(u),
      reportsTo: head ? fullName(head) : '',
      user: u,
    };
  });
  rows.sort((a, b) => {
    const first = order === 'department'
      ? byText(a.department, b.department, NO_DEPARTMENT) || byText(a.store, b.store, NO_STORE)
      : byText(a.store, b.store, NO_STORE) || byText(a.department, b.department, NO_DEPARTMENT);
    return first || a.name.localeCompare(b.name);
  });
  const lead = order === 'department' ? ['Department', 'Store'] : ['Store', 'Department'];
  return [
    [...lead, 'Employee ID', 'First name', 'Last name', 'Email', 'Phone', 'Role', 'Reports to', 'Status', 'Week off'],
    ...rows.map(({ department, store, reportsTo, user: u }) => [
      ...(order === 'department' ? [department, store] : [store, department]),
      u.employeeId ?? '',
      u.firstName,
      u.lastName ?? '',
      u.email,
      u.phone ?? '',
      ROLE_LABEL[u.role],
      reportsTo,
      u.isActive ? 'Active' : 'Deactivated',
      u.weekOffDays?.length ? formatWeekdays(u.weekOffDays) : '',
    ]),
  ];
};
