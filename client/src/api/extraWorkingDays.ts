import { apiFetch } from './http';

export type ExtraWorkingDayScope = 'ALL' | 'DEPARTMENT' | 'STORE' | 'PEOPLE';

export type ExtraWorkingDay = {
  id: string;
  date: string;
  reason: string;
  scope: ExtraWorkingDayScope;
  targetIds: string[];
  createdBy: string;
  createdAt: string;
};

export type NewExtraWorkingDay = { date: string; reason: string; scope: ExtraWorkingDayScope; targetIds: string[] };

export const extraWorkingDayApi = {
  getByYear: (year: number) =>
    apiFetch<{ success: boolean; data: ExtraWorkingDay[] }>(`/extra-working-days?year=${year}`),

  mine: () =>
    apiFetch<{ success: boolean; data: { id: string; date: string; reason: string }[] }>('/extra-working-days/mine').then((r) => r.data),

  create: (payload: NewExtraWorkingDay) =>
    apiFetch<{ success: boolean; data: ExtraWorkingDay }>('/extra-working-days', { method: 'POST', body: JSON.stringify(payload) }),

  remove: (id: string) =>
    apiFetch<{ success: boolean; removedRuns: number }>(`/extra-working-days/${id}`, { method: 'DELETE' }),
};
