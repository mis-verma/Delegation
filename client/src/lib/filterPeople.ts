import type { AssignableUser } from '../api/users';
import type { FilterPerson } from '../components/filterRow';

export const toFilterPeople = (users: AssignableUser[] | undefined): FilterPerson[] =>
  (users ?? []).map((user) => ({
    id: user.id,
    name: `${user.firstName} ${user.lastName ?? ''}`.trim(),
  }));
