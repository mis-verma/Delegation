import { describe, expect, it } from 'vitest';
import { peopleRosterRows } from './peopleExport';
import type { AdminUser } from '../../../api/admin';

const user = (over: Partial<AdminUser> & { id: string; firstName: string }): AdminUser => ({
  email: `${over.id}@example.com`,
  lastName: null,
  role: 'USER',
  avatarUrl: null,
  departmentId: null,
  storeId: null,
  isActive: true,
  createdAt: '2026-01-01T00:00:00.000Z',
  ...over,
});

describe('peopleRosterRows', () => {
  const lookups = {
    departmentNames: new Map([['d1', 'Operations'], ['d2', 'Accounts & Billing']]),
    storeNames: new Map([['s1', 'Solan'], ['s2', 'Rohru']]),
    peopleById: new Map<string, AdminUser>(),
  };

  it('sorts department-first, with no-department rows last', () => {
    const people = [
      user({ id: '1', firstName: 'Zed', departmentId: 'd1', storeId: 's1' }),
      user({ id: '2', firstName: 'Amy', departmentId: 'd2', storeId: 's1' }),
      user({ id: '3', firstName: 'Nobody', departmentId: null, storeId: null }),
    ];
    const rows = peopleRosterRows(people, 'department', lookups);
    expect(rows[0]).toEqual(['Department', 'Store', 'Employee ID', 'First name', 'Last name', 'Email', 'Phone', 'Role', 'Reports to', 'Status', 'Week off']);
    expect(rows.slice(1).map((r) => r[3])).toEqual(['Amy', 'Zed', 'Nobody']);
    expect(rows[3]?.[0]).toBe('No department');
  });

  it('sorts store-first when asked, swapping the lead columns', () => {
    const people = [
      user({ id: '1', firstName: 'Bo', departmentId: 'd1', storeId: 's2' }),
      user({ id: '2', firstName: 'Al', departmentId: 'd1', storeId: 's1' }),
    ];
    const rows = peopleRosterRows(people, 'store', lookups);
    expect(rows[0]?.slice(0, 2)).toEqual(['Store', 'Department']);
    expect(rows.slice(1).map((r) => r[0])).toEqual(['Rohru', 'Solan']);
  });

  it('shows who a person reports to and formats week off', () => {
    const head = user({ id: 'h1', firstName: 'Head', lastName: 'Person' });
    const lookupsWithHead = { ...lookups, peopleById: new Map([['h1', head]]) };
    const people = [user({ id: '1', firstName: 'Worker', reportsToId: 'h1', weekOffDays: [0] })];
    const rows = peopleRosterRows(people, 'department', lookupsWithHead);
    expect(rows[1]?.[8]).toBe('Head Person');
  });
});
