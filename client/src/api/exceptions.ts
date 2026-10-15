import { apiFetch } from './http';

export type ExceptionKind = 'TICKET_OVERDUE' | 'TICKET_STALE' | 'CHECKLIST_MISSED' | 'APPROVAL_WAITING';

export interface ExceptionItem {
  id: string;
  kind: ExceptionKind;
  severity: 'high' | 'medium';
  title: string;
  detail: string;
  storeName: string | null;
  since: string;
  link: string;
}

export const exceptionApi = {
  list: (): Promise<ExceptionItem[]> =>
    apiFetch<{ success: boolean; data: ExceptionItem[] }>('/exceptions').then((r) => r.data),
};

export interface PersonStatus {
  userId: string;
  name: string;
  /** Runs open today with no question ticked yet. */
  notStartedRuns: number;
  openDelegations: number;
  overdueDelegations: number;
}

export const peopleApi = {
  list: (): Promise<PersonStatus[]> =>
    apiFetch<{ success: boolean; data: PersonStatus[] }>('/exceptions/people').then((r) => r.data),
};
