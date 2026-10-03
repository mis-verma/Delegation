import type { AdminUser } from '../../../api/admin';
import { MONTH_LABELS } from '../../dashboard/dashboardDisplay';

export const fullName = (u: Pick<AdminUser, 'firstName' | 'lastName'>) => `${u.firstName} ${u.lastName ?? ''}`.trim();

/** "3 Mar", or "3 Mar 2025" when it was not this year. */
export const formatShortDate = (iso: string) => {
  const d = new Date(iso);
  const sameYear = d.getFullYear() === new Date().getFullYear();
  return `${d.getDate()} ${MONTH_LABELS[d.getMonth()]}${sameYear ? '' : ` ${d.getFullYear()}`}`;
};

/** "Deactivated 3 Mar", or plain "Deactivated" when the date is unknown. */
export const deactivatedLabel = (u: Pick<AdminUser, 'deactivatedAt'>) =>
  u.deactivatedAt ? `Deactivated ${formatShortDate(u.deactivatedAt)}` : 'Deactivated';

/** Shown wherever a count of people is spoken out loud: "1 person", "6 people". */
export const peopleCount = (n: number) => `${n} ${n === 1 ? 'person' : 'people'}`;
