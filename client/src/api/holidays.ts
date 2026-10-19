import { apiFetch } from './http';

export type Holiday = {
  id: string;
  date: string;
  name: string;
};

export type NewHoliday = { date: string; name: string };

export type HolidayPreview = { untouchedRuns: number; startedRuns: number };

export const holidayApi = {
  getByYear: (year: number) =>
    apiFetch<{ success: boolean; data: Holiday[] }>(`/holidays?year=${year}`),

  create: (payload: NewHoliday) =>
    apiFetch<{ success: boolean; data: Holiday; removedRuns: number }>('/holidays', { method: 'POST', body: JSON.stringify(payload) }),

  createMany: (holidays: NewHoliday[]) =>
    apiFetch<{ success: boolean; created: number; skipped: number; removedRuns: number }>('/holidays/bulk', {
      method: 'POST',
      body: JSON.stringify({ holidays }),
    }),

  preview: (date: string) =>
    apiFetch<{ success: boolean; data: HolidayPreview }>(`/holidays/preview?date=${encodeURIComponent(date)}`).then(r => r.data),

  remove: (id: string) =>
    apiFetch<{ success: boolean; backfilled: boolean }>(`/holidays/${id}`, { method: 'DELETE' }),
};
