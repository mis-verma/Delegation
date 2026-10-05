import { apiFetch } from './http';

export type Holiday = {
  id: string;
  /** The org-local calendar day, YYYY-MM-DD. */
  date: string;
  name: string;
};

export type NewHoliday = { date: string; name: string };

export type HolidayPreview = { untouchedRuns: number; startedRuns: number };

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

  /** What adding this date would clear: runs nobody touched are removed, started ones are kept. */
  preview: (date: string) =>
    apiFetch<{ success: boolean; data: HolidayPreview }>(`/holidays/preview?date=${encodeURIComponent(date)}`).then(r => r.data),

  /** `backfilled` = the day was today or later, so its daily checklists are created again; a past day is left empty. */
  remove: (id: string) =>
    apiFetch<{ success: boolean; backfilled: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),
};
