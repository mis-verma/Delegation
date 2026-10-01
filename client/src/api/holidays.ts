import { apiFetch } from './http';

export type Holiday = {
  id: string;
  /** The org-local calendar day, YYYY-MM-DD. */
  date: string;
  name: string;
};

export type NewHoliday = { date: string; name: string };

export const holidayApi = {
  getByYear: (year: number) =>
    apiFetch<{ success: boolean; data: Holiday[] }>(`/holidays?year=${year}`),

  /** `removedRuns` = daily checklists for that day nobody had started, cleared so they can't be missed. */
  create: (payload: NewHoliday) =>
    apiFetch<{ success: boolean; data: Holiday; removedRuns: number }>('/holidays', { method: 'POST', body: JSON.stringify(payload) }),

  createMany: (holidays: NewHoliday[]) =>
    apiFetch<{ success: boolean; created: number; skipped: number; removedRuns: number }>('/holidays/bulk', {
      method: 'POST',
      body: JSON.stringify({ holidays }),
    }),

  remove: (id: string) =>
    apiFetch<{ success: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),
};
